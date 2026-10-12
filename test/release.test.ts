import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(
  new URL("../scripts/release-notes.mjs", import.meta.url),
);
const notes =
  "### 中文\n\n#### 新特性\n\n- 新功能。\n\n### English\n\n#### Features\n\n- New feature.";
const changelog = `# Changelog\n\n## [2.0.2] - 2026-10-12\n\n${notes}\n\n## [2.0.1] - 2026-10-12\n\nOld release.\n`;

for (const scenario of [
  "valid",
  "mismatched lock",
  "wrong tag",
  "missing translation",
  "stale entry",
  "invalid date",
  "duplicate version",
] as const) {
  test(`release notes: ${scenario}`, () => {
    const root = mkdtempSync(join(tmpdir(), "atac-release-"));
    try {
      writeFileSync(
        join(root, "package.json"),
        JSON.stringify({ version: "2.0.2" }),
      );
      writeFileSync(
        join(root, "package-lock.json"),
        JSON.stringify({
          version: "2.0.2",
          packages: {
            "": { version: scenario === "mismatched lock" ? "2.0.1" : "2.0.2" },
          },
        }),
      );
      const text =
        scenario === "missing translation"
          ? changelog.replace("### English", "### Other")
          : scenario === "stale entry"
            ? changelog.replace("[2.0.2]", "[2.0.3]")
            : scenario === "invalid date"
              ? changelog.replace("2026-10-12", "2026-02-30")
              : scenario === "duplicate version"
                ? changelog.replace("[2.0.1]", "[2.0.2]")
                : changelog;
      writeFileSync(join(root, "CHANGELOG.md"), text);
      const result = spawnSync(
        process.execPath,
        [script, scenario === "wrong tag" ? "v2.0.3" : "v2.0.2"],
        { cwd: root, encoding: "utf8" },
      );
      if (scenario === "valid") {
        assert.equal(result.status, 0, result.stderr);
        assert.ok(result.stdout.startsWith(notes));
        assert.doesNotMatch(result.stdout, /Old release/);
        assert.match(
          result.stdout,
          /pi install git:github.com\/ATaC-team\/ATaC@v2.0.2/,
        );
      } else {
        assert.notEqual(result.status, 0);
        assert.equal(
          result.stdout,
          "",
          "invalid metadata must not produce publishable notes",
        );
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
