import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { type Candidate, errorText } from "../library/program.js";
import { Library } from "../library/storage.js";
import type { Jobs } from "../harvest/jobs.js";
import type { Config } from "../config.js";
import { verifyCandidate } from "../runtime/verification.js";
import { openBoard, statusLabel, type BoardState } from "./board.js";
import { panelContext } from "./panel.js";
import { canEdit, detailTabs, openDetail } from "./detail.js";
import { automaticRuns } from "../runtime/automation.js";

function activityText(library: Library, jobs: Jobs): string {
  return (
    [
      ...jobs.list().map((job) => ({
        created_at: job.created_at,
        text: [
          `${job.automatic_chain ? "Automatic revision" : job.kind === "harvest" ? "Extract" : "Revise"} · ${job.state} · ${job.created_at}`,
          `Request: ${job.snapshot.source.goal}`,
          `Model: ${job.model.provider}/${job.model.id}`,
          ...(job.usage
            ? [
                `Usage: ${job.usage.tokens} tokens · $${job.usage.cost.toFixed(4)}`,
              ]
            : []),
          ...(job.diagnostic ? [job.diagnostic] : []),
        ].join("\n"),
      })),
      ...automaticRuns(library.root).map((run) => ({
        created_at: run.created_at,
        text: [
          `Automatic publishing · ${run.state} · ${run.created_at}`,
          `Program: ${run.program_id}`,
          `Tests: ${run.attempts.length}/3 · Repairs: ${run.repairs}/2`,
          ...run.attempts.map(
            (attempt, i) =>
              `Test ${i + 1}: ${attempt.status} · ${attempt.revision.slice(0, 12)}${attempt.diagnostic ? `\n${attempt.diagnostic}` : ""}`,
          ),
          ...(run.diagnostic ? [run.diagnostic] : []),
        ].join("\n"),
      })),
    ]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((item) => item.text)
      .join("\n\n") || "No activity"
  );
}
async function pages(
  ctx: ExtensionContext,
  title: string,
  text: string,
  signal: AbortSignal,
): Promise<void> {
  const lines = text
    .split("\n")
    .flatMap((line) => line.match(/.{1,110}/gu) ?? [""]);
  const count = Math.max(1, Math.ceil(lines.length / 24));
  let index = 0;
  while (!signal.aborted) {
    const options = [
      ...(index > 0 ? ["Previous"] : []),
      ...(index + 1 < count ? ["Next"] : []),
      "Back",
    ];
    const selected = await ctx.ui.select(
      `${title} (${index + 1}/${count})\n\n${lines.slice(index * 24, (index + 1) * 24).join("\n")}`,
      options,
      { signal },
    );
    if (selected === "Previous") index--;
    else if (selected === "Next") index++;
    else return;
  }
}
export async function openInbox(
  library: Library,
  jobs: Jobs,
  config: Config,
  parent: ExtensionContext,
  signal: AbortSignal,
): Promise<void> {
  if (!parent.hasUI || !["tui", "rpc"].includes(parent.mode)) return;
  const ctx = parent.mode === "tui" ? panelContext(parent, signal) : parent;
  let history = false;
  const boardState: BoardState = { column: 0, row: 0, filter: 0 };
  while (!signal.aborted) {
    let c: Candidate | undefined;
    let selection: string | undefined;
    if (parent.mode === "tui") {
      const picked = await openBoard(parent, library, signal, boardState);
      if (!picked) return;
      if (picked === "activity") selection = "Activity";
      else c = picked.candidate;
    } else {
      const candidates = library.inbox(history);
      const rows = candidates.map(
        (c, i) =>
          `${i + 1}. ${c.program_id} · ${statusLabel(c.status)} · ${c.base_version ? "Update" : "New"}`,
      );
      selection = await ctx.ui.select(
        `ATaC Inbox · ${candidates.length} items`,
        [...rows, "Activity", history ? "Pending" : "History", "Close"],
        { signal },
      );
      if (!selection || selection === "Close") return;
      c = candidates[rows.indexOf(selection)];
    }
    if (selection === "History" || selection === "Pending") {
      history = !history;
      continue;
    }
    if (selection === "Activity") {
      await pages(ctx, "Activity", activityText(library, jobs), signal);
      continue;
    }
    if (!c) continue;
    const manifest = library.bundle(c.revision).manifest;
    const tabs = parent.mode === "rpc" ? detailTabs(library, c) : [];
    const selected =
      parent.mode === "tui"
        ? await openDetail(parent, library, c, signal)
        : await ctx.ui.select(
            `${manifest.program_id} · ${statusLabel(c.status)}\n${manifest.purpose}`,
            [
              ...tabs.map((tab) => tab.title),
              ...(canEdit(c) ? ["Test and publish", "Revise", "Archive"] : []),
              "Back",
            ],
            { signal },
          );
    try {
      const tab = tabs.find((tab) => tab.title === selected);
      if (tab) {
        if (tab.files) {
          const file = await ctx.ui.select(
            "Changes",
            [...tab.files.map((file) => file.name), "Back"],
            { signal },
          );
          const chosen = tab.files.find((item) => item.name === file);
          if (chosen) await pages(ctx, chosen.name, chosen.text, signal);
        } else await pages(ctx, tab.title, tab.text, signal);
      } else if (selected === "Archive")
        await library.change(c.id, c.revision, (record) => {
          if (["testing", "revising", "published"].includes(record.status))
            throw new Error("Candidate changed; reopen details");
          record.status = "archived";
        });
      else if (selected === "Revise") {
        const instruction = await ctx.ui.input(
          "Revision instructions (optional)",
          "Add edge case tests",
          { signal },
        );
        if (instruction === undefined || signal.aborted) continue;
        c = await library.change(c.id, c.revision, (record) => {
          if (!["untested", "failed", "interrupted"].includes(record.status))
            throw new Error("Candidate changed; reopen details");
          record.status = "revising";
          record.owner_pid = process.pid;
        });
        try {
          await jobs.enqueue(
            {
              source: c.source,
              messages: [],
              calls: [],
              tools: [],
              truncated: false,
            },
            ctx,
            c,
            instruction,
          );
        } catch (error) {
          await library.change(c.id, c.revision, (record) => {
            record.status = "failed";
            record.diagnostic = errorText(error);
            delete record.owner_pid;
          });
          throw error;
        }
      } else if (selected === "Test and publish" && !signal.aborted) {
        const completed = await verifyCandidate(
          library,
          c,
          parent,
          signal,
          config,
        );
        if (!signal.aborted)
          await pages(
            ctx,
            completed.status === "published" ? "Published" : "Tests failed",
            `${completed.diagnostic ?? "Tests passed."}\nRevision: ${completed.revision}\nReport: ${completed.report_id ?? "None"}`,
            signal,
          );
      }
    } catch (error) {
      if (!signal.aborted)
        await pages(ctx, "Unable to complete", errorText(error), signal);
    }
  }
}
