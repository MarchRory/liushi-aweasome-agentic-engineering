import { describe, expect, it } from "vitest";

import {
  ActionJournalStatus,
  ActionKind,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  UnresolvedWorktreeProvisionGuard,
  WorktreeProvisionIntentMatch,
  WorktreeProvisionIntentMatcher,
  success,
  type ActionId,
  type ActionIntentRecord,
  type ActionJournalRepository,
  type ActionJournalState,
  type CodingTaskAggregate,
  type ContentDigest,
} from "../../src/index.js";
import { Rfc8785Sha256DigestAdapter } from "../../src/infrastructure/index.js";

const digest = new Rfc8785Sha256DigestAdapter();
const aggregate = {
  codingTaskId: "coding-task-1",
  workspaceId: "workspace-1",
  sourceTaskId: "source-task-1",
  repositoryId: "repository-1",
  baseRevision: "base-revision-1",
  worktreeBinding: {
    worktreeId: "worktree-1",
    relativePath: ".worktrees/coding-task-1",
    branchName: "feature/coding-task-1",
    managed: true,
  },
} as unknown as CodingTaskAggregate;
const provisionActionId = "01ARZ3NDEKTSV4RRFFQ69G5FA1" as ActionId;
const otherActionId = "01ARZ3NDEKTSV4RRFFQ69G5FA2" as ActionId;

describe("未闭合 Worktree Provision Guard", () => {
  it("没有 Provision recoverable 时放行", async () => {
    const unrelated = state(
      ActionJournalStatus.WaitingHuman,
      intent({ kind: ActionKind.FileMutation, target: JSON.stringify({ paths: ["src/a.ts"] }) }),
    );
    const guard = createGuard([unrelated]);

    await expect(guard.check(aggregate)).resolves.toEqual(success(undefined));
  });

  it.each([
    ActionJournalStatus.IntentRecorded,
    ActionJournalStatus.AwaitingResolution,
    ActionJournalStatus.WaitingHuman,
  ])("%s 状态的 Provision 必须阻断", async (status) => {
    const result = await createGuard([state(status)]).check(aggregate);

    expectFailureCode(result, HarnessErrorCode.PreconditionNotMet);
  });

  it("RetryPermitted 只允许同一 Provision Action 自身重试", async () => {
    const guard = createGuard([state(ActionJournalStatus.RetryPermitted)]);

    await expect(guard.check(aggregate, provisionActionId)).resolves.toEqual(success(undefined));
    expectFailureCode(await guard.check(aggregate), HarnessErrorCode.PreconditionNotMet);
    expectFailureCode(
      await guard.check(aggregate, otherActionId),
      HarnessErrorCode.PreconditionNotMet,
    );
  });

  it.each([ActionJournalStatus.Committed, ActionJournalStatus.Recovered])(
    "%s 状态的 Provision 放行",
    async (status) => {
      await expect(createGuard([state(status)]).check(aggregate)).resolves.toEqual(
        success(undefined),
      );
    },
  );

  it("合法的非 Provision Git target 判定为 Unrelated", () => {
    const checkpoint = intent({
      target: JSON.stringify({
        repositoryId: aggregate.repositoryId,
        worktreeId: aggregate.worktreeBinding.worktreeId,
        branchName: aggregate.worktreeBinding.branchName,
      }),
    });

    expect(new WorktreeProvisionIntentMatcher(digest).match(aggregate, checkpoint)).toEqual(
      success(WorktreeProvisionIntentMatch.Unrelated),
    );
  });

  it("非法 JSON fail closed", async () => {
    const result = await createGuard([
      state(ActionJournalStatus.WaitingHuman, intent({ target: "{" })),
    ]).check(aggregate);

    expectFailureCode(result, HarnessErrorCode.CorruptStore);
  });

  it("完整声明 Provision shape 但 strict schema 无效时 fail closed", async () => {
    const result = await createGuard([
      state(
        ActionJournalStatus.WaitingHuman,
        intent({
          target: JSON.stringify({
            ...provisionTarget(),
            unexpected: true,
          }),
        }),
      ),
    ]).check(aggregate);

    expectFailureCode(result, HarnessErrorCode.CorruptStore);
  });

  it("精确身份但 Postcondition Digest 错误时 fail closed", async () => {
    const result = await createGuard([
      state(
        ActionJournalStatus.WaitingHuman,
        intent({ postconditionDigest: calculateDigest("wrong-postcondition") }),
      ),
    ]).check(aggregate);

    expectFailureCode(result, HarnessErrorCode.CorruptStore);
  });

  it("listRecoverable 抛异常时转换为 HarnessError 并 fail closed", async () => {
    const repository = {
      listRecoverable: () => Promise.reject(new Error("read failed")),
    } as unknown as ActionJournalRepository;
    const result = await new UnresolvedWorktreeProvisionGuard(repository, digest).check(aggregate);

    expectFailureCode(result, HarnessErrorCode.IoFailure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error).toBeInstanceOf(HarnessError);
      expect(result.error.message).toContain("Worktree Provision Guard");
    }
  });
});

function createGuard(states: readonly ActionJournalState[]): UnresolvedWorktreeProvisionGuard {
  const repository = {
    listRecoverable: () => Promise.resolve(success(states)),
  } as unknown as ActionJournalRepository;
  return new UnresolvedWorktreeProvisionGuard(repository, digest);
}

function state(
  status: ActionJournalStatus,
  actionIntent: ActionIntentRecord = intent(),
): ActionJournalState {
  return {
    intent: actionIntent,
    observations: [],
    resolutions: [],
    lastSequence: 1,
    status,
  };
}

function intent(overrides: Partial<ActionIntentRecord> = {}): ActionIntentRecord {
  return {
    actionId: provisionActionId,
    workspaceId: aggregate.workspaceId,
    taskId: aggregate.sourceTaskId,
    kind: ActionKind.GitMutation,
    target: JSON.stringify(provisionTarget()),
    postconditionDigest: calculateDigest({
      repositoryId: aggregate.repositoryId,
      worktreeBinding: aggregate.worktreeBinding,
      baseRevision: aggregate.baseRevision,
    }),
    baseRevision: aggregate.baseRevision,
    ...overrides,
  } as ActionIntentRecord;
}

function provisionTarget() {
  return {
    repositoryId: aggregate.repositoryId,
    worktreeId: aggregate.worktreeBinding.worktreeId,
    relativePath: aggregate.worktreeBinding.relativePath,
    branchName: aggregate.worktreeBinding.branchName,
  };
}

function calculateDigest(input: unknown): ContentDigest {
  const calculated = digest.calculate(input);
  if (calculated.status === ResultStatus.Failure) throw calculated.error;
  return calculated.value;
}

function expectFailureCode(
  result: Awaited<ReturnType<UnresolvedWorktreeProvisionGuard["check"]>>,
  code: HarnessErrorCode,
): void {
  expect(result.status).toBe(ResultStatus.Failure);
  if (result.status === ResultStatus.Failure) expect(result.error.code).toBe(code);
}
