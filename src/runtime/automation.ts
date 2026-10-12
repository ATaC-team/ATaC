import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, watchFile, unwatchFile } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { authorizeAutomatic, loadConfig } from "../config.js";
import { type Candidate, type Report, errorText } from "../library/program.js";
import { Library, alive, atomicJson, readJson } from "../library/storage.js";
import { verifyCandidate } from "./verification.js";
import type { ActivityWidget } from "../pi/activity.js";

export type CandidateSaved = (
  candidate: Candidate,
  ctx: ExtensionContext,
) => void;
export interface AutomaticRun {
  id: string;
  candidate_id: string;
  program_id: string;
  revision: string;
  permission_version: string;
  state:
    | "queued"
    | "testing"
    | "revising"
    | "published"
    | "failed"
    | "interrupted";
  repairs: number;
  attempts: {
    revision: string;
    report_id?: string;
    status: string;
    diagnostic?: string;
  }[];
  owner_pid: number;
  created_at: string;
  updated_at: string;
  diagnostic?: string;
}

export function automaticRuns(root: string): AutomaticRun[] {
  let files: string[];
  try {
    files = readdirSync(join(root, "automation"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return files
    .filter((name) => name.endsWith(".json"))
    .map((name) => readJson<AutomaticRun>(join(root, "automation", name))!)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export type RepairCandidate = (
  candidate: Candidate,
  ctx: ExtensionContext,
  diagnostic: string,
  signal: AbortSignal,
  authorize: () => void,
  chainId: string,
  onSaved: (candidate: Candidate) => void,
) => Promise<Candidate>;

export class AutomaticPublishing {
  private queue: { run: AutomaticRun; ctx: ExtensionContext }[] = [];
  private active?: { run: AutomaticRun; controller: AbortController };
  private draining?: Promise<void>;
  private timer?: ReturnType<typeof setTimeout>;
  private stopped = false;
  private configPath: string;
  private onConfig = () => this.refresh();

  constructor(
    private library: Library,
    private repair: RepairCandidate,
    private verify: typeof verifyCandidate = verifyCandidate,
    private activity?: ActivityWidget,
  ) {
    mkdirSync(join(library.root, "automation"), {
      recursive: true,
      mode: 0o700,
    });
    for (const run of automaticRuns(library.root)) {
      if (
        ["queued", "testing", "revising"].includes(run.state) &&
        !alive(run.owner_pid)
      ) {
        run.state = "interrupted";
        run.diagnostic =
          "Previous process stopped. Automatic tests are not replayed.";
        this.write(run);
      }
    }
    this.configPath = join(library.root, "config.json");
    watchFile(
      this.configPath,
      { interval: 100, persistent: false },
      this.onConfig,
    );
  }

  /** Called only for a newly saved revision, while the library lock is held. */
  saved: CandidateSaved = (candidate, ctx) => {
    if (this.stopped) return;
    const config = loadConfig(this.library.root);
    if (config.permissions !== "auto") return;
    const now = new Date().toISOString();
    const run: AutomaticRun = {
      id: randomUUID(),
      candidate_id: candidate.id,
      program_id: candidate.program_id,
      revision: candidate.revision,
      permission_version: config.permissionVersion!,
      state: "queued",
      repairs: 0,
      attempts: [],
      owner_pid: process.pid,
      created_at: now,
      updated_at: now,
    };
    this.write(run);
    this.queue.push({ run, ctx });
    this.wake();
  };

  refresh(): void {
    const revoked = (run: AutomaticRun): string | undefined => {
      try {
        authorizeAutomatic(this.library.root, run.permission_version);
      } catch (error) {
        return errorText(error);
      }
    };
    this.queue = this.queue.filter(({ run }) => {
      const reason = revoked(run);
      if (!reason) return true;
      run.state = "interrupted";
      run.diagnostic = reason;
      this.write(run);
      return false;
    });
    if (this.active) {
      const reason = revoked(this.active.run);
      if (reason) this.active.controller.abort(new Error(reason));
    }
  }

  private write(run: AutomaticRun): void {
    run.updated_at = new Date().toISOString();
    atomicJson(join(this.library.root, "automation", `${run.id}.json`), run);
  }

  private wake(): void {
    if (this.stopped || this.timer || this.draining || !this.queue.length)
      return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (this.stopped || !this.queue.length) return;
      if (this.queue[0]!.ctx.isIdle && !this.queue[0]!.ctx.isIdle()) {
        this.wake();
        return;
      }
      const item = this.queue.shift()!;
      const controller = new AbortController();
      this.active = { run: item.run, controller };
      this.draining = this.execute(
        item.run,
        item.ctx,
        controller.signal,
      ).finally(() => {
        this.active = undefined;
        this.draining = undefined;
        this.wake();
      });
    }, 100);
    this.timer.unref();
  }

  async waitForIdle(): Promise<void> {
    while (this.queue.length || this.draining) {
      if (this.draining) await this.draining;
      else await delay(20);
    }
  }

  async cancel(
    reason = "New user request. Review this candidate in /atac:inbox.",
  ): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    for (const { run } of this.queue.splice(0)) {
      run.state = "interrupted";
      run.diagnostic = reason;
      this.write(run);
    }
    this.active?.controller.abort(new Error(reason));
    await this.draining;
  }

  async stop(): Promise<void> {
    this.stopped = true;
    unwatchFile(this.configPath, this.onConfig);
    await this.cancel("Session ended. Automatic tests are not replayed.");
  }

  private async execute(
    run: AutomaticRun,
    ctx: ExtensionContext,
    signal: AbortSignal,
  ): Promise<void> {
    const authorize = () => {
      signal.throwIfAborted();
      authorizeAutomatic(this.library.root, run.permission_version);
    };
    const activityId = `automatic:${run.id}`;
    try {
      while (true) {
        authorize();
        const candidate = this.library.candidate(run.candidate_id);
        if (
          candidate.revision !== run.revision ||
          candidate.status !== "untested"
        )
          throw new Error("Candidate changed. Automatic processing stopped.");
        run.state = "testing";
        this.write(run);
        this.activity?.start(activityId, ctx, {
          kind: "testing",
          programId: run.program_id,
          round: run.attempts.length + 1,
        });
        const attempt: AutomaticRun["attempts"][number] = {
          revision: run.revision,
          status: "testing",
        };
        const completed = await this.verify(
          this.library,
          candidate,
          ctx,
          signal,
          loadConfig(this.library.root),
          {
            authorize,
            onClaim: () => {
              run.attempts.push(attempt);
              this.write(run);
            },
            automatic: {
              chain_id: run.id,
              attempt: run.attempts.length + 1,
              repairs: run.repairs,
            },
          },
        );
        Object.assign(attempt, {
          report_id: completed.report_id,
          status: completed.status,
          diagnostic: completed.diagnostic,
        });
        this.write(run);
        if (completed.status === "published") {
          run.state = "published";
          run.diagnostic = "Tests passed. Program published.";
          if (ctx.hasUI && !this.stopped)
            ctx.ui.notify(`ATaC: Published ${run.program_id}.`, "info");
          return;
        }
        authorize();
        const report = completed.report_id
          ? readJson<Report>(
              join(this.library.root, "reports", `${completed.report_id}.json`),
            )
          : undefined;
        if (report?.failure_kind !== "program" || run.repairs >= 2) {
          throw new Error(
            completed.diagnostic ??
              "Tests failed. Review this candidate in /atac:inbox.",
          );
        }
        run.state = "revising";
        run.repairs++;
        this.write(run);
        this.activity?.start(activityId, ctx, {
          kind: "repairing",
          programId: run.program_id,
          round: run.repairs,
        });
        const revised = await this.repair(
          completed,
          ctx,
          JSON.stringify(report),
          signal,
          authorize,
          run.id,
          (candidate) => {
            run.revision = candidate.revision;
            this.write(run);
          },
        );
        authorize();
        run.revision = revised.revision;
        if (
          revised.revision === completed.revision ||
          run.attempts.some((attempt) => attempt.revision === revised.revision)
        ) {
          await this.library.change(revised.id, revised.revision, (c) => {
            if (["untested", "failed"].includes(c.status)) {
              c.status = "failed";
              c.diagnostic =
                "Revision did not produce new code and tests. Automatic processing stopped.";
            }
          });
          throw new Error(
            "Revision did not produce a new revision. Review this candidate in /atac:inbox.",
          );
        }
      }
    } catch (error) {
      let revoked = false;
      try {
        authorizeAutomatic(this.library.root, run.permission_version);
      } catch {
        revoked = true;
      }
      run.state = signal.aborted || revoked ? "interrupted" : "failed";
      run.diagnostic = errorText(error);
      const last = run.attempts.at(-1);
      if (last?.status === "testing") {
        last.status = run.state;
        last.diagnostic = run.diagnostic;
      }
      if (ctx.hasUI && !this.stopped && run.state === "failed")
        ctx.ui.notify(
          `ATaC: ${run.program_id} needs review. Open /atac:inbox.`,
          "error",
        );
    } finally {
      this.activity?.finish(activityId);
      this.write(run);
    }
  }
}
