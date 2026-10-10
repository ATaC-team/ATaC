import { createHash } from "node:crypto";
import { Script } from "node:vm";
import { Ajv, type ValidateFunction } from "ajv";
import { Type } from "typebox";

export const ManifestSchema = Type.Object(
  {
    program_id: Type.String({ pattern: "^[a-z0-9][a-z0-9-]{0,79}$" }),
    name: Type.String({ minLength: 1, maxLength: 160 }),
    purpose: Type.String({ minLength: 1, maxLength: 4000 }),
    when_to_use: Type.String({ minLength: 1, maxLength: 4000 }),
    tags: Type.Array(Type.String({ maxLength: 80 }), { maxItems: 30 }),
    input_schema: Type.Union([
      Type.Boolean(),
      Type.Record(Type.String(), Type.Unknown()),
    ]),
    output_schema: Type.Union([
      Type.Boolean(),
      Type.Record(Type.String(), Type.Unknown()),
    ]),
    tools: Type.Array(Type.String({ minLength: 1, maxLength: 200 }), {
      uniqueItems: true,
      maxItems: 100,
    }),
    test_tools: Type.Array(Type.String({ minLength: 1, maxLength: 200 }), {
      uniqueItems: true,
      maxItems: 100,
    }),
    side_effects: Type.String({ minLength: 1, maxLength: 4000 }),
  },
  { additionalProperties: false },
);

export interface Manifest {
  program_id: string;
  name: string;
  purpose: string;
  when_to_use: string;
  tags: string[];
  input_schema: Record<string, unknown> | boolean;
  output_schema: Record<string, unknown> | boolean;
  tools: string[];
  test_tools: string[];
  side_effects: string;
}
export interface Bundle {
  manifest: Manifest;
  main: string;
  tests: string;
}
export interface Source {
  session_id: string;
  request_id: string;
  cwd: string;
  goal: string;
}
export type CandidateStatus =
  | "untested"
  | "testing"
  | "failed"
  | "interrupted"
  | "revising"
  | "published"
  | "archived";
export interface Candidate {
  id: string;
  program_id: string;
  revision: string;
  base_version: string | null;
  status: CandidateStatus;
  source: Source;
  created_at: string;
  updated_at: string;
  history: string[];
  diagnostic?: string;
  report_id?: string;
  owner_pid?: number;
  run_id?: string;
  harvest_key?: string;
}
export interface Report {
  id: string;
  revision: string;
  started_at: string;
  finished_at: string;
  ok: boolean;
  interrupted: boolean;
  diagnostic?: string;
  runs: number;
  assertions: number;
  calls: { name: string; status: string }[];
}

export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map(
      (k) =>
        `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`,
    )
    .join(",")}}`;
}
export function hash(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
export function allowedTool(name: string): boolean {
  return !name.startsWith("atac_") && name !== "codemode";
}

function localSchema(schema: unknown): void {
  if (!schema || typeof schema !== "object") return;
  for (const [key, value] of Object.entries(schema)) {
    if (
      (key === "$ref" &&
        (typeof value !== "string" || !value.startsWith("#"))) ||
      key === "$async"
    ) {
      throw new Error(
        "Only local JSON Schema references and synchronous validation are supported",
      );
    }
    if (key === "$id" && value !== "")
      throw new Error("Schema $id is not supported; use local references");
    localSchema(value);
  }
}
export function compileSchema(
  schema: Manifest["input_schema"],
): ValidateFunction {
  localSchema(schema);
  return new Ajv({
    strict: false,
    allErrors: true,
    validateFormats: false,
  }).compile(schema);
}
export function validateValue(
  schema: Manifest["input_schema"],
  value: unknown,
  label: string,
): void {
  const validate = compileSchema(schema);
  if (!validate(value))
    throw new Error(`${label}: ${manifestAjv.errorsText(validate.errors)}`);
}
const manifestAjv = new Ajv({ strict: false, allErrors: true });
const validateManifest = manifestAjv.compile(ManifestSchema);
export function validateBundle(value: Bundle): Bundle {
  // Copy across a JSON boundary; callers cannot mutate a stored or executing snapshot.
  const json = JSON.stringify(value);
  if (json.length > 512_000) throw new Error("Program exceeds 512 KB");
  const bundle = JSON.parse(json) as Bundle;
  if (!validateManifest(bundle.manifest))
    throw new Error(
      `Invalid manifest: ${manifestAjv.errorsText(validateManifest.errors)}`,
    );
  for (const name of [
    ...bundle.manifest.tools,
    ...bundle.manifest.test_tools,
  ]) {
    if (!allowedTool(name))
      throw new Error(
        `Program recursion/orchestration is not supported: ${name}`,
      );
  }
  for (const [name, code] of [
    ["main.js", bundle.main],
    ["tests.js", bundle.tests],
  ]) {
    if (typeof code !== "string" || !code.trim())
      throw new Error(`${name} must contain code`);
    new Script(`(async function(){\n${code}\n})`, { filename: name });
  }
  compileSchema(bundle.manifest.input_schema);
  compileSchema(bundle.manifest.output_schema);
  return { manifest: bundle.manifest, main: bundle.main, tests: bundle.tests };
}
