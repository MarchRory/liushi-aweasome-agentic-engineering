import type { CodingTaskSessionCloseoutState } from "#application/codingTaskSessionCloseoutState/index.js";
import type { ChangeSetCheckpointInput } from "#application/changeSetCheckpoint/index.js";
import type { InspectGitChangeSetInput } from "#application/ports/gitChangeSetInspector/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  type Result,
} from "#common/index.js";
import { createCodingTaskSessionCheckpointInput } from "../checkpointInput/index.js";
import type {
  CodingTaskSessionCloseoutAuthority,
  CodingTaskSessionCloseoutCheckpointResult,
  CodingTaskSessionCloseoutManagerDependencies,
  CodingTaskSessionCloseoutRunResult,
  CodingTaskSessionCloseoutStateMachineInput,
} from "../contracts/index.js";

/** 根据权威 Aggregate 构造 Snapshot 检查输入。 */
export function createSnapshotInput(
  authority: CodingTaskSessionCloseoutAuthority,
): InspectGitChangeSetInput {
  const aggregate = authority.codingTask.aggregate;
  return {
    repositoryId: aggregate.repositoryId,
    repositoryRoot: authority.repositoryRoot,
    worktreeBinding: aggregate.worktreeBinding,
    baseRevision: aggregate.baseRevision,
    writeSet: aggregate.writeSet,
  };
}

/** 根据权威 Aggregate 与已持久化 Snapshot 构造 Checkpoint 输入。 */
export function createCheckpointInput(
  authority: CodingTaskSessionCloseoutAuthority,
  snapshot: NonNullable<CodingTaskSessionCloseoutState["snapshot"]>,
): ChangeSetCheckpointInput {
  return createCodingTaskSessionCheckpointInput({
    repositoryRoot: authority.repositoryRoot,
    aggregate: authority.codingTask.aggregate,
    snapshot,
  });
}

/** 调用 Admission 关闭窄契约，并把抛出转换为可分类失败。 */
export async function invokeAdmission(
  input: CodingTaskSessionCloseoutStateMachineInput,
): Promise<
  Awaited<
    ReturnType<CodingTaskSessionCloseoutManagerDependencies["admissionCloser"]["beginClosing"]>
  >
> {
  try {
    return await input.dependencies.admissionCloser.beginClosing({
      workspaceId: input.authority.activation.workspaceId,
      sessionId: input.authority.activation.sessionId,
      updatedAt: input.dependencies.clock.now().toISOString(),
    });
  } catch (error) {
    return failure(asInvocationError(error, "Admission 关闭调用抛出异常。"));
  }
}

/** 调用 Coverage 构建窄契约，并把抛出转换为可分类失败。 */
export async function invokeCoverage(
  input: CodingTaskSessionCloseoutStateMachineInput,
): Promise<
  Awaited<ReturnType<CodingTaskSessionCloseoutManagerDependencies["coverageBuilder"]["create"]>>
> {
  try {
    return await input.dependencies.coverageBuilder.create({
      workspaceId: input.authority.activation.workspaceId,
      sessionId: input.authority.activation.sessionId,
    });
  } catch (error) {
    return failure(asInvocationError(error, "Coverage 构建调用抛出异常。"));
  }
}

/** 调用 Snapshot 检查窄契约，并把抛出转换为可分类失败。 */
export async function invokeSnapshot(
  dependencies: CodingTaskSessionCloseoutManagerDependencies,
  snapshotInput: InspectGitChangeSetInput,
): Promise<
  Awaited<ReturnType<CodingTaskSessionCloseoutManagerDependencies["snapshotInspector"]["execute"]>>
> {
  try {
    return await dependencies.snapshotInspector.execute(snapshotInput);
  } catch (error) {
    return failure(asInvocationError(error, "Snapshot 检查调用抛出异常。"));
  }
}

/** 调用 Checkpoint execute；任意执行失败都禁止自动重试。 */
export async function invokeCheckpoint(
  dependencies: CodingTaskSessionCloseoutManagerDependencies,
  checkpointInput: ChangeSetCheckpointInput,
): Promise<CodingTaskSessionCloseoutCheckpointResult> {
  try {
    return await dependencies.checkpointPort.execute(checkpointInput);
  } catch (error) {
    return failure(
      new HarnessError(
        HarnessErrorCode.CodingTaskSessionCloseoutCheckpointOutcomeUnknown,
        "Checkpoint 执行调用抛出异常。",
        {},
        error,
      ),
    );
  }
}

/** 调用 Checkpoint inspect；无法证明成功时必须进入 OutcomeUnknown。 */
export async function invokeCheckpointInspection(
  dependencies: CodingTaskSessionCloseoutManagerDependencies,
  checkpointInput: ChangeSetCheckpointInput,
): Promise<
  Awaited<ReturnType<CodingTaskSessionCloseoutManagerDependencies["checkpointPort"]["inspect"]>>
> {
  try {
    return await dependencies.checkpointPort.inspect(checkpointInput);
  } catch (error) {
    return failure(
      new HarnessError(
        HarnessErrorCode.CodingTaskSessionCloseoutCheckpointOutcomeUnknown,
        "Checkpoint 成功后的权威 inspect 调用抛出异常。",
        {},
        error,
      ),
    );
  }
}

/** 持久化普通 State Transition，并保留最近一次可信 State。 */
export async function replaceTransition(
  current: CodingTaskSessionCloseoutState,
  candidate: Result<CodingTaskSessionCloseoutState, HarnessError>,
  dependencies: CodingTaskSessionCloseoutManagerDependencies,
): Promise<CodingTaskSessionCloseoutRunResult> {
  if (candidate.status === ResultStatus.Failure) return { result: candidate, state: current };
  try {
    const replaced = await dependencies.stateStore.replace({
      expectedVersion: current.version,
      state: candidate.value,
    });
    return replaced.status === ResultStatus.Failure
      ? { result: replaced, state: current }
      : { result: replaced, state: replaced.value };
  } catch (error) {
    return {
      result: failure(
        new HarnessError(
          HarnessErrorCode.CodingTaskSessionCloseoutCommitOutcomeUnknown,
          "Closeout State replace 调用抛出异常。",
          {},
          error,
        ),
      ),
      state: current,
    };
  }
}

function asInvocationError(error: unknown, message: string): HarnessError {
  return error instanceof HarnessError
    ? error
    : new HarnessError(HarnessErrorCode.IoFailure, message, {}, error);
}
