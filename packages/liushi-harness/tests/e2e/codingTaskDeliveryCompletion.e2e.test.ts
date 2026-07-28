import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  CodingTaskDeliveryCompletionStatus,
  CodingTaskSessionCloseoutStatus,
} from "../../src/application/index.js";
import { VerificationExecutionMode } from "../../src/bootstrap/compositionRoot/enums/index.js";
import { ResultStatus } from "../../src/common/index.js";
import {
  CodingTaskPhase,
  CodingTaskRunState,
  CodingTaskVerificationOutcome,
} from "../../src/domain/codingTask/index.js";
import { VerificationStatus } from "../../src/domain/verification/index.js";
import {
  createCodingTaskSessionCloseoutCliApplication,
  runCloseoutCliGit,
} from "../support/codingTaskSessionCloseoutCli/index.js";
import {
  DELIVERY_COMPLETION_VERIFICATION_RUN_ID,
  createCodingTaskDeliveryCompletionE2eSetup,
  createCodingTaskDeliveryCompletionInput,
  createCodingTaskDeliveryFailureE2eSetup,
} from "../support/codingTaskDeliveryCompletion/index.js";
import {
  countCodingTaskSessionDeliveryEvents,
  loadCodingTaskSessionDeliveryAggregate,
} from "../support/codingTaskSessionDelivery/index.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("CodingTask Delivery Completion 真实 Git E2E", () => {
  it("完成真实 Verification、PR-ready 与跨进程重放", async () => {
    const { setup, profileCompilation } =
      await createCodingTaskDeliveryCompletionE2eSetup(temporaryRoots);
    await closeSession(setup);
    const application = createCompletionApplication(setup);
    const input = await createCodingTaskDeliveryCompletionInput(
      setup,
      application,
      profileCompilation,
    );

    const first = await application.completeCodingTaskSessionDelivery.execute(input);

    expect(first).toMatchObject({
      status: ResultStatus.Success,
      value: {
        status: CodingTaskDeliveryCompletionStatus.ReviewReady,
        evidenceBundle: { status: VerificationStatus.Passed },
        prReadyArtifact: { verification: { status: VerificationStatus.Passed } },
      },
    });
    const aggregate = await loadCodingTaskSessionDeliveryAggregate(setup);
    expect(aggregate).toMatchObject({
      phase: CodingTaskPhase.Verification,
      runState: CodingTaskRunState.Completed,
      attempts: [{ verificationOutcome: CodingTaskVerificationOutcome.Passed }],
    });
    expect(await countCommits(setup)).toBe("1");
    expect(await countCodingTaskSessionDeliveryEvents(setup)).toBe(1);

    const bytesBeforeReplay = await readCompletionBytes(setup);
    const replay =
      await createCompletionApplication(setup).completeCodingTaskSessionDelivery.execute(input);

    expect(replay).toEqual(first);
    await expect(readCompletionBytes(setup)).resolves.toEqual(bytesBeforeReplay);
    expect(await countCommits(setup)).toBe("1");
  }, 45_000);

  it("失败 Evidence 在状态回退后仍可跨进程精确重放", async () => {
    const { setup, profileCompilation } =
      await createCodingTaskDeliveryFailureE2eSetup(temporaryRoots);
    await closeSession(setup);
    const application = createCompletionApplication(setup);
    const input = await createCodingTaskDeliveryCompletionInput(
      setup,
      application,
      profileCompilation,
    );

    const first = await application.completeCodingTaskSessionDelivery.execute(input);

    expect(first).toMatchObject({
      status: ResultStatus.Success,
      value: {
        status: CodingTaskDeliveryCompletionStatus.VerificationFailed,
        evidenceBundle: { status: VerificationStatus.Failed },
      },
    });
    expect(first).not.toHaveProperty("value.prReadyArtifact");
    const aggregate = await loadCodingTaskSessionDeliveryAggregate(setup);
    expect(aggregate).toMatchObject({
      phase: CodingTaskPhase.Implementation,
      runState: CodingTaskRunState.Active,
      attempts: [{ verificationOutcome: CodingTaskVerificationOutcome.Failed }],
    });
    const bytesBeforeReplay = await readCompletionBytes(setup);

    const replay =
      await createCompletionApplication(setup).completeCodingTaskSessionDelivery.execute(input);

    expect(replay).toEqual(first);
    await expect(readCompletionBytes(setup)).resolves.toEqual(bytesBeforeReplay);
    expect(await countCodingTaskSessionDeliveryEvents(setup)).toBe(1);
    expect(await countCommits(setup)).toBe("1");
  }, 45_000);
});

/** Delivery Completion E2E 使用的真实 Git 准备结果。 */
type CompletionSetup = Awaited<
  ReturnType<typeof createCodingTaskDeliveryCompletionE2eSetup>
>["setup"];

async function closeSession(setup: CompletionSetup): Promise<void> {
  const closed = await setup.application.closeoutCodingTaskSession.execute(setup.closeoutCommand);
  expect(closed).toMatchObject({
    status: ResultStatus.Success,
    value: { status: CodingTaskSessionCloseoutStatus.CheckpointBound },
  });
}

function createCompletionApplication(setup: CompletionSetup) {
  return createCodingTaskSessionCloseoutCliApplication(setup.storeRoot, setup.repositoryRoot, {
    verificationExecutionMode: VerificationExecutionMode.LocalCommand,
  });
}

async function readCompletionBytes(setup: CompletionSetup): Promise<readonly string[]> {
  const codingTaskEventFile = setup.evidenceFiles.at(-1);
  if (codingTaskEventFile === undefined) throw new Error("缺少 CodingTask Event 文件。");
  const evidenceFile = join(
    setup.storeRoot,
    "workspaces",
    setup.workspaceId,
    "codingTasks",
    setup.codingTaskId,
    "evidence",
    `${DELIVERY_COMPLETION_VERIFICATION_RUN_ID}.json`,
  );
  return Promise.all([readFile(codingTaskEventFile, "utf8"), readFile(evidenceFile, "utf8")]);
}

async function countCommits(setup: CompletionSetup): Promise<string> {
  return runCloseoutCliGit(setup.worktreeRoot, [
    "rev-list",
    "--count",
    `${setup.baseRevision}..HEAD`,
  ]);
}
