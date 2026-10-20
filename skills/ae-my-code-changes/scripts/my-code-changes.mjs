import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

function run(cmd) {
  try {
    return execSync(cmd, { encoding: "utf-8", maxBuffer: 100 * 1024 * 1024, stdio: ["pipe", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

const args = process.argv.slice(2);
let since = "";
let until = "";

for (const arg of args) {
  if (arg.startsWith("--since=")) since = arg.slice(8);
  if (arg.startsWith("--until=")) until = arg.slice(8);
}

if (!since) {
  console.error("Usage: node my-code-changes.mjs --since=<date> [--until=<date>]");
  console.error("  date format: any git-compatible date, e.g. 2025-06-01, '2 weeks ago'");
  process.exit(1);
}

// Git on Windows may fail to match date-only YYYY-MM-DD in --since/--until;
// append a minimal time component to make it a valid datetime literal.
function ensureDatetime(raw) {
  if (!raw) return raw;
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed + " 00:00:00";
  return trimmed;
}
since = ensureDatetime(since);
until = ensureDatetime(until);

const now = new Date();
let isUpToNow = !until;
if (until) {
  const untilDate = new Date(until);
  if (isNaN(untilDate.getTime()) || untilDate > now) {
    isUpToNow = true;
  }
}

const localName = run("git config user.name");
const localEmail = run("git config user.email");
const globalName = run("git config --global user.name");
const globalEmail = run("git config --global user.email");

const authors = [...new Set([localName, globalName].filter(Boolean))];
if (authors.length === 0) {
  console.error("Cannot determine git user.name from either local or global config.");
  process.exit(1);
}

let logCmd = `git log --since="${since}"`;
for (const author of authors) {
  logCmd += ` --author="${author}"`;
}
if (until && !isUpToNow) logCmd += ` --until="${until}"`;
logCmd += " --name-only --pretty=format:";

const committedFiles = run(logCmd)
  .split("\n")
  .map((f) => f.trim().replace(/^"|"$/g, ""))
  .filter((f) => f.length > 0);

let uncommittedFiles = [];
if (isUpToNow) {
  const statusOutput = run("git status --porcelain");
  uncommittedFiles = statusOutput
  .split("\n")
  .filter((line) => line.trim())
  .flatMap((line) => {
    const content = line.slice(3).trim();
    if (!content) return [];
    // Handle renamed/copied: "R  old -> new"
    const arrowIdx = content.indexOf(" -> ");
    if (arrowIdx >= 0) {
      const oldPath = content.slice(0, arrowIdx).replace(/^"|"$/g, "");
      const newPath = content.slice(arrowIdx + 4).replace(/^"|"$/g, "");
      return oldPath === newPath ? [oldPath] : [oldPath, newPath];
    }
    return [content.replace(/^"|"$/g, "")];
  })
  .filter((f) => f.length > 0 && !f.endsWith("/") && !f.endsWith("\\"));
}

const allFiles = [...new Set([...committedFiles, ...uncommittedFiles])].sort();

const committedSet = new Set(committedFiles);
const uncommittedSet = new Set(uncommittedFiles);

let baseCommit = run(`git log --before="${since}" -1 --format="%H"`);
if (!baseCommit) {
  baseCommit = EMPTY_TREE;
}

const emails = [...new Set([localEmail, globalEmail].filter(Boolean))];
const userDesc = authors.join(", ");
const emailDesc = emails.join(", ");
console.log(`User: ${userDesc}${emailDesc ? ` <${emailDesc}>` : ""}`);
console.log(`Range: ${since}${until && !isUpToNow ? " ~ " + until : " ~ now"}`);
console.log(`Base: ${baseCommit === EMPTY_TREE ? "(empty tree — before repo history)" : baseCommit}`);
console.log(`Changed files: ${allFiles.length} (committed: ${committedFiles.length}${isUpToNow ? `, uncommitted: ${uncommittedFiles.length}` : ""})`);
if (!isUpToNow) {
  console.log("(uncommitted changes excluded — --until is a past date)");
}
if (committedFiles.length === 0 && since) {
  console.log(`Note: No commits found for ${userDesc} in range. Verify the date range (--since="${since}"${until ? ` --until="${until}"` : ""}) and try adjusting it.`);
  const repoFirstCommit = run("git log --reverse --format=%ai -1");
  const repoLastCommit = run("git log --format=%ai -1");
  if (repoFirstCommit) console.log(`Repo commit span: ${repoFirstCommit} ~ ${repoLastCommit}`);
}
console.log("=".repeat(60));

for (const file of allFiles) {
  const inCommitted = committedSet.has(file);
  const inUncommitted = uncommittedSet.has(file);
  const tags = [];
  if (inCommitted) tags.push("committed");
  if (inUncommitted) tags.push("uncommitted");

  console.log(`\n--- ${file} [${tags.join(", ")}] ---`);

  if (!existsSync(file)) {
    if (!inCommitted) {
      console.log("(uncommitted file deleted in working tree)");
      continue;
    }
    console.log("(file deleted in working tree, showing last committed content)");
  }

  const diff = run(`git diff "${baseCommit}" -- "${file}"`);
  if (diff) {
    console.log(diff);
  } else {
    console.log("(no diff from base)");
  }
}
