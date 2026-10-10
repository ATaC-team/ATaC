import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import lockfile from "proper-lockfile";
import {
  type Bundle,
  type Candidate,
  type Report,
  type Source,
  hash,
  validateBundle,
} from "./program.js";

export function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code !== "ESRCH";
  }
}
export function readJson<T>(path: string): T | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw e;
  }
}
export function atomicJson(path: string, value: unknown): void {
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
    renameSync(temp, path);
  } finally {
    rmSync(temp, { force: true });
  }
}
function safeId(value: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,99}$/.test(value))
    throw new Error("Invalid identifier");
  return value;
}
function revisionId(value: string): string {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error("Invalid revision");
  return value;
}

export class Library {
  constructor(readonly root = join(homedir(), ".atac")) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    for (const name of ["objects", "programs", "inbox", "reports", "jobs"])
      mkdirSync(join(root, name), { recursive: true, mode: 0o700 });
  }
  async locked<T>(fn: () => T): Promise<T> {
    const release = await lockfile.lock(this.root, {
      lockfilePath: join(this.root, ".lock"),
      stale: 10_000,
      retries: { retries: 150, factor: 1, minTimeout: 100, maxTimeout: 100 },
    });
    try {
      return fn();
    } finally {
      await release();
    }
  }
  private candidatePath(id: string): string {
    return join(this.root, "inbox", `${safeId(id)}.json`);
  }
  candidate(id: string): Candidate {
    const candidate = readJson<Candidate>(this.candidatePath(id));
    if (!candidate) throw new Error("Candidate not found");
    return candidate;
  }
  inbox(history = false): Candidate[] {
    return readdirSync(join(this.root, "inbox"))
      .filter((n) => n.endsWith(".json"))
      .map((n) => readJson<Candidate>(join(this.root, "inbox", n))!)
      .filter((c) => history || !["published", "archived"].includes(c.status))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
  current(programId: string): string | null {
    return (
      readJson<{ revision: string }>(
        join(this.root, "programs", safeId(programId), "current.json"),
      )?.revision ?? null
    );
  }
  bundle(revision: string): Bundle {
    const dir = join(this.root, "objects", revisionId(revision));
    const bundle = validateBundle({
      manifest: readJson(join(dir, "manifest.json"))!,
      main: readFileSync(join(dir, "main.js"), "utf8"),
      tests: readFileSync(join(dir, "tests.js"), "utf8"),
    });
    if (hash(bundle) !== revision)
      throw new Error("Program integrity check failed");
    return bundle;
  }
  private putBundle(bundle: Bundle): string {
    const revision = hash(bundle);
    const dest = join(this.root, "objects", revision);
    if (existsSync(dest)) {
      this.bundle(revision);
      return revision;
    }
    const temp = join(this.root, "objects", `.tmp-${randomUUID()}`);
    mkdirSync(temp, { mode: 0o700 });
    try {
      atomicJson(join(temp, "manifest.json"), bundle.manifest);
      writeFileSync(join(temp, "main.js"), bundle.main, { mode: 0o600 });
      writeFileSync(join(temp, "tests.js"), bundle.tests, { mode: 0o600 });
      renameSync(temp, dest);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
    return revision;
  }
  async save(
    value: Bundle,
    source: Source,
    update?: {
      id: string;
      expected_revision: string;
      base_version?: string | null;
    },
    harvestKey?: string,
  ): Promise<Candidate> {
    const bundle = validateBundle(value);
    return this.locked(() => {
      if (harvestKey) {
        const recovered = this.inbox(true).find(
          (c) => c.harvest_key === harvestKey,
        );
        if (recovered) return recovered;
      }
      const revision = this.putBundle(bundle);
      const previous = update ? this.candidate(update.id) : undefined;
      if (
        previous &&
        (previous.revision !== update!.expected_revision ||
          ["published", "archived"].includes(previous.status))
      )
        throw new Error("Candidate changed; reload Inbox before revising");
      if (previous && previous.program_id !== bundle.manifest.program_id)
        throw new Error("Revision cannot change program_id");
      const duplicate = this.inbox().find((c) => c.revision === revision);
      if (duplicate && duplicate.id !== previous?.id) return duplicate;
      if (!previous && this.current(bundle.manifest.program_id) === revision)
        throw new Error("This program version is already published");
      const now = new Date().toISOString();
      const record: Candidate = {
        id: previous?.id ?? randomUUID(),
        program_id: bundle.manifest.program_id,
        revision,
        base_version:
          update && "base_version" in update
            ? update.base_version!
            : previous
              ? previous.base_version
              : this.current(bundle.manifest.program_id),
        status: "untested",
        source: previous?.source ?? source,
        created_at: previous?.created_at ?? now,
        updated_at: now,
        history: previous
          ? [...new Set([...previous.history, previous.revision])]
          : [],
        ...(harvestKey || previous?.harvest_key
          ? { harvest_key: harvestKey ?? previous!.harvest_key }
          : {}),
      };
      atomicJson(this.candidatePath(record.id), record);
      return record;
    });
  }
  async change(
    id: string,
    revision: string,
    fn: (candidate: Candidate) => void,
  ): Promise<Candidate> {
    return this.locked(() => {
      const c = this.candidate(id);
      if (c.revision !== revision)
        throw new Error("Candidate changed; reopen details");
      fn(c);
      c.updated_at = new Date().toISOString();
      atomicJson(this.candidatePath(id), c);
      return c;
    });
  }
  async claim(id: string, revision: string): Promise<Candidate> {
    return this.change(id, revision, (c) => {
      if (!["untested", "failed", "interrupted"].includes(c.status))
        throw new Error(`Candidate is ${c.status}`);
      c.status = "testing";
      c.owner_pid = process.pid;
      c.run_id = randomUUID();
      delete c.diagnostic;
    });
  }
  async finish(
    claim: Candidate,
    report: Report,
    signal?: AbortSignal,
  ): Promise<Candidate> {
    return this.locked(() => {
      if (signal?.aborted) {
        report.ok = false;
        report.interrupted = true;
        report.diagnostic = "Verification interrupted before publication";
      }
      atomicJson(
        join(this.root, "reports", `${safeId(report.id)}.json`),
        report,
      );
      const c = this.candidate(claim.id);
      if (
        c.revision !== claim.revision ||
        c.run_id !== claim.run_id ||
        c.status !== "testing"
      )
        throw new Error(
          "Test snapshot is no longer current; nothing was published",
        );
      if (report.revision !== c.revision)
        throw new Error("Report does not match candidate");
      c.report_id = report.id;
      c.status = report.interrupted ? "interrupted" : "failed";
      c.diagnostic = report.diagnostic;
      if (
        report.ok &&
        report.runs > 0 &&
        report.assertions > 0 &&
        !report.interrupted
      ) {
        if (this.current(c.program_id) !== c.base_version) {
          c.diagnostic =
            "Publication conflict: the formal version changed. Revise against the current version and test again.";
        } else {
          this.bundle(c.revision);
          const dir = join(this.root, "programs", safeId(c.program_id));
          mkdirSync(join(dir, "versions"), { recursive: true, mode: 0o700 });
          const versionPath = join(dir, "versions", `${c.revision}.json`);
          if (!existsSync(versionPath))
            atomicJson(versionPath, {
              revision: c.revision,
              report_id: report.id,
              source: c.source,
            });
          atomicJson(join(dir, "current.json"), { revision: c.revision });
          c.status = "published";
        }
      }
      delete c.run_id;
      delete c.owner_pid;
      c.updated_at = new Date().toISOString();
      atomicJson(this.candidatePath(c.id), c);
      return c;
    });
  }
  async recordExecution(revision: string, summary: unknown): Promise<void> {
    await this.locked(() =>
      atomicJson(join(this.root, "reports", `execution-${randomUUID()}.json`), {
        kind: "execution",
        revision,
        ...(summary as object),
      }),
    );
  }
  get(
    programId: string,
    revision = this.current(programId),
  ): { revision: string; bundle: Bundle; report: Report } {
    if (!revision) throw new Error("Program not found");
    const record = readJson<{ report_id: string }>(
      join(
        this.root,
        "programs",
        safeId(programId),
        "versions",
        `${revisionId(revision)}.json`,
      ),
    );
    if (!record) throw new Error("Version is not published");
    const bundle = this.bundle(revision);
    if (bundle.manifest.program_id !== programId)
      throw new Error("Program identity mismatch");
    const report = readJson<Report>(
      join(this.root, "reports", `${safeId(record.report_id)}.json`),
    );
    if (!report?.ok || report.revision !== revision)
      throw new Error("Missing successful verification report");
    return { revision, bundle, report };
  }
  published() {
    return readdirSync(join(this.root, "programs")).flatMap((id) => {
      const revision = this.current(id);
      return revision
        ? [{ revision, manifest: this.get(id, revision).bundle.manifest }]
        : [];
    });
  }
  search(query: string, limit = 10) {
    const tokens = [
      ...new Set(query.toLocaleLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? []),
    ];
    const segmenter = new Intl.Segmenter("zh", { granularity: "word" });
    for (const s of segmenter.segment(query.toLowerCase()))
      if (s.isWordLike && !tokens.includes(s.segment)) tokens.push(s.segment);
    return this.published()
      .flatMap(({ revision, manifest: m }) => {
        const doc = [
          m.program_id,
          m.name,
          m.purpose,
          m.when_to_use,
          ...m.tags,
          ...m.tools,
        ]
          .join(" ")
          .toLowerCase();
        const score = tokens.reduce((n, t) => n + (doc.includes(t) ? 1 : 0), 0);
        return tokens.length && !score
          ? []
          : [
              {
                program_id: m.program_id,
                revision,
                name: m.name,
                purpose: m.purpose,
                when_to_use: m.when_to_use,
                tools: m.tools,
                score,
              },
            ];
      })
      .sort(
        (a, b) => b.score - a.score || a.program_id.localeCompare(b.program_id),
      )
      .slice(0, Math.max(1, Math.min(limit, 50)));
  }
  async recover(): Promise<void> {
    await this.locked(() => {
      for (const c of this.inbox())
        if (
          ["testing", "revising"].includes(c.status) &&
          (!c.owner_pid || !alive(c.owner_pid))
        ) {
          if (this.current(c.program_id) === c.revision) {
            const published = this.get(c.program_id, c.revision);
            c.status = "published";
            c.report_id = published.report.id;
            delete c.diagnostic;
          } else {
            c.status = "interrupted";
            c.diagnostic =
              "Previous process stopped. Tests are never replayed automatically.";
          }
          delete c.owner_pid;
          delete c.run_id;
          atomicJson(this.candidatePath(c.id), c);
        }
    });
  }
}
