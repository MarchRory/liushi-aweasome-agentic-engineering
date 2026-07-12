import type {
  VerificationExecutionRequest,
  VerificationExecutorPort,
} from "#application/ports/index.js";
import { success, type Clock, type HarnessError, type Result } from "#common/index.js";
import {
  VerificationFailureKind,
  VerificationStatus,
  type VerificationExecutionResult,
} from "#domain/verification/index.js";

import type { MockVerificationOutcome } from "../contracts/index.js";

/** 仅返回注入结果的 Verification Adapter，绝不执行外部命令。 */
export class MockVerificationExecutorAdapter implements VerificationExecutorPort {
  public constructor(
    private readonly clock: Clock,
    private readonly outcomes: ReadonlyMap<string, MockVerificationOutcome> = new Map(),
  ) {}

  /** 未配置结果时 fail-closed 为 Blocked，避免测试替身制造虚假通过。 */
  public execute(
    input: VerificationExecutionRequest,
  ): Promise<Result<VerificationExecutionResult, HarnessError>> {
    const startedAt = this.clock.now().toISOString();
    const outcome = this.outcomes.get(input.check.checkId);
    const completedAt = this.clock.now().toISOString();

    if (outcome === undefined) {
      return Promise.resolve(
        success<VerificationExecutionResult>({
          status: VerificationStatus.Blocked,
          failureKind: VerificationFailureKind.Unconfigured,
          exitCode: null,
          stdout: "",
          stderr: "",
          startedAt,
          completedAt,
        }),
      );
    }

    const failureKind = outcome.failureKind ?? defaultFailureKind(outcome.status);
    return Promise.resolve(
      success<VerificationExecutionResult>({
        status: outcome.status,
        exitCode:
          outcome.exitCode === undefined ? defaultExitCode(outcome.status) : outcome.exitCode,
        stdout: outcome.stdout ?? "",
        stderr: outcome.stderr ?? "",
        ...(failureKind === undefined ? {} : { failureKind }),
        startedAt,
        completedAt,
      }),
    );
  }
}

function defaultExitCode(status: VerificationStatus): number | null {
  if (status === VerificationStatus.Passed) return 0;
  if (status === VerificationStatus.Failed) return 1;
  return null;
}

function defaultFailureKind(status: VerificationStatus): VerificationFailureKind | undefined {
  if (status === VerificationStatus.Failed) return VerificationFailureKind.CommandFailed;
  if (status === VerificationStatus.Blocked) return VerificationFailureKind.Unavailable;
  return undefined;
}
