import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadConfig } from "./config.js";
import { openInbox } from "./pi/inbox.js";
import { Jobs } from "./harvest/jobs.js";
import { roles } from "./runtime/roles.js";
import { Recorder, redact } from "./harvest/snapshot.js";
import { Library } from "./library/storage.js";
import { programTools } from "./pi/tools.js";
import { injectProgramPrompt } from "./pi/prompt.js";
import {
  AutomaticPublishing,
  type CandidateSaved,
} from "./runtime/automation.js";
import { registerPermissions } from "./pi/permissions.js";
import { TASK_ENTRY, completedTasks } from "./harvest/batch.js";
import { errorText } from "./library/program.js";
import { ActivityWidget } from "./pi/activity.js";

export default function atac(pi: ExtensionAPI): void {
  if (roles.getStore()) return;
  const library = new Library();
  const config = loadConfig(library.root);
  let activity = new ActivityWidget();
  let automatic: AutomaticPublishing;
  const saved: CandidateSaved = (candidate, ctx) =>
    automatic.saved(candidate, ctx);
  let jobs = new Jobs(library, config, saved, undefined, activity);
  const createAutomatic = () =>
    new AutomaticPublishing(
      library,
      (...args) => jobs.repair(...args),
      undefined,
      activity,
    );
  automatic = createAutomatic();
  const recorder = new Recorder();
  let inbox: AbortController | undefined;
  let stopped = false;
  let inboxDone: Promise<void> | undefined;
  const stop = async () => {
    stopped = true;
    activity.dispose();
    inbox?.abort();
    recorder.reset();
    await Promise.all([automatic.stop(), jobs.stop(), inboxDone]);
  };
  for (const tool of programTools(library, config, saved))
    pi.registerTool(tool);
  registerPermissions(pi, library, async () => {
    automatic.refresh();
    await jobs.refresh();
  });
  pi.registerCommand("atac:extract", {
    description: "Extract programs from unprocessed completed work",
    async handler(args, ctx) {
      const show = (content: string, error = false) => {
        if (ctx.hasUI) ctx.ui.notify(content, error ? "error" : "info");
        else
          pi.sendMessage({
            customType: "atac-extract",
            content,
            display: true,
          });
      };
      if (args.trim()) {
        show("Usage: /atac:extract", true);
        return;
      }
      if (!ctx.isIdle()) {
        show("ATaC: Wait for the current task to finish.");
        return;
      }
      try {
        if (!(await jobs.enqueue(completedTasks(ctx, pi.getAllTools()), ctx)))
          show("ATaC: No new completed work to extract.");
      } catch (error) {
        show(`ATaC: ${errorText(error)}`, true);
      }
    },
  });
  pi.registerCommand("atac:inbox", {
    description: "Review, test, and publish programs",
    async handler(_args, ctx) {
      if (inbox || !ctx.hasUI) return;
      inbox = new AbortController();
      try {
        inboxDone = openInbox(library, jobs, config, ctx, inbox.signal);
        await inboxDone;
      } finally {
        inbox = undefined;
        inboxDone = undefined;
      }
    },
  });
  pi.on("session_start", async (_event, ctx) => {
    if (stopped) {
      activity = new ActivityWidget();
      jobs = new Jobs(library, config, saved, undefined, activity);
      automatic = createAutomatic();
      stopped = false;
    }
    await library.recover();
    jobs.start(ctx);
  });
  pi.on("input", async (event) => {
    if (event.source !== "extension") {
      inbox?.abort(new Error("New user request"));
      await Promise.all([automatic.cancel(), inboxDone]);
    }
  });
  pi.on("tool_call", (event) => {
    recorder.record(event);
  });
  pi.on("tool_result", (event) => {
    recorder.record(event);
  });
  pi.on("before_agent_start", (event, ctx) => {
    recorder.begin(ctx);
    injectProgramPrompt(event.systemPromptOptions, library);
  });
  pi.on("agent_settled", (event, ctx) => {
    if (event.aborted || stopped) {
      recorder.reset();
      return;
    }
    const snapshot = recorder.snapshot(ctx, pi.getAllTools());
    recorder.reset();
    if (snapshot) {
      pi.appendEntry(TASK_ENTRY, JSON.parse(redact(JSON.stringify(snapshot))));
      if (loadConfig(library.root).permissions === "on-demand") return;
      // Only persistence is queued here; the handler never awaits model work.
      void jobs.enqueue(snapshot, ctx).catch(() => {});
    }
  });
  pi.on("session_shutdown", stop);
}
