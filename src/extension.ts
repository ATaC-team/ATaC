import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadConfig } from "./config.js";
import { openInbox } from "./pi/inbox.js";
import { Jobs } from "./harvest/jobs.js";
import { roles } from "./runtime/roles.js";
import { Recorder } from "./harvest/snapshot.js";
import { Library } from "./library/storage.js";
import { programTools } from "./pi/tools.js";
import { programPrompt } from "./pi/prompt.js";

export default function atac(pi: ExtensionAPI): void {
  if (roles.getStore()) return;
  const library = new Library();
  const config = loadConfig(library.root);
  let jobs = new Jobs(library, config);
  const recorder = new Recorder();
  let inbox: AbortController | undefined;
  let stopped = false;
  let inboxDone: Promise<void> | undefined;
  const stop = async () => {
    stopped = true;
    inbox?.abort();
    recorder.reset();
    await Promise.all([jobs.stop(), inboxDone]);
  };
  for (const tool of programTools(library, config)) pi.registerTool(tool);
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
      jobs = new Jobs(library, config);
      stopped = false;
    }
    await library.recover();
    jobs.start(ctx);
  });
  pi.on("input", async (event) => {
    if (event.source !== "extension") {
      inbox?.abort(new Error("New user request"));
      await inboxDone;
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
    event.systemPromptOptions.sections.atac_programs = programPrompt(library);
  });
  pi.on("agent_settled", (event, ctx) => {
    if (event.aborted || stopped) {
      recorder.reset();
      return;
    }
    const snapshot = recorder.snapshot(ctx, pi.getAllTools());
    recorder.reset();
    if (snapshot) {
      // Only persistence is queued here; the handler never awaits model work.
      void jobs.enqueue(snapshot, ctx).catch(() => {});
    }
  });
  pi.on("session_shutdown", stop);
}
