import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { DEFAULT_LIMITS, type Limits } from "./runtime/runner.js";
import { atomicJson, readJson, type Library } from "./library/storage.js";

export type PermissionMode = "manual" | "auto";

export interface Config extends Limits {
  model?: { provider: string; id: string };
  permissions?: PermissionMode;
  permissionVersion?: string;
}
export function loadConfig(root: string): Config {
  const raw = readJson<Partial<Config>>(join(root, "config.json")) ?? {};
  const config = {
    ...DEFAULT_LIMITS,
    permissions: "manual" as PermissionMode,
    permissionVersion: "initial",
    ...raw,
  };
  if (!["manual", "auto"].includes(config.permissions))
    throw new Error("permissions must be manual or auto");
  if (typeof config.permissionVersion !== "string")
    throw new Error("permissionVersion must be a string");
  if (
    !Number.isInteger(config.timeoutMs) ||
    config.timeoutMs < 100 ||
    config.timeoutMs > 3_600_000
  )
    throw new Error("timeoutMs must be an integer between 100 and 3600000");
  if (
    !Number.isInteger(config.memoryLimitBytes) ||
    config.memoryLimitBytes < 1024 * 1024 ||
    config.memoryLimitBytes > 1024 * 1024 * 1024
  )
    throw new Error("memoryLimitBytes must be between 1 MiB and 1 GiB");
  if (
    config.model &&
    (typeof config.model.provider !== "string" ||
      typeof config.model.id !== "string")
  )
    throw new Error("model requires provider and id");
  return config;
}

export async function setPermissions(
  library: Library,
  mode: PermissionMode,
): Promise<Config> {
  if (mode !== "manual" && mode !== "auto")
    throw new Error("permissions must be manual or auto");
  return library.locked(() => {
    const current = loadConfig(library.root);
    if (current.permissions === mode) return current;
    const path = join(library.root, "config.json");
    const raw = readJson<Record<string, unknown>>(path) ?? {};
    atomicJson(path, {
      ...raw,
      permissions: mode,
      permissionVersion: randomUUID(),
    });
    return loadConfig(library.root);
  });
}

export function authorizeAutomatic(root: string, version: string): void {
  const config = loadConfig(root);
  if (config.permissions !== "auto" || config.permissionVersion !== version)
    throw new Error(
      "Automatic publishing permission changed. Review this candidate in /atac:inbox.",
    );
}
