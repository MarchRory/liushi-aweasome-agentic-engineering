import { lstat, realpath } from "node:fs/promises";
import { resolve } from "node:path";

import type {
  VerificationExecutionRequest,
  VerificationExecutorPort,
} from "#application/ports/verification/index.js";
import {
  ResultStatus,
  success,
  type Clock,
  type HarnessError,
  type Result,
} from "#common/index.js";
import {
  VerificationFailureKind,
  VerificationStatus,
  type VerificationExecutionResult,
} from "#domain/verification/index.js";
import type { CommandRunResult, CommandRunner } from "#infrastructure/system/index.js";
import { isWithinRoot, sameResolvedPath } from "#infrastructure/worktree/path/index.js";

import { MAX_VERIFICATION_OUTPUT_BYTES } from "../constants/index.js";

/** 使用 shell=false 子进程执行已确认 Verification Check 的真实 Adapter。 */
export class NodeVerificationExecutorAdapter implements VerificationExecutorPort {
  public constructor(
    private readonly runner: CommandRunner,
    private readonly clock: Clock,
  ) {}

  /** 在真实 Worktree containment 和环境白名单边界内执行一个 Check。 */
  public async execute(
    input: VerificationExecutionRequest,
  ): Promise<Result<VerificationExecutionResult, HarnessError>> {
    const startedAt = this.clock.now().toISOString();
    const workingDirectory = await resolveWorkingDirectory(
      input.worktreeRoot,
      input.check.command.workingDirectory,
    );
    if (workingDirectory === undefined) {
      return success(
        blocked(
          startedAt,
          this.clock.now().toISOString(),
          VerificationFailureKind.WorktreeUnavailable,
        ),
      );
    }
    const revisionFailure = await verifyRevisionBinding(
      this.runner,
      input.worktreeRoot,
      input.plan.baseRevision,
      input.plan.targetRevision,
      input.check.timeoutMs,
    );
    if (revisionFailure !== undefined) {
      return success(blocked(startedAt, this.clock.now().toISOString(), revisionFailure));
    }

    const environment = selectEnvironment(input.check.command.allowedEnvironmentKeys);
    const result = await this.runner.run({
      executable: input.check.command.executable,
      args: input.check.command.args,
      cwd: workingDirectory,
      timeoutMs: input.check.timeoutMs,
      environment,
      maxOutputBytes: MAX_VERIFICATION_OUTPUT_BYTES,
    });
    const completedAt = this.clock.now().toISOString();
    if (result.status === ResultStatus.Failure) return result;
    return success(projectResult(result.value, startedAt, completedAt));
  }
}

async function resolveWorkingDirectory(
  worktreeRoot: string,
  relativeDirectory: string,
): Promise<string | undefined> {
  try {
    const root = await realpath(worktreeRoot);
    if (!(await lstat(root)).isDirectory()) return undefined;
    const candidate = resolve(root, ...relativeDirectory.split("/").filter(Boolean));
    if (!isWithinRoot(root, candidate)) return undefined;
    const actual = await realpath(candidate);
    if (!(await lstat(actual)).isDirectory() || !isWithinRoot(root, actual)) return undefined;
    return actual;
  } catch {
    return undefined;
  }
}

function selectEnvironment(keys: readonly string[]): Readonly<Record<string, string>> {
  const selected: Record<string, string> = {};
  for (const key of keys) {
    const value = process.env[key];
    if (value !== undefined) selected[key] = value;
  }
  return selected;
}

function projectResult(
  result: CommandRunResult,
  startedAt: string,
  completedAt: string,
): VerificationExecutionResult {
  if (result.launchError !== undefined) {
    return {
      status: VerificationStatus.Blocked,
      exitCode: null,
      stdout: result.stdout,
      stderr: result.stderr,
      failureKind:
        result.launchError === "timeout"
          ? VerificationFailureKind.TimedOut
          : result.launchError === "output_limit"
            ? VerificationFailureKind.OutputLimit
            : VerificationFailureKind.Unavailable,
      startedAt,
      completedAt,
    };
  }
  if (result.exitCode === 0) {
    return {
      status: VerificationStatus.Passed,
      exitCode: 0,
      stdout: result.stdout,
      stderr: result.stderr,
      startedAt,
      completedAt,
    };
  }
  return {
    status: VerificationStatus.Failed,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    failureKind: VerificationFailureKind.CommandFailed,
    startedAt,
    completedAt,
  };
}

async function verifyRevisionBinding(
  runner: CommandRunner,
  worktreeRoot: string,
  baseRevision: string,
  targetRevision: string,
  timeoutMs: number,
): Promise<VerificationFailureKind | undefined> {
  const commands: readonly {
    readonly args: readonly string[];
    readonly failureKind: VerificationFailureKind;
  }[] = [
    {
      args: ["rev-parse", "--show-toplevel"],
      failureKind: VerificationFailureKind.WorktreeUnavailable,
    },
    {
      args: ["rev-parse", "--verify", "HEAD"],
      failureKind: VerificationFailureKind.WorktreeUnavailable,
    },
    {
      args: ["rev-parse", "--verify", `${targetRevision}^{commit}`],
      failureKind: VerificationFailureKind.RevisionMismatch,
    },
    {
      args: ["rev-parse", "--verify", `${baseRevision}^{commit}`],
      failureKind: VerificationFailureKind.RevisionMismatch,
    },
  ];
  const outputs: string[] = [];
  for (const command of commands) {
    const result = await runner.run({
      executable: "git",
      args: command.args,
      cwd: worktreeRoot,
      timeoutMs,
      maxOutputBytes: 65_536,
    });
    if (
      result.status === ResultStatus.Failure ||
      result.value.exitCode !== 0 ||
      result.value.launchError !== undefined
    ) {
      return command.failureKind;
    }
    outputs.push(result.value.stdout.trim());
  }
  const [actualRoot, headRevision, targetCommit, baseCommit] = outputs;
  if (actualRoot === undefined || !sameResolvedPath(actualRoot, worktreeRoot)) {
    return VerificationFailureKind.WorktreeUnavailable;
  }
  if (headRevision !== targetCommit) return VerificationFailureKind.RevisionMismatch;
  const ancestor = await runner.run({
    executable: "git",
    args: ["merge-base", "--is-ancestor", baseCommit ?? "", targetCommit ?? ""],
    cwd: worktreeRoot,
    timeoutMs,
    maxOutputBytes: 65_536,
  });
  if (
    ancestor.status === ResultStatus.Failure ||
    ancestor.value.launchError !== undefined ||
    ancestor.value.exitCode !== 0
  ) {
    return VerificationFailureKind.RevisionMismatch;
  }
  return undefined;
}

function blocked(
  startedAt: string,
  completedAt: string,
  failureKind: VerificationFailureKind,
): VerificationExecutionResult {
  return {
    status: VerificationStatus.Blocked,
    exitCode: null,
    stdout: "",
    stderr: "",
    failureKind,
    startedAt,
    completedAt,
  };
}
