import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const dir = mkdtempSync(join(tmpdir(), "atac-package-"));
function run(command, args, options = {}) {
  const child = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 120_000,
    ...options,
  });
  if (child.status !== 0)
    throw new Error(
      `${command} failed\n${child.stdout ?? ""}\n${child.stderr ?? ""}`,
    );
  return child.stdout;
}
try {
  run(process.execPath, ["scripts/build.mjs"], { stdio: "inherit" });
  const [pack] = JSON.parse(
    run("npm", [
      "pack",
      "--ignore-scripts",
      "--json",
      "--pack-destination",
      dir,
    ]),
  );
  if (
    pack.files.some((f) =>
      /(?:\.py$|audit-ui|node_modules|pelican)/.test(f.path),
    )
  )
    throw new Error("Unexpected legacy/private file in package");
  const install = join(dir, "install");
  mkdirSync(install);
  run(
    "npm",
    [
      "install",
      "--prefix",
      install,
      "--omit=dev",
      "--legacy-peer-deps",
      join(dir, pack.filename),
    ],
    { stdio: "inherit" },
  );
  const home = join(dir, "home");
  mkdirSync(home);
  run(
    process.execPath,
    [
      "scripts/package-session.mjs",
      join(install, "node_modules/@atac-team/pi-atac"),
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        HOME: home,
        PI_CODING_AGENT_DIR: join(home, ".pi/agent"),
      },
    },
  );
  const managedHome = join(dir, "managed-home");
  mkdirSync(managedHome);
  const managedEnv = {
    ...process.env,
    HOME: managedHome,
    PI_CODING_AGENT_DIR: join(managedHome, ".pi/agent"),
  };
  const installed = join(install, "node_modules/@atac-team/pi-atac");
  run(
    process.execPath,
    [
      "node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js",
      "install",
      installed,
    ],
    { stdio: "inherit", env: managedEnv },
  );
  run(process.execPath, ["scripts/package-session.mjs", installed, "managed"], {
    stdio: "inherit",
    env: managedEnv,
  });
  const harvestHome = join(dir, "harvest-home");
  mkdirSync(harvestHome);
  run(process.execPath, ["scripts/harvest-session.mjs", installed], {
    stdio: "inherit",
    env: {
      ...process.env,
      HOME: harvestHome,
      PI_CODING_AGENT_DIR: join(harvestHome, ".pi/agent"),
    },
  });
  console.log(
    `Package smoke passed: ${pack.filename}; npm and pi-managed installation, Inbox, fresh-session reuse.`,
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
