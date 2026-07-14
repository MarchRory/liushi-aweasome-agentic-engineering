import { lstatSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

import { runProcess } from "../../../common/process/index.mjs";

const MAX_GIT_OUTPUT_BYTES = 4 * 1024 * 1024;

export function assertCodexHostSmokeResultWorktree(manifest, actual) {
  if (
    resolve(actual.root) !== resolve(manifest.paths.worktreeRoot) ||
    actual.headRevision !== manifest.worktree.headRevision ||
    actual.detached !== true ||
    actual.gitEntryKind !== "directory"
  ) {
    throw new Error("Host Smoke 结果 Worktree 的普通 Clone、HEAD 或 detached 状态已漂移。");
  }
}

export function assertCodexHostSmokeGitEvidence(evidence, scenarios) {
  const expectedStatus = [` M ${scenarios.positive.target}`, "?? .codex/hooks.json"].sort();
  if (
    !isDeepStrictEqual([...evidence.status].sort(), expectedStatus) ||
    !isDeepStrictEqual(evidence.changedFiles, [scenarios.positive.target]) ||
    evidence.numstat !== `1\t0\t${scenarios.positive.target}` ||
    countExactLine(evidence.diff, `+${scenarios.positive.marker}`) !== 1 ||
    countText(evidence.positiveContent, scenarios.positive.marker) !== 1 ||
    countText(evidence.negativeContent, scenarios.negative.marker) !== 0
  ) {
    throw new Error("Host Smoke Git 差异未严格满足正向单行写入和负向零写入约束。");
  }
}

export async function inspectCodexHostSmokeGitEvidence(root, scenarios) {
  const status = splitNonEmpty(runGit(root, ["status", "--porcelain=v1", "--untracked-files=all"]));
  const changedFiles = splitNonEmpty(
    runGit(root, ["diff", "--no-ext-diff", "--no-renames", "--name-only", "--"]),
  );
  const numstat = runGit(root, [
    "diff",
    "--no-ext-diff",
    "--no-renames",
    "--numstat",
    "--",
    scenarios.positive.target,
  ]);
  const diff = runGit(root, [
    "diff",
    "--no-ext-diff",
    "--no-renames",
    "--unified=0",
    "--",
    scenarios.positive.target,
  ]);
  const [positiveContent, negativeContent] = await Promise.all([
    readFile(join(root, scenarios.positive.target), "utf8"),
    readFile(join(root, scenarios.negative.target), "utf8"),
  ]);
  return { status, changedFiles, numstat, diff, positiveContent, negativeContent };
}

export function inspectCodexHostSmokeResultWorktree(root) {
  const gitEntry = lstatSync(join(root, ".git"));
  return {
    root,
    headRevision: runGit(root, ["rev-parse", "HEAD"]),
    detached: runGit(root, ["branch", "--show-current"]).length === 0,
    gitEntryKind:
      gitEntry.isDirectory() && !gitEntry.isSymbolicLink() ? "directory" : "unsupported",
  };
}

function runGit(cwd, args) {
  return runProcess("git", args, {
    cwd,
    timeout: 30_000,
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
  }).stdout.trimEnd();
}

function splitNonEmpty(value) {
  return value.length === 0 ? [] : value.split(/\r?\n/u);
}

function countExactLine(value, expected) {
  return value.split(/\r?\n/u).filter((line) => line === expected).length;
}

function countText(value, expected) {
  return value.split(expected).length - 1;
}
