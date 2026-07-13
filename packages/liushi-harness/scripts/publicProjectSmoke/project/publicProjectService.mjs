import { realpath } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";

import { resolveCorepackCliPath, runProcess } from "../../common/process/index.mjs";
import {
  PUBLIC_PACKAGE_MANAGER,
  PUBLIC_REPOSITORY_REVISION,
  PUBLIC_REPOSITORY_URL,
} from "../constants/index.mjs";

export async function clonePublicProject(temporaryRoot) {
  const repositoryRoot = join(temporaryRoot, "repository");
  const source = process.env.LIUSHI_PUBLIC_SMOKE_REPOSITORY ?? PUBLIC_REPOSITORY_URL;
  runProcess("git", ["clone", "--no-checkout", source, repositoryRoot], { cwd: temporaryRoot });
  runGit(repositoryRoot, ["config", "core.autocrlf", "false"]);
  runGit(repositoryRoot, ["checkout", "--detach", PUBLIC_REPOSITORY_REVISION]);
  runGit(repositoryRoot, ["config", "user.name", "liushi-public-smoke"]);
  runGit(repositoryRoot, ["config", "user.email", "liushi-public-smoke@example.invalid"]);
  const canonicalRoot = await realpath(repositoryRoot);
  assertEqual(
    runGit(canonicalRoot, ["rev-parse", "HEAD"]),
    PUBLIC_REPOSITORY_REVISION,
    "固定 Revision",
  );
  assertEqual(
    runGit(canonicalRoot, ["config", "--get", "core.autocrlf"]),
    "false",
    "core.autocrlf",
  );
  assertEqual(runGit(canonicalRoot, ["status", "--porcelain"]), "", "初始 Worktree 状态");
  return canonicalRoot;
}

export function runBaseline(repositoryRoot) {
  runPnpm(repositoryRoot, ["install", "--frozen-lockfile"], 300_000);
  runPnpm(repositoryRoot, ["test"], 300_000);
  assertEqual(runGit(repositoryRoot, ["status", "--porcelain"]), "", "Baseline 后仓库状态");
  return [
    { checkId: "baseline-install", status: "passed" },
    { checkId: "baseline-test", status: "passed" },
  ];
}

export function inspectCompletedWorktree(input) {
  const headRevision = runGit(input.worktreeRoot, ["rev-parse", "HEAD"]);
  const commitCount = Number(
    runGit(input.worktreeRoot, [
      "rev-list",
      "--count",
      `${PUBLIC_REPOSITORY_REVISION}..${headRevision}`,
    ]),
  );
  const changedPaths = runGit(input.worktreeRoot, [
    "diff",
    "--name-only",
    `${PUBLIC_REPOSITORY_REVISION}..${headRevision}`,
  ])
    .split(/\r?\n/u)
    .filter(Boolean);
  const worktreeClean = runGit(input.worktreeRoot, ["status", "--porcelain"]) === "";
  return { headRevision, commitCount, changedPaths, worktreeClean };
}

export function runGit(cwd, args) {
  return runProcess("git", args, { cwd, timeout: 60_000 }).stdout.trim();
}

function runPnpm(cwd, args, timeout) {
  return runProcess(process.execPath, [resolveCorepackCliPath(), PUBLIC_PACKAGE_MANAGER, ...args], {
    cwd,
    timeout,
  });
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} 不符合固定 smoke 约束。`);
}
