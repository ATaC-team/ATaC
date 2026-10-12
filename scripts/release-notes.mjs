import { readFileSync } from "node:fs";

const tag = process.argv[2];
if (process.argv.length !== 3 || !/^v\d+\.\d+\.\d+$/.test(tag ?? ""))
  throw new Error("Usage: node scripts/release-notes.mjs vX.Y.Z");
const version = tag.slice(1);
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
if (
  [pkg.version, lock.version, lock.packages?.[""]?.version].some(
    (v) => v !== version,
  )
)
  throw new Error(
    "Tag, package.json, and package-lock.json versions must match",
  );

const changelog = readFileSync("CHANGELOG.md", "utf8").replace(/\r\n/g, "\n");
const entries = [
  ...changelog.matchAll(/^## \[([^\]]+)\] - (\d{4}-\d{2}-\d{2})$/gm),
];
const current = entries[0];
if (
  !current ||
  current[1] !== version ||
  entries.filter((e) => e[1] === version).length !== 1
)
  throw new Error(
    "The leading changelog entry must uniquely match the release version",
  );
const date = new Date(current[2]);
if (
  Number.isNaN(date.getTime()) ||
  date.toISOString().slice(0, 10) !== current[2]
)
  throw new Error("Invalid changelog release date");
const start = current.index + current[0].length;
const end = changelog.indexOf("\n## ", start);
const notes = changelog.slice(start, end === -1 ? undefined : end).trim();
const chinese = notes.indexOf("### 中文\n");
const english = notes.indexOf("### English\n");
if (
  chinese !== 0 ||
  english < 0 ||
  !/^- /m.test(notes.slice(chinese, english)) ||
  !/^- /m.test(notes.slice(english))
)
  throw new Error(
    "Release notes require Chinese and English sections with change bullets",
  );

process.stdout.write(
  `${notes}\n\n## Install / 安装\n\n\`\`\`sh\npi install git:github.com/ATaC-team/ATaC@${tag}\n\`\`\`\n\nRequires Node.js 22.19+ and pi 1.1.x. / 需要 Node.js 22.19+ 和 pi 1.1.x。\n`,
);
