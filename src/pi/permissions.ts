import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadConfig, setPermissions, type PermissionMode } from "../config.js";
import type { Library } from "../library/storage.js";

export function registerPermissions(
  pi: ExtensionAPI,
  library: Library,
  changed: () => void,
): void {
  pi.registerCommand("atac:permissions", {
    description: "Set program publishing permissions",
    async handler(args, ctx) {
      const show = (text: string, error = false) => {
        if (ctx.hasUI) ctx.ui.notify(text, error ? "error" : "info");
        else
          pi.sendMessage({
            customType: "atac-permissions",
            content: text,
            display: true,
          });
      };
      let choice = args.trim();
      const current = loadConfig(library.root).permissions!;
      if (!choice) {
        if (!ctx.hasUI) {
          show(
            `ATaC permissions: ${current}\nUsage: /atac:permissions manual|auto`,
          );
          return;
        }
        const labels = { manual: "Manual review", auto: "Automatic" };
        const selected = await ctx.ui.select(
          `ATaC permissions · ${labels[current]}`,
          [labels.manual, labels.auto],
        );
        if (!selected) return;
        choice = selected === labels.manual ? "manual" : "auto";
      }
      if (choice !== "manual" && choice !== "auto") {
        show("Usage: /atac:permissions manual|auto", true);
        return;
      }
      await setPermissions(library, choice as PermissionMode);
      changed();
      show(
        choice === "auto"
          ? "ATaC: Automatic publishing enabled. New revisions will be tested, with up to two repairs. Existing Inbox candidates are unchanged."
          : "ATaC: Manual review enabled. Open /atac:inbox to test and publish programs.",
      );
    },
  });
}
