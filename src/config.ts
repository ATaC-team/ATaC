import { join } from "node:path";
import { DEFAULT_LIMITS, type Limits } from "./runtime/runner.js";
import { readJson } from "./library/storage.js";

export interface Config extends Limits {
  model?: { provider: string; id: string };
}
export function loadConfig(root: string): Config {
  const raw = readJson<Partial<Config>>(join(root, "config.json")) ?? {};
  const config = { ...DEFAULT_LIMITS, ...raw };
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
