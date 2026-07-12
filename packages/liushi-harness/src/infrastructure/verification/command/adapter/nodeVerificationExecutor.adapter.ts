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
import { isWithinRoot } from "#infrastructure/worktree/path/index.js";

import { MAX_VERIFICATION_OUTPUT_BYTES } from "../constants/index.js";
import { verifyRevisionBinding, verifyWorktreeStability } from "../guard/index.js";

/** 使用非 Shell 子进程执行已确认的验证检查。 */
export class NodeVerificationExecutorAdapter implements VerificationExecutorPort {
  public constructor(
    private readonly runner: CommandRunner,
    private readonly clock: Clock,
  ) {}

  /** 在真实工作树和环境白名单边界内执行一个检查。 */
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
      input.plan.expectedBranchName,
      input.check.timeoutMs,
    );
    if (revisionFailure !== undefined) {
      return success(blocked(startedAt, this.clock.now().toISOString(), revisionFailure));
    }

    const result = await this.runner.run({
      executable: input.check.command.executable,
      args: input.check.command.args,
      cwd: workingDirectory,
      timeoutMs: input.check.timeoutMs,
      environment: selectEnvironment(input.check.command.allowedEnvironmentKeys),
      maxOutputBytes: MAX_VERIFICATION_OUTPUT_BYTES,
    });
    const completedAt = this.clock.now().toISOString();
    if (result.status === ResultStatus.Failure) return result;
    const stabilityFailure = await verifyWorktreeStability(
      this.runner,
      input.worktreeRoot,
      input.plan.targetRevision,
      input.check.timeoutMs,
    );
    if (stabilityFailure !== undefined) {
      return success({
        status: VerificationStatus.Blocked,
        exitCode: result.value.exitCode,
        stdout: result.value.stdout,
        stderr: result.value.stderr,
        failureKind: stabilityFailure,
        startedAt,
        completedAt,
      });
    }
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
    return (await lstat(actual)).isDirectory() && isWithinRoot(root, actual) ? actual : undefined;
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
    const failureKind =
      result.launchError === "timeout"
        ? VerificationFailureKind.TimedOut
        : result.launchError === "output_limit"
          ? VerificationFailureKind.OutputLimit
          : VerificationFailureKind.Unavailable;
    return {
      status: VerificationStatus.Blocked,
      exitCode: null,
      stdout: result.stdout,
      stderr: result.stderr,
      failureKind,
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
