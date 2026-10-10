import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import {
  matchesKey,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
  type Component,
  type TUI,
} from "@earendil-works/pi-tui";
import type {
  Candidate,
  CandidateStatus,
  Manifest,
} from "../library/program.js";
import { errorText } from "../library/program.js";
import type { Library } from "../library/storage.js";
import { fit, frame, PANEL } from "./panel.js";

export interface Card {
  candidate: Candidate;
  manifest: Manifest;
}
export interface BoardState {
  column: number;
  row: number;
  filter: number;
  selectedId?: string;
}
export type BoardResult = { candidate: Candidate } | "activity" | undefined;
const columns: { title: string; states: CandidateStatus[] }[] = [
  { title: "Untested", states: ["untested"] },
  { title: "In progress", states: ["testing", "revising"] },
  { title: "Needs attention", states: ["failed", "interrupted"] },
  { title: "Published", states: ["published"] },
  { title: "Archived", states: ["archived"] },
];
const filters = ["All", "New", "Updates"];
export const statusLabel = (status: CandidateStatus) =>
  status[0]!.toUpperCase() + status.slice(1);

export class InboxBoard implements Component {
  private cards: Card[] = [];
  private error?: string;
  constructor(
    private tui: TUI,
    private theme: Theme,
    private load: () => Card[],
    private done: (result: BoardResult) => void,
    private state: BoardState = { column: 0, row: 0, filter: 0 },
  ) {
    this.refresh();
  }
  invalidate(): void {}
  refresh(): void {
    const selected = this.current()?.candidate.id ?? this.state.selectedId;
    try {
      this.cards = this.load();
      this.error = undefined;
      if (selected) {
        const group = columns.findIndex((_, index) =>
          this.group(index).some((card) => card.candidate.id === selected),
        );
        if (group !== -1) {
          this.state.column = group;
          this.state.row = this.group(group).findIndex(
            (card) => card.candidate.id === selected,
          );
        }
      }
      this.state.row = Math.min(
        this.state.row,
        Math.max(0, this.group(this.state.column).length - 1),
      );
    } catch (error) {
      this.error = errorText(error);
    }
    this.state.selectedId = this.current()?.candidate.id;
    this.tui.requestRender();
  }
  private group(column: number): Card[] {
    return this.cards.filter(
      (card) =>
        columns[column]!.states.includes(card.candidate.status) &&
        (this.state.filter === 0 ||
          Boolean(card.candidate.base_version) === (this.state.filter === 2)),
    );
  }
  private current(): Card | undefined {
    return this.group(this.state.column)[this.state.row];
  }
  handleInput(data: string): void {
    if (
      matchesKey(data, "escape") ||
      matchesKey(data, "q") ||
      matchesKey(data, "ctrl+c")
    )
      return this.done(undefined);
    if (matchesKey(data, "a")) return this.done("activity");
    if (matchesKey(data, "enter")) {
      const card = this.current();
      if (card) this.done({ candidate: card.candidate });
      return;
    }
    if (matchesKey(data, "right") || matchesKey(data, "tab")) {
      this.state.column = (this.state.column + 1) % columns.length;
      this.state.row = 0;
    } else if (matchesKey(data, "left") || matchesKey(data, "shift+tab")) {
      this.state.column =
        (this.state.column + columns.length - 1) % columns.length;
      this.state.row = 0;
    } else if (matchesKey(data, "down"))
      this.state.row = Math.min(
        this.state.row + 1,
        Math.max(0, this.group(this.state.column).length - 1),
      );
    else if (matchesKey(data, "up"))
      this.state.row = Math.max(0, this.state.row - 1);
    else if (matchesKey(data, "f")) {
      this.state.filter = (this.state.filter + 1) % filters.length;
      this.state.row = 0;
    }
    this.state.selectedId = this.current()?.candidate.id;
    this.tui.requestRender();
  }
  render(width: number): string[] {
    const height = this.tui.terminal.rows;
    if (width < 36 || height < 18)
      return frame(this.theme, width, height, "ATaC Inbox", [
        "Resize to at least 36 × 18",
        "Esc Close",
      ]);
    const inner = width - 4;
    const count = Math.min(
      columns.length,
      Math.max(1, Math.floor((inner + 3) / 25)),
    );
    const start = Math.min(
      Math.max(0, this.state.column - count + 1),
      columns.length - count,
    );
    const columnWidth = Math.floor((inner - (count - 1) * 3) / count);
    const visible = columns.slice(start, start + count);
    const slots = Math.max(1, Math.floor((height - 12) / 6));
    const headers = visible
      .map((column, offset) => {
        const index = start + offset;
        return fit(
          this.theme.fg(
            index === this.state.column ? "accent" : "muted",
            `${index === this.state.column ? "› " : ""}${column.title} (${this.group(index).length})`,
          ),
          columnWidth,
        );
      })
      .join(this.theme.fg("borderMuted", " │ "));
    const content: string[] = [];
    for (let line = 0; line < slots * 6; line++) {
      content.push(
        visible
          .map((_column, offset) => {
            const index = start + offset;
            const group = this.group(index);
            const scroll =
              index === this.state.column
                ? Math.max(0, this.state.row - slots + 1)
                : 0;
            const cardIndex = scroll + Math.floor(line / 6);
            const card = group[cardIndex];
            if (!card)
              return fit(
                line === 0 ? this.theme.fg("dim", "No programs") : "",
                columnWidth,
              );
            const part = line % 6;
            const selected =
              index === this.state.column && cardIndex === this.state.row;
            const edge = (text: string) =>
              this.theme.fg(selected ? "accent" : "borderMuted", text);
            const clean = (text: string) => text.replace(/[\r\n]/g, " ");
            const title = truncateToWidth(
              clean(card.manifest.program_id),
              columnWidth - 6,
            );
            const purpose = wrapTextWithAnsi(
              clean(card.manifest.purpose),
              columnWidth - 4,
            );
            if (part === 0)
              return (
                edge("╭─ ") +
                this.theme.fg(selected ? "accent" : "text", title) +
                edge(` ${"─".repeat(columnWidth - visibleWidth(title) - 5)}╮`)
              );
            if (part === 4) return edge(`╰${"─".repeat(columnWidth - 2)}╯`);
            if (part === 5) return " ".repeat(columnWidth);
            const text =
              part === 3
                ? `${card.candidate.base_version ? "Update" : "New"} · ${statusLabel(card.candidate.status)}`
                : part === 2
                  ? purpose.slice(1).join(" ")
                  : (purpose[0] ?? "");
            return (
              edge("│ ") +
              fit(
                this.theme.fg(part === 3 ? "dim" : "text", text),
                columnWidth - 4,
              ) +
              edge(" │")
            );
          })
          .join(this.theme.fg("borderMuted", " │ ")),
      );
    }
    const current = this.current();
    const summary = current
      ? [
          this.theme.fg(
            "accent",
            current.manifest.program_id.replace(/[\r\n]/g, " "),
          ),
          `${current.manifest.purpose.replace(/[\r\n]/g, " ")} · ${this.state.row + 1}/${this.group(this.state.column).length}`,
        ]
      : ["No program selected", ""];
    return frame(this.theme, width, height, "ATaC Inbox", [
      `Programs · ${filters[this.state.filter]}    Columns ${start + 1}–${start + count}/${columns.length}`,
      "",
      headers,
      this.theme.fg("borderMuted", "─".repeat(inner)),
      ...content,
      this.theme.fg("borderMuted", "─".repeat(inner)),
      ...summary,
      this.theme.fg(
        this.error ? "error" : "dim",
        this.error ?? "Arrows Move · Enter Open",
      ),
      this.theme.fg("dim", "f Filter  a Activity  Esc Close"),
    ]);
  }
}

export async function openBoard(
  ctx: ExtensionContext,
  library: Library,
  signal: AbortSignal,
  state: BoardState,
): Promise<BoardResult> {
  return ctx.ui.custom<BoardResult>((tui, theme, _keys, done) => {
    const close = () => done(undefined);
    const board = new InboxBoard(
      tui,
      theme,
      () =>
        library.inbox(true).map((candidate) => ({
          candidate,
          manifest: library.bundle(candidate.revision).manifest,
        })),
      done,
      state,
    );
    const timer = setInterval(() => board.refresh(), 1000);
    signal.addEventListener("abort", close, { once: true });
    if (signal.aborted) queueMicrotask(close);
    return Object.assign(board, {
      dispose() {
        clearInterval(timer);
        signal.removeEventListener("abort", close);
      },
    });
  }, PANEL);
}
