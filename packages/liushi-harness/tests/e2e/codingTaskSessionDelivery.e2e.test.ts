import { rm } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CodingTaskSessionCloseoutRecoveryDisposition,
  CodingTaskSessionCloseoutRecoveryResolution,
  CodingTaskSessionCloseoutStatus,
  CodingTaskSessionEffectiveCloseoutSource,
  CommandStatus,
} from "../../src/application/index.js";
import { ActorKind, ResultStatus } from "../../src/common/index.js";
import {
  ACTION_JOURNAL_SCHEMA_VERSION,
  ActionJournalRecordType,
  ActionKind,
} from "../../src/domain/actionJournal/index.js";
import { CodingTaskPhase } from "../../src/domain/codingTask/index.js";
import { CliCommand } from "../../src/presentation/index.js";
import {
  createCodingTaskSessionCloseoutCliApplication,
  createCodingTaskSessionCloseoutCliSetup,
  digestCloseoutCliValue,
  runCloseoutCliGit,
} from "../support/codingTaskSessionCloseoutCli/index.js";
import {
  CLOSEOUT_RECOVERY_CLI_HUMAN_ACTOR_ID,
  createOutcomeUnknownAfterRealCommitFault,
  parseCloseoutRecoverySuccess,
  runCloseoutRecoveryAssessCli,
  runCloseoutRecoveryRecoverCli,
  writeCloseoutRecoveryHumanCommand,
} from "../support/codingTaskSessionCloseoutRecoveryCli/index.js";
import {
  countCodingTaskSessionDeliveryEvents,
  createCodingTaskSessionDeliveryCommand,
  loadCodingTaskSessionDeliveryAggregate,
} from "../support/codingTaskSessionDelivery/index.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("CodingTask Session Delivery 真实 Git E2E", () => {
  it("Original Closeout 只追加 Submission Event，不创建第二个 Git 提交", async () => {
    const setup = await createCodingTaskSessionCloseoutCliSetup(temporaryRoots);
    const closed = await setup.application.closeoutCodingTaskSession.execute(setup.closeoutCommand);
    expect(closed).toMatchObject({
      status: ResultStatus.Success,
      value: { status: CodingTaskSessionCloseoutStatus.CheckpointBound },
    });
    const head = await runCloseoutCliGit(setup.worktreeRoot, ["rev-parse", "HEAD"]);
    expect(await countCommits(setup)).toBe("1");
    expect(await countCodingTaskSessionDeliveryEvents(setup)).toBe(0);

    const before = await loadCodingTaskSessionDeliveryAggregate(setup);
    const command = await createCodingTaskSessionDeliveryCommand(setup);
    expect(command).toMatchObject({
      expectedVersion: before.version,
      aggregateId: setup.codingTaskId,
      causationId: setup.closeoutCommand["commandId"],
      payload: { expectedEffectiveSource: CodingTaskSessionEffectiveCloseoutSource.Original },
    });
    const first = await setup.application.submitCodingTaskSessionDelivery.execute(command);

    expect(first).toMatchObject({
      status: ResultStatus.Success,
      value: {
        status: CommandStatus.Committed,
        committedVersion: before.version + 1,
      },
    });
    await expectSubmittedState(setup, head);

    const replayCommand = await createCodingTaskSessionDeliveryCommand(setup, {
      commandId: "closeout-cli-delivery-replay",
    });
    const restarted = createCodingTaskSessionCloseoutCliApplication(
      setup.storeRoot,
      setup.repositoryRoot,
    );
    const replay = await restarted.submitCodingTaskSessionDelivery.execute(replayCommand);

    expect(replay).toMatchObject({
      status: ResultStatus.Success,
      value: { status: CommandStatus.Committed, committedVersion: before.version + 1 },
    });
    await expectSubmittedState(setup, head);
  }, 45_000);

  it("BindExisting Recovery 交付沿用既有 commit，且来源绑定为 Recovery", async () => {
    const setup = await createCodingTaskSessionCloseoutCliSetup(temporaryRoots);
    const realExecute = setup.application.changeSetCheckpoints.execute.bind(
      setup.application.changeSetCheckpoints,
    );
    vi.spyOn(setup.application.changeSetCheckpoints, "execute").mockImplementationOnce(
      createOutcomeUnknownAfterRealCommitFault(realExecute),
    );
    const closed = await setup.application.closeoutCodingTaskSession.execute(setup.closeoutCommand);
    expect(closed).toMatchObject({
      status: ResultStatus.Success,
      value: { status: CodingTaskSessionCloseoutStatus.OutcomeUnknown },
    });
    const head = await runCloseoutCliGit(setup.worktreeRoot, ["rev-parse", "HEAD"]);
    expect(await countCommits(setup)).toBe("1");

    const assessment = parseCloseoutRecoverySuccess(
      await runCloseoutRecoveryAssessCli(setup),
      CliCommand.CodingTaskSessionCloseoutRecoveryAssess,
    );
    expect(assessment).toMatchObject({
      disposition: CodingTaskSessionCloseoutRecoveryDisposition.ResolutionAvailable,
      allowedResolution: CodingTaskSessionCloseoutRecoveryResolution.BindExisting,
    });
    const humanCommand = await writeCloseoutRecoveryHumanCommand(setup, assessment, {
      actorId: CLOSEOUT_RECOVERY_CLI_HUMAN_ACTOR_ID,
      resolution: CodingTaskSessionCloseoutRecoveryResolution.BindExisting,
    });
    const recovered = parseCloseoutRecoverySuccess(
      await runCloseoutRecoveryRecoverCli(
        setup,
        humanCommand.filePath,
        CLOSEOUT_RECOVERY_CLI_HUMAN_ACTOR_ID,
      ),
      CliCommand.CodingTaskSessionCloseoutRecover,
    );
    expect(recovered).toMatchObject({ status: CommandStatus.Committed });

    const command = await createCodingTaskSessionDeliveryCommand(setup);
    expect(command).toMatchObject({
      payload: { expectedEffectiveSource: CodingTaskSessionEffectiveCloseoutSource.Recovery },
    });
    const submitted = await setup.application.submitCodingTaskSessionDelivery.execute(command);

    expect(submitted).toMatchObject({
      status: ResultStatus.Success,
      value: { status: CommandStatus.Committed },
    });
    await expectSubmittedState(setup, head);
  }, 45_000);

  it("存在未闭合 Worktree Provision Action 时拒绝接入 Event", async () => {
    const setup = await createCodingTaskSessionCloseoutCliSetup(temporaryRoots);
    const closed = await setup.application.closeoutCodingTaskSession.execute(setup.closeoutCommand);
    expect(closed).toMatchObject({
      status: ResultStatus.Success,
      value: { status: CodingTaskSessionCloseoutStatus.CheckpointBound },
    });
    const aggregate = await loadCodingTaskSessionDeliveryAggregate(setup);
    const actionId = "01ARZ3NDEKTSV4RRFFQ69G5HAZ";
    const provisionTarget = {
      repositoryId: aggregate.repositoryId,
      worktreeId: aggregate.worktreeBinding.worktreeId,
      relativePath: aggregate.worktreeBinding.relativePath,
      branchName: aggregate.worktreeBinding.branchName,
    };
    const intentPayload = {
      workspaceId: aggregate.workspaceId,
      actionId,
      repositoryRootDigest: digestCloseoutCliValue({
        repositoryRoot: setup.repositoryRoot,
      }),
    };
    const intent = await setup.application.recordActionIntent.execute({
      record: {
        schemaVersion: ACTION_JOURNAL_SCHEMA_VERSION,
        recordType: ActionJournalRecordType.Intent,
        actionId,
        sequence: 1,
        workspaceId: aggregate.workspaceId,
        taskId: aggregate.sourceTaskId,
        commandId: "delivery-unresolved-provision",
        correlationId: "delivery-unresolved-provision",
        idempotencyKey: "delivery-unresolved-provision",
        kind: ActionKind.GitMutation,
        target: JSON.stringify(provisionTarget),
        inputDigest: digestCloseoutCliValue(intentPayload),
        postconditionDigest: digestCloseoutCliValue({
          repositoryId: aggregate.repositoryId,
          worktreeBinding: aggregate.worktreeBinding,
          baseRevision: aggregate.baseRevision,
        }),
        baseRevision: aggregate.baseRevision,
        recoveryGuidance: "由 Human 闭合 Worktree Provision 后重试。",
        actor: { kind: ActorKind.Agent, actorId: setup.agentActorId },
        recordedAt: setup.closeoutCommand["submittedAt"] as string,
      },
    });
    expect(intent.status).toBe(ResultStatus.Success);

    const command = await createCodingTaskSessionDeliveryCommand(setup);
    const submitted = await setup.application.submitCodingTaskSessionDelivery.execute(command);

    expect(submitted).toMatchObject({
      status: ResultStatus.Success,
      value: { status: CommandStatus.Rejected },
    });
    expect(await countCodingTaskSessionDeliveryEvents(setup)).toBe(0);
    expect(await countCommits(setup)).toBe("1");
  }, 45_000);
});

async function expectSubmittedState(
  setup: Awaited<ReturnType<typeof createCodingTaskSessionCloseoutCliSetup>>,
  targetRevision: string,
): Promise<void> {
  const aggregate = await loadCodingTaskSessionDeliveryAggregate(setup);
  expect(aggregate).toMatchObject({
    phase: CodingTaskPhase.Verification,
    attempts: [
      {
        number: 1,
        targetRevision,
        changedPaths: ["src/index.ts"],
      },
    ],
  });
  expect(await countCodingTaskSessionDeliveryEvents(setup)).toBe(1);
  expect(await countCommits(setup)).toBe("1");
  expect(await runCloseoutCliGit(setup.worktreeRoot, ["status", "--porcelain=v1"])).toBe("");
}

async function countCommits(
  setup: Awaited<ReturnType<typeof createCodingTaskSessionCloseoutCliSetup>>,
): Promise<string> {
  return runCloseoutCliGit(setup.worktreeRoot, [
    "rev-list",
    "--count",
    `${setup.baseRevision}..HEAD`,
  ]);
}
