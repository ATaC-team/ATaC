import type {
  ExtensionContext,
  SessionEntry,
  ToolInfo,
} from "@earendil-works/pi-coding-agent";
import { hash } from "../library/program.js";
import { excerpt, messageText, redact, type Snapshot } from "./snapshot.js";

export const TASK_ENTRY = "atac-completed-task";
export interface Coverage {
  session_id: string;
  message_ids: string[];
}
export const coverageOf = (snapshot: Snapshot): Coverage => ({
  session_id: snapshot.source.session_id,
  message_ids: snapshot.message_ids ?? [snapshot.source.request_id],
});

/** Read only the active branch; custom entries preserve nested tool traces. */
export function completedTasks(
  ctx: ExtensionContext,
  tools: ToolInfo[],
): Snapshot[] {
  const branch = ctx.sessionManager.getBranch();
  const visible = new Set(branch.map((e) => e.id));
  const recorded = branch.flatMap((e) => {
    if (e.type !== "custom" || e.customType !== TASK_ENTRY) return [];
    const snapshot = e.data as Snapshot;
    return snapshot?.message_ids?.every((id) => visible.has(id))
      ? [snapshot]
      : [];
  });
  const covered = new Set(recorded.flatMap((s) => s.message_ids!));
  const tasks: Snapshot[] = [...recorded];
  let pending: SessionEntry[] = [];
  const flush = () => {
    const first = pending.find(
      (e) => e.type === "message" && e.message.role === "user",
    );
    const last = pending.at(-1);
    if (
      first?.type !== "message" ||
      first.message.role !== "user" ||
      last?.type !== "message" ||
      last.message.role !== "assistant" ||
      !["stop", "length"].includes(last.message.stopReason)
    ) {
      pending = [];
      return;
    }
    const names = new Set<string>();
    const calls = pending.flatMap((e) => {
      if (e.type !== "message") return [];
      if (e.message.role === "assistant")
        return e.message.content.flatMap((part) => {
          if (part.type !== "toolCall" || part.name.startsWith("atac_"))
            return [];
          names.add(part.name);
          return [
            {
              type: "tool_call",
              name: part.name,
              id: part.id,
              ...excerpt(part.arguments),
            },
          ];
        });
      if (
        e.message.role === "toolResult" &&
        !e.message.toolName.startsWith("atac_")
      ) {
        names.add(e.message.toolName);
        return [
          {
            type: "tool_result",
            name: e.message.toolName,
            id: e.message.toolCallId,
            ...excerpt(e.message),
          },
        ];
      }
      return [];
    });
    const messages = pending.map((e) => ({
      id: e.id,
      ...excerpt(e.type === "message" ? e.message : e),
    }));
    tasks.push({
      source: {
        cwd: ctx.cwd,
        session_id: ctx.sessionManager.getSessionId(),
        request_id: first.id,
        goal: excerpt(messageText(first.message.content), 1000).text,
      },
      message_ids: pending.map((e) => e.id),
      messages,
      calls,
      tools: tools
        .filter((t) => names.has(t.name))
        .map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
      truncated:
        messages.some((m) => m.truncated) || calls.some((c) => c.truncated),
    });
    pending = [];
  };
  for (const entry of branch) {
    if (covered.has(entry.id)) {
      flush();
      continue;
    }
    if (
      entry.type !== "message" ||
      entry.message.role === "system" ||
      entry.message.role === "custom"
    )
      continue;
    if (entry.message.role === "user" && pending.at(-1)?.type === "message") {
      const last = pending.at(-1)!;
      if (
        last.type === "message" &&
        last.message.role === "assistant" &&
        ["stop", "length", "error", "aborted"].includes(last.message.stopReason)
      )
        flush();
    }
    if (pending.length || entry.message.role === "user") pending.push(entry);
  }
  flush();
  const order = new Map(branch.map((e, i) => [e.id, i]));
  return tasks.sort(
    (a, b) =>
      (order.get(a.source.request_id) ?? 0) -
      (order.get(b.source.request_id) ?? 0),
  );
}

export function batchSnapshot(tasks: Snapshot[], max = 144_000): Snapshot {
  const coverage = tasks.map(coverageOf);
  const snapshot: Snapshot = {
    source: {
      ...tasks[0]!.source,
      request_id: hash(coverage),
      goal: tasks.map((t) => t.source.goal).join("\n\n"),
    },
    messages: [],
    calls: [],
    tools: [
      ...new Map(
        tasks
          .flatMap((t) => t.tools)
          .map((t) => [(t as { name: string }).name, t]),
      ).values(),
    ],
    tasks: tasks.map((t) => ({
      source: t.source,
      message_ids: coverageOf(t).message_ids,
      text: "",
      truncated: t.truncated,
    })),
    truncated: tasks.some((t) => t.truncated),
  };
  const remaining = max - JSON.stringify(snapshot).length;
  if (remaining < 0)
    throw new Error(
      "Completed task metadata exceeds the extraction limit. No work was marked as extracted.",
    );
  const allowance = Math.floor(remaining / tasks.length);
  tasks.forEach((task, i) => {
    const text = excerpt(
      { messages: task.messages, calls: task.calls },
      Number.MAX_SAFE_INTEGER,
    ).text;
    let low = 0,
      high = text.length;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (JSON.stringify(text.slice(0, mid)).length - 2 <= allowance) low = mid;
      else high = mid - 1;
    }
    const item = snapshot.tasks![i]!;
    item.text = text.slice(0, low);
    item.truncated ||= low < text.length;
    snapshot.truncated ||= item.truncated;
  });
  return JSON.parse(redact(JSON.stringify(snapshot))) as Snapshot;
}
