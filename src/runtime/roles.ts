import { AsyncLocalStorage } from "node:async_hooks";

// Shared even when pi loads another copy of this package through its extension loader.
const key = Symbol.for("atac.child-session-role");
const registry = globalThis as unknown as Record<
  symbol,
  AsyncLocalStorage<string>
>;
export const roles = (registry[key] ??= new AsyncLocalStorage<string>());
