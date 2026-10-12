import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadConfig, setPermissions, type PermissionMode } from "../config.js";
import type { Library } from "../library/storage.js";

export function registerPermissions(
  pi: ExtensionAPI,
  library: Library,
  changed: () => void | Promise<void>,
): void {
  pi.registerCommand("atac:permissions", {
    description: "Set extraction and publishing permissions",
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
            `ATaC permissions: ${current}\nUsage: /atac:permissions auto|manual|on-demand`,
          );
          return;
        }
        const labels: Record<PermissionMode, string> = {
          auto: "Auto extract, auto publish",
          manual: "Auto extract, manual publish",
          "on-demand": "Manual extract, manual publish",
        };
        const selected = await ctx.ui.select(
          `ATaC permissions: ${labels[current]}`,
          Object.values(labels),
        );
        if (!selected) return;
        choice = Object.entries(labels).find(
          ([, label]) => label === selected,
        )![0];
      }
      if (choice !== "manual" && choice !== "auto" && choice !== "on-demand") {
        show("Usage: /atac:permissions auto|manual|on-demand", true);
        return;
      }
      await setPermissions(library, choice as PermissionMode);
      await changed();
      show(
        choice === "auto"
          ? "ATaC: Automatic publishing enabled. New revisions will be tested, with up to two repairs. Existing Inbox candidates are unchanged."
          : choice === "on-demand"
            ? "ATaC: Manual extraction enabled. Use /atac:extract, then /atac:inbox to test and publish."
            : "ATaC: Automatic extraction and manual review enabled. Open /atac:inbox to test and publish programs.",
      );
    },
  });
}
