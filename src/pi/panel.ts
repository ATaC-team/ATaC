import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import {
  Input,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
  type Component,
  type TUI,
} from "@earendil-works/pi-tui";

export const PANEL = {
  overlay: true,
  overlayOptions: {
    width: "100%" as const,
    maxHeight: "100%" as const,
    anchor: "top-left" as const,
  },
};
export function fit(text: string, width: number): string {
  const clipped = truncateToWidth(text, Math.max(0, width));
  return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}
export function frame(
  theme: Theme,
  width: number,
  height: number,
  title: string,
  body: string[],
): string[] {
  const inner = Math.max(0, width - 4);
  const border = (text: string) => theme.fg("border", text);
  const lines = [
    border(`╭${"─".repeat(Math.max(0, width - 2))}╮`),
    `${border("│")} ${fit(theme.fg("accent", title), inner)} ${border("│")}`,
  ];
  for (let i = 0; i < height - 3; i++)
    lines.push(`${border("│")} ${fit(body[i] ?? "", inner)} ${border("│")}`);
  lines.push(border(`╰${"─".repeat(Math.max(0, width - 2))}╯`));
  return lines.map((line) => truncateToWidth(line, width));
}

class Dialog implements Component {
  private selected = 0;
  private scroll = 0;
  private maxScroll = 0;
  private pageSize = 1;
  private input?: Input;
  get focused(): boolean {
    return this.input?.focused ?? false;
  }
  set focused(value: boolean) {
    if (this.input) this.input.focused = value;
  }
  constructor(
    private tui: TUI,
    private theme: Theme,
    private title: string,
    private options: string[],
    private done: (value: string | undefined) => void,
    placeholder?: string,
  ) {
    if (placeholder !== undefined) {
      this.input = new Input({ prompt: "> ", placeholder });
      this.input.onSubmit = done;
      this.input.onEscape = () => done(undefined);
    }
  }
  invalidate(): void {}
  handleInput(data: string): void {
    if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c"))
      return this.done(undefined);
    if (this.input) this.input.handleInput(data);
    else if (matchesKey(data, "up"))
      this.selected = Math.max(0, this.selected - 1);
    else if (matchesKey(data, "down"))
      this.selected = Math.min(this.options.length - 1, this.selected + 1);
    else if (matchesKey(data, "enter"))
      return this.done(this.options[this.selected]);
    else if (matchesKey(data, "pageUp"))
      this.scroll = Math.max(0, this.scroll - this.pageSize);
    else if (matchesKey(data, "pageDown"))
      this.scroll = Math.min(this.maxScroll, this.scroll + this.pageSize);
    this.tui.requestRender();
  }
  render(width: number): string[] {
    const height = this.tui.terminal.rows;
    if (width < 36 || height < 18)
      return frame(this.theme, width, height, "ATaC Inbox", [
        "Resize to at least 36 × 18",
        "Esc Back",
      ]);
    const [title, ...body] = this.title.split("\n");
    const text = body.flatMap((line) =>
      wrapTextWithAnsi(line, Math.max(1, width - 4)),
    );
    const options = this.input
      ? this.input.render(Math.max(1, width - 4))
      : this.options.map((option, i) =>
          i === this.selected
            ? this.theme.fg("accent", `› ${option}`)
            : `  ${option}`,
        );
    this.pageSize = Math.max(1, height - options.length - 7);
    this.maxScroll = Math.max(0, text.length - this.pageSize);
    this.scroll = Math.min(this.scroll, this.maxScroll);
    const visible = text.slice(this.scroll, this.scroll + this.pageSize);
    while (visible.length < this.pageSize) visible.push("");
    return frame(this.theme, width, height, title ?? "ATaC", [
      ...visible,
      "",
      ...options,
      "",
      this.theme.fg(
        "dim",
        this.input
          ? "Enter Submit · Esc Back"
          : "↑/↓ Select · Enter Open · PgUp/PgDn Scroll · Esc Back",
      ),
    ]);
  }
}

export function panelContext(
  ctx: ExtensionContext,
  signal: AbortSignal,
): ExtensionContext {
  const show = (title: string, options: string[], placeholder?: string) =>
    ctx.ui.custom<string | undefined>((tui, theme, _keys, done) => {
      const close = () => done(undefined);
      signal.addEventListener("abort", close, { once: true });
      const dialog = new Dialog(tui, theme, title, options, done, placeholder);
      if (signal.aborted) queueMicrotask(close);
      return Object.assign(dialog, {
        dispose() {
          signal.removeEventListener("abort", close);
        },
      });
    }, PANEL);
  return {
    ...ctx,
    ui: {
      ...ctx.ui,
      select: (title, options) => show(title, options),
      input: (title, placeholder) => show(title, [], placeholder ?? ""),
    },
  };
}
