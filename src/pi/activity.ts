import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export type Activity =
  | { kind: "extracting" }
  | { kind: "revising"; programId: string }
  | { kind: "testing" | "repairing"; programId: string; round: number };

function elapsed(started: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - started) / 1000));
  return seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

/** One session-owned widget for concurrent background activities. */
export class ActivityWidget {
  private entries = new Map<string, { activity: Activity; started: number }>();
  private ctx?: ExtensionContext;
  private timer?: ReturnType<typeof setInterval>;
  private disposed = false;

  start(id: string, ctx: ExtensionContext, activity: Activity): void {
    if (this.disposed || !ctx.hasUI) return;
    this.ctx = ctx;
    this.entries.set(id, { activity, started: Date.now() });
    if (!this.timer) {
      this.timer = setInterval(() => this.render(), 1000);
      this.timer.unref();
    }
    this.render();
  }

  finish(id: string): void {
    if (!this.entries.delete(id)) return;
    if (!this.entries.size) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.render();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    clearInterval(this.timer);
    this.timer = undefined;
    this.entries.clear();
    this.render();
    this.ctx = undefined;
  }

  private render(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const color = (name: "accent" | "muted", text: string) =>
      ctx.mode === "tui" ? ctx.ui.theme.fg(name, text) : text;
    const lines: string[] = [];
    for (const { activity, started } of this.entries.values()) {
      const title =
        activity.kind === "extracting"
          ? "Extracting programs"
          : `${{ revising: "Revising", testing: "Testing", repairing: "Repairing" }[activity.kind]} ${activity.programId}`;
      const progress =
        activity.kind === "testing"
          ? `Attempt ${activity.round} of 3    `
          : activity.kind === "repairing"
            ? `Round ${activity.round} of 2    `
            : "";
      lines.push(
        color("accent", `ATaC  ${title}`),
        color("muted", `      ${progress}Elapsed ${elapsed(started)}`),
      );
    }
    ctx.ui.setWidget("atac", lines.length ? lines : undefined, {
      placement: "aboveEditor",
    });
  }
}
