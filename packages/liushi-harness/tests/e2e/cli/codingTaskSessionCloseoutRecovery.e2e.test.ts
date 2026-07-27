import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import {
  ChangeSetCheckpointRecoveryStatus,
  CodingTaskSessionCloseoutRecoveryDiagnostic,
  CodingTaskSessionCloseoutRecoveryDisposition,
  CodingTaskSessionCloseoutRecoveryResolution,
  CodingTaskSessionCloseoutStatus,
  CodingTaskSessionCloseoutStage,
  CodingTaskSessionEffectiveCloseoutSource,
  CodingTaskSessionEffectiveCloseoutStatus,
  CommandStatus,
} from "../../../src/application/index.js";
import { ActorKind, HarnessErrorCode, ResultStatus } from "../../../src/common/index.js";
import { CliCommand } from "../../../src/presentation/index.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createCodingTaskSessionCloseoutCliSetup,
  runCloseoutCliGit,
} from "../../support/codingTaskSessionCloseoutCli/index.js";
import {
  CLOSEOUT_RECOVERY_CLI_HUMAN_ACTOR_ID,
  createNotAppliedCheckpointFault,
  createOutcomeUnknownAfterRealCommitFault,
  parseCloseoutRecoverySuccess,
  readPersistedCloseoutState,
  runCloseoutRecoveryAssessCli,
  runCloseoutRecoveryEffectiveCli,
  runCloseoutRecoveryRecoverCli,
  writeCloseoutRecoveryHumanCommand,
} from "../../support/codingTaskSessionCloseoutRecoveryCli/index.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("CodingTask Session Closeout Recovery 真实 Git E2E", () => {
  it("NotApplied 关闭后只允许 RetryOnce，并通过 Human Recovery 产生一个 checkpoint", async () => {
    const setup = await createCodingTaskSessionCloseoutCliSetup(temporaryRoots);
    const checkpointSpy = vi
      .spyOn(setup.application.changeSetCheckpoints, "execute")
      .mockImplementationOnce(createNotAppliedCheckpointFault());

    const initial = await setup.application.closeoutCodingTaskSession.execute(
      setup.closeoutCommand,
    );
    expect(checkpointSpy).toHaveBeenCalledTimes(1);
    expect(initial.status).toBe(ResultStatus.Success);
    if (initial.status === ResultStatus.Failure) throw initial.error;
    expect(initial.value).toMatchObject({
      status: CodingTaskSessionCloseoutStatus.Blocked,
      stoppedStage: CodingTaskSessionCloseoutStage.SnapshotPersisted,
      errorCode: HarnessErrorCode.CodingTaskSessionCloseoutCheckpointNotApplied,
      checkpoint: null,
    });
    expect(await readPersistedCloseoutState(setup)).toMatchObject(initial.value);
    const originalCloseoutBytes = await readFile(setup.closeoutStateFile);
    expect(await countCommits(setup)).toBe("0");

    const assessment = parseCloseoutRecoverySuccess(
      await runCloseoutRecoveryAssessCli(setup),
      CliCommand.CodingTaskSessionCloseoutRecoveryAssess,
    );
    expect(assessment).toMatchObject({
      disposition: CodingTaskSessionCloseoutRecoveryDisposition.ResolutionAvailable,
      allowedResolution: CodingTaskSessionCloseoutRecoveryResolution.RetryOnce,
      diagnostic: CodingTaskSessionCloseoutRecoveryDiagnostic.RetryAvailable,
      checkpointStatus: ChangeSetCheckpointRecoveryStatus.Absent,
    });
    const humanCommand = await writeCloseoutRecoveryHumanCommand(setup, assessment, {
      actorId: CLOSEOUT_RECOVERY_CLI_HUMAN_ACTOR_ID,
      resolution: CodingTaskSessionCloseoutRecoveryResolution.RetryOnce,
    });
    expect(humanCommand.command).toMatchObject({
      expectedVersion: assessment["closeoutVersion"],
      actor: { kind: ActorKind.Human, actorId: CLOSEOUT_RECOVERY_CLI_HUMAN_ACTOR_ID },
      payload: {
        expectedAssessmentDigest: assessment["assessmentDigest"],
        requestedResolution: CodingTaskSessionCloseoutRecoveryResolution.RetryOnce,
      },
    });

    const firstRecovery = parseCloseoutRecoverySuccess(
      await runCloseoutRecoveryRecoverCli(
        setup,
        humanCommand.filePath,
        CLOSEOUT_RECOVERY_CLI_HUMAN_ACTOR_ID,
      ),
      CliCommand.CodingTaskSessionCloseoutRecover,
    );
    expect(firstRecovery).toMatchObject({ status: CommandStatus.Committed });
    expect(await countCommits(setup)).toBe("1");
    const recoveredHead = await runCloseoutCliGit(setup.worktreeRoot, ["rev-parse", "HEAD"]);
    expect(await runCloseoutCliGit(setup.worktreeRoot, ["status", "--porcelain=v1"])).toBe("");
    expect(await readFile(join(setup.worktreeRoot, "src", "index.ts"), "utf8")).toBe(
      "export const value = 2;\n",
    );

    const replay = parseCloseoutRecoverySuccess(
      await runCloseoutRecoveryRecoverCli(
        setup,
        humanCommand.filePath,
        CLOSEOUT_RECOVERY_CLI_HUMAN_ACTOR_ID,
      ),
      CliCommand.CodingTaskSessionCloseoutRecover,
    );
    expect(replay).toEqual(firstRecovery);
    expect(await countCommits(setup)).toBe("1");

    const effective = parseCloseoutRecoverySuccess(
      await runCloseoutRecoveryEffectiveCli(setup),
      CliCommand.CodingTaskSessionEffectiveCloseout,
    );
    expect(effective).toMatchObject({
      status: CodingTaskSessionEffectiveCloseoutStatus.Resolved,
      source: CodingTaskSessionEffectiveCloseoutSource.Recovery,
      checkpoint: { checkpoint: { targetRevision: recoveredHead } },
    });
    expect(await readFile(setup.closeoutStateFile)).toEqual(originalCloseoutBytes);
  }, 45_000);

  it("真实 commit 后返回 OutcomeUnknown，只允许 BindExisting 且不重复提交", async () => {
    const setup = await createCodingTaskSessionCloseoutCliSetup(temporaryRoots);
    const realExecute = setup.application.changeSetCheckpoints.execute.bind(
      setup.application.changeSetCheckpoints,
    );
    const checkpointSpy = vi
      .spyOn(setup.application.changeSetCheckpoints, "execute")
      .mockImplementationOnce(createOutcomeUnknownAfterRealCommitFault(realExecute));

    const initial = await setup.application.closeoutCodingTaskSession.execute(
      setup.closeoutCommand,
    );
    expect(checkpointSpy).toHaveBeenCalledTimes(1);
    expect(initial.status).toBe(ResultStatus.Success);
    if (initial.status === ResultStatus.Failure) throw initial.error;
    expect(initial.value).toMatchObject({
      status: CodingTaskSessionCloseoutStatus.OutcomeUnknown,
      stoppedStage: CodingTaskSessionCloseoutStage.SnapshotPersisted,
      errorCode: HarnessErrorCode.CodingTaskSessionCloseoutCheckpointOutcomeUnknown,
      checkpoint: null,
    });
    expect(await readPersistedCloseoutState(setup)).toMatchObject(initial.value);
    const originalCloseoutBytes = await readFile(setup.closeoutStateFile);
    expect(await countCommits(setup)).toBe("1");
    expect(await runCloseoutCliGit(setup.worktreeRoot, ["status", "--porcelain=v1"])).toBe("");

    const assessment = parseCloseoutRecoverySuccess(
      await runCloseoutRecoveryAssessCli(setup),
      CliCommand.CodingTaskSessionCloseoutRecoveryAssess,
    );
    expect(assessment).toMatchObject({
      disposition: CodingTaskSessionCloseoutRecoveryDisposition.ResolutionAvailable,
      allowedResolution: CodingTaskSessionCloseoutRecoveryResolution.BindExisting,
      diagnostic: CodingTaskSessionCloseoutRecoveryDiagnostic.BindExistingAvailable,
      checkpointStatus: ChangeSetCheckpointRecoveryStatus.Present,
    });
    const humanCommand = await writeCloseoutRecoveryHumanCommand(setup, assessment, {
      actorId: CLOSEOUT_RECOVERY_CLI_HUMAN_ACTOR_ID,
      resolution: CodingTaskSessionCloseoutRecoveryResolution.BindExisting,
    });
    expect(humanCommand.command).toMatchObject({
      expectedVersion: assessment["closeoutVersion"],
      actor: { kind: ActorKind.Human, actorId: CLOSEOUT_RECOVERY_CLI_HUMAN_ACTOR_ID },
      payload: {
        expectedAssessmentDigest: assessment["assessmentDigest"],
        requestedResolution: CodingTaskSessionCloseoutRecoveryResolution.BindExisting,
      },
    });
    const initialHead = await runCloseoutCliGit(setup.worktreeRoot, ["rev-parse", "HEAD"]);

    const firstRecovery = parseCloseoutRecoverySuccess(
      await runCloseoutRecoveryRecoverCli(
        setup,
        humanCommand.filePath,
        CLOSEOUT_RECOVERY_CLI_HUMAN_ACTOR_ID,
      ),
      CliCommand.CodingTaskSessionCloseoutRecover,
    );
    expect(firstRecovery).toMatchObject({ status: CommandStatus.Committed });
    expect(await countCommits(setup)).toBe("1");
    expect(await runCloseoutCliGit(setup.worktreeRoot, ["rev-parse", "HEAD"])).toBe(initialHead);

    const replay = parseCloseoutRecoverySuccess(
      await runCloseoutRecoveryRecoverCli(
        setup,
        humanCommand.filePath,
        CLOSEOUT_RECOVERY_CLI_HUMAN_ACTOR_ID,
      ),
      CliCommand.CodingTaskSessionCloseoutRecover,
    );
    expect(replay).toEqual(firstRecovery);
    expect(await countCommits(setup)).toBe("1");

    const effective = parseCloseoutRecoverySuccess(
      await runCloseoutRecoveryEffectiveCli(setup),
      CliCommand.CodingTaskSessionEffectiveCloseout,
    );
    expect(effective).toMatchObject({
      status: CodingTaskSessionEffectiveCloseoutStatus.Resolved,
      source: CodingTaskSessionEffectiveCloseoutSource.Recovery,
      checkpoint: { checkpoint: { targetRevision: initialHead } },
    });
    expect(await readFile(setup.closeoutStateFile)).toEqual(originalCloseoutBytes);
  }, 45_000);
});

async function countCommits(
  setup: Awaited<ReturnType<typeof createCodingTaskSessionCloseoutCliSetup>>,
): Promise<string> {
  return runCloseoutCliGit(setup.worktreeRoot, [
    "rev-list",
    "--count",
    `${setup.baseRevision}..HEAD`,
  ]);
}
