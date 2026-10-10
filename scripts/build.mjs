import { rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
rmSync(new URL("../dist", import.meta.url), { recursive: true, force: true });
const child = spawnSync(
  process.execPath,
  ["node_modules/typescript/bin/tsc", "-p", "tsconfig.json"],
  { stdio: "inherit" },
);
process.exit(child.status ?? 1);
