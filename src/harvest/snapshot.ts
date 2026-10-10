import type {
  ExtensionContext,
  ToolCallEvent,
  ToolInfo,
  ToolResultEvent,
} from "@earendil-works/pi-coding-agent";
import type { Source } from "../library/program.js";

export interface Snapshot {
  source: Source;
  messages: unknown[];
  calls: unknown[];
  tools: unknown[];
  truncated: boolean;
}
export function messageText(
  content: string | { type: string; text?: string }[],
): string {
  return typeof content === "string"
    ? content
    : content
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n");
}
export function redact(value: string): string {
  return value
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+\/-]+=*/gi, "$1[REDACTED]")
    .replace(/\b(?:sk-|gh[pousr]_)[A-Za-z0-9_-]{16,}/g, "[REDACTED]")
    .replace(
      /((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|authorization|secret)\s*["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi,
      "$1[REDACTED]",
    );
}
export function excerpt(
  value: unknown,
  max = 6000,
): { text: string; truncated: boolean } {
  const text = redact(
    typeof value === "string" ? value : (JSON.stringify(value) ?? ""),
  );
  return { text: text.slice(0, max), truncated: text.length > max };
}
export class Recorder {
  private calls: { name: string; text: string; truncated: boolean }[] = [];
  private after: string | null | undefined;
  private truncated = false;
  begin(ctx: ExtensionContext): void {
    if (this.after === undefined) this.after = ctx.sessionManager.getLeafId();
  }
  reset(): void {
    this.calls = [];
    this.truncated = false;
    this.after = undefined;
  }
  record(event: ToolCallEvent | ToolResultEvent): void {
    if (event.toolName.startsWith("atac_")) return;
    const data =
      event.type === "tool_call"
        ? event.input
        : {
            input: event.input,
            content: event.content.filter((c) => c.type === "text"),
            structuredContent: event.structuredContent,
            isError: event.isError,
          };
    const call = {
      type: event.type,
      name: event.toolName,
      id: event.toolCallId,
      parent: event.parentToolCallId,
      ...excerpt(data),
    };
    this.calls.push(call);
    this.truncated ||= call.truncated;
    // Keep recent repairs and successful results when a task has a long trace.
    while (
      this.calls.length > 200 ||
      this.calls.reduce((n, c) => n + c.text.length, 0) > 96_000
    ) {
      this.calls.shift();
      this.truncated = true;
    }
  }
  snapshot(ctx: ExtensionContext, tools: ToolInfo[]): Snapshot | undefined {
    const branch = ctx.sessionManager.getBranch();
    const start =
      this.after === undefined
        ? branch.findLastIndex(
            (e) => e.type === "message" && e.message.role === "user",
          )
        : this.after === null
          ? 0
          : branch.findIndex((e) => e.id === this.after) + 1;
    const entries = branch.slice(start);
    const user = entries.find(
      (e) => e.type === "message" && e.message.role === "user",
    );
    if (!user || user.type !== "message" || user.message.role !== "user")
      return undefined;
    const messages = entries
      .filter((e) => e.type === "message")
      .filter((e) => e.message.role !== "system")
      .map((e) => ({ id: e.id, ...excerpt(e.message) }));
    let messageSize = messages.reduce((n, m) => n + m.text.length, 0);
    while (messages.length > 40 || messageSize > 48_000) {
      messageSize -= messages.shift()!.text.length;
      this.truncated = true;
    }
    const relevant = new Set([
      ...this.calls.map((c) => c.name),
      "read",
      "write",
      "edit",
      "bash",
    ]);
    const goal = excerpt(messageText(user.message.content), 1000).text;
    return {
      source: {
        cwd: ctx.cwd,
        session_id: ctx.sessionManager.getSessionId(),
        request_id: user.id,
        goal,
      },
      messages,
      calls: structuredClone(this.calls),
      tools: tools
        .filter((t) => relevant.has(t.name) && !t.name.startsWith("atac_"))
        .map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
      truncated: this.truncated || messages.some((m) => m.truncated),
    };
  }
}
