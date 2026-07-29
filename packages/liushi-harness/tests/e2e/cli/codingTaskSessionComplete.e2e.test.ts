import { access, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  CodingTaskDeliveryCompletionStatus,
  CodingTaskSessionCloseoutStatus,
} from "../../../src/application/index.js";
import { VerificationExecutionMode } from "../../../src/bootstrap/compositionRoot/enums/index.js";
import { HarnessErrorCode, ResultStatus } from "../../../src/common/index.js";
import {
  CodingTaskPhase,
  CodingTaskRunState,
  CodingTaskVerificationOutcome,
} from "../../../src/domain/codingTask/index.js";
import { VerificationStatus } from "../../../src/domain/verification/index.js";
import { resolveCommandReservationPaths } from "../../../src/infrastructure/index.js";
import { createProductionCliApplicationFactory } from "../../../src/bootstrap/cli/index.js";
import {
  CLI_EXIT_CODE_CONFLICT,
  CLI_EXIT_CODE_SUCCESS,
  CliCommand,
  CliResponseStatus,
  NodeJsonDocumentReaderAdapter,
  runCli,
} from "../../../src/presentation/index.js";
import {
  countCodingTaskSessionDeliveryEvents,
  loadCodingTaskSessionDeliveryAggregate,
} from "../../support/codingTaskSessionDelivery/index.js";
import {
  createCodingTaskDeliveryCompletionE2eSetup,
  createCodingTaskDeliveryCompletionInput,
  createCodingTaskDeliveryFailureE2eSetup,
} from "../../support/codingTaskDeliveryCompletion/index.js";
import {
  createCodingTaskSessionCloseoutCliApplication,
  runCloseoutCliGit,
} from "../../support/codingTaskSessionCloseoutCli/index.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("CodingTask Session Complete CLI 真实 Git E2E", () => {
  it("local_command 下返回 review_ready 和 PRReadyArtifact，并跨 Application 稳定重放", async () => {
    const { setup, profileCompilation } =
      await createCodingTaskDeliveryCompletionE2eSetup(temporaryRoots);
    await closeSession(setup);
    const application = createCompletionApplication(setup);
    const input = await createCodingTaskDeliveryCompletionInput(
      setup,
      application,
      profileCompilation,
    );
    const inputFile = join(setup.storeRoot, "coding-task-session-complete.json");
    await writeFile(inputFile, JSON.stringify(input), "utf8");

    const first = await runCompleteCli(setup, inputFile);
    expect(first.exitCode).toBe(CLI_EXIT_CODE_SUCCESS);
    expect(first.stderr).toHaveLength(0);
    const firstOutput = parseOutput(first.stdout);
    expect(firstOutput).toMatchObject({
      status: CliResponseStatus.Success,
      command: CliCommand.CodingTaskSessionComplete,
      data: {
        status: CodingTaskDeliveryCompletionStatus.ReviewReady,
        evidenceBundle: { status: VerificationStatus.Passed },
        prReadyArtifact: { verification: { status: VerificationStatus.Passed } },
      },
    });
    const firstData = firstOutput.data as {
      readonly prReadyArtifact?: { readonly headRevision?: unknown };
    };
    expect(firstData.prReadyArtifact?.headRevision).toBe(
      await runCloseoutCliGit(setup.worktreeRoot, ["rev-parse", "HEAD"]),
    );
    const firstAggregate = await loadCodingTaskSessionDeliveryAggregate(setup);
    expect(firstAggregate).toMatchObject({
      phase: CodingTaskPhase.Verification,
      runState: CodingTaskRunState.Completed,
      attempts: [{ verificationOutcome: CodingTaskVerificationOutcome.Passed }],
    });
    const firstCommitCount = await countCommits(setup);
    const firstEventCount = await countCodingTaskSessionDeliveryEvents(setup);
    expect(firstCommitCount).toBe("1");
    expect(firstEventCount).toBe(1);

    const replay = await runCompleteCli(setup, inputFile);

    expect(replay.exitCode).toBe(CLI_EXIT_CODE_SUCCESS);
    expect(replay.stderr).toHaveLength(0);
    expect(parseOutput(replay.stdout)).toEqual(firstOutput);
    expect(await loadCodingTaskSessionDeliveryAggregate(setup)).toEqual(firstAggregate);
    await expect(countCommits(setup)).resolves.toBe(firstCommitCount);
    await expect(countCodingTaskSessionDeliveryEvents(setup)).resolves.toBe(firstEventCount);
  }, 45_000);

  it("CLI binding mismatch 在 execute 前 fail closed 且不改变 Aggregate、Event 和 Commit", async () => {
    const { setup, profileCompilation } =
      await createCodingTaskDeliveryCompletionE2eSetup(temporaryRoots);
    await closeSession(setup);
    const application = createCompletionApplication(setup);
    const input = await createCodingTaskDeliveryCompletionInput(
      setup,
      application,
      profileCompilation,
    );
    const mismatch = JSON.parse(JSON.stringify(input)) as {
      deliveryCommand: { payload: { workspaceId: string } };
    };
    mismatch.deliveryCommand.payload.workspaceId = "mismatched-workspace";
    const inputFile = join(setup.storeRoot, "coding-task-session-complete-mismatch.json");
    await writeFile(inputFile, JSON.stringify(mismatch), "utf8");
    const aggregateBefore = await loadCodingTaskSessionDeliveryAggregate(setup);
    const eventsBefore = await countCodingTaskSessionDeliveryEvents(setup);
    const commitsBefore = await countCommits(setup);

    const result = await runCompleteCli(setup, inputFile);

    expect(result.exitCode).toBe(CLI_EXIT_CODE_CONFLICT);
    expect(result.stdout).toHaveLength(0);
    expect(result.stderr).toHaveLength(1);
    expect(JSON.parse(result.stderr[0]!)).toMatchObject({
      status: CliResponseStatus.Failure,
      command: CliCommand.CodingTaskSessionComplete,
      error: { code: HarnessErrorCode.PreconditionNotMet },
    });
    expect(await loadCodingTaskSessionDeliveryAggregate(setup)).toEqual(aggregateBefore);
    await expect(countCodingTaskSessionDeliveryEvents(setup)).resolves.toBe(eventsBefore);
    await expect(countCommits(setup)).resolves.toBe(commitsBefore);
  }, 45_000);

  it.each([
    {
      name: "Repository",
      binding: (setup: CompletionSetup) => ({
        repositoryId: "mismatched-repository",
        repositoryRoot: setup.repositoryRoot,
      }),
    },
    {
      name: "Root",
      binding: (setup: CompletionSetup) => ({
        repositoryId: setup.repositoryId,
        repositoryRoot: join(setup.repositoryRoot, "mismatched-root"),
      }),
    },
  ])(
    "错误 $name 在 Delivery Gateway 前 fail closed 且不新增 Command Reservation",
    async ({ binding }) => {
      const { setup, profileCompilation } =
        await createCodingTaskDeliveryCompletionE2eSetup(temporaryRoots);
      await closeSession(setup);
      const application = createCompletionApplication(setup);
      const input = await createCodingTaskDeliveryCompletionInput(
        setup,
        application,
        profileCompilation,
      );
      const inputFile = join(setup.storeRoot, "coding-task-session-complete-runtime-mismatch.json");
      await writeFile(inputFile, JSON.stringify(input), "utf8");
      const aggregateBefore = await loadCodingTaskSessionDeliveryAggregate(setup);
      const eventsBefore = await countCodingTaskSessionDeliveryEvents(setup);
      const commitsBefore = await countCommits(setup);
      const reservationsBefore = await countCommandReservations(setup.storeRoot);
      const deliveryReservationFile = resolveCommandReservationPaths(
        setup.storeRoot,
        input.deliveryCommand,
      ).recordFile;
      await expect(pathExists(deliveryReservationFile)).resolves.toBe(false);

      const result = await runCompleteCli(setup, inputFile, binding(setup));

      expect(result.exitCode).toBe(CLI_EXIT_CODE_CONFLICT);
      expect(result.stdout).toHaveLength(0);
      expect(result.stderr).toHaveLength(1);
      expect(JSON.parse(result.stderr[0]!)).toMatchObject({
        status: CliResponseStatus.Failure,
        command: CliCommand.CodingTaskSessionComplete,
        error: { code: HarnessErrorCode.OperationForbidden },
      });
      expect(await loadCodingTaskSessionDeliveryAggregate(setup)).toEqual(aggregateBefore);
      await expect(countCodingTaskSessionDeliveryEvents(setup)).resolves.toBe(eventsBefore);
      await expect(countCommits(setup)).resolves.toBe(commitsBefore);
      await expect(countCommandReservations(setup.storeRoot)).resolves.toBe(reservationsBefore);
      await expect(pathExists(deliveryReservationFile)).resolves.toBe(false);
    },
    45_000,
  );

  it("local_command 的确定性 verification_failed 返回 4 且不生成 PRReadyArtifact", async () => {
    const { setup, profileCompilation } =
      await createCodingTaskDeliveryFailureE2eSetup(temporaryRoots);
    await closeSession(setup);
    const application = createCompletionApplication(setup);
    const input = await createCodingTaskDeliveryCompletionInput(
      setup,
      application,
      profileCompilation,
    );
    const inputFile = join(setup.storeRoot, "coding-task-session-complete-failure.json");
    await writeFile(inputFile, JSON.stringify(input), "utf8");

    const result = await runCompleteCli(setup, inputFile);

    expect(result.exitCode).toBe(4);
    expect(result.stdout).toHaveLength(1);
    expect(result.stderr).toHaveLength(0);
    const output = JSON.parse(result.stdout[0]!) as {
      readonly status: CliResponseStatus;
      readonly command: CliCommand;
      readonly data: {
        readonly status: CodingTaskDeliveryCompletionStatus;
        readonly evidenceBundle?: { readonly status?: VerificationStatus };
        readonly prReadyArtifact?: unknown;
      };
    };
    expect(output).toMatchObject({
      status: CliResponseStatus.Blocked,
      command: CliCommand.CodingTaskSessionComplete,
      data: {
        status: CodingTaskDeliveryCompletionStatus.VerificationFailed,
        evidenceBundle: { status: VerificationStatus.Failed },
      },
    });
    expect(output.data.prReadyArtifact).toBeUndefined();
  }, 45_000);
});

/** Completion E2E 使用的真实 Store、Git 和 Session 绑定。 */
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

async function runCompleteCli(
  setup: CompletionSetup,
  inputFile: string,
  binding: {
    readonly repositoryId: string;
    readonly repositoryRoot: string;
  } = {
    repositoryId: setup.repositoryId,
    repositoryRoot: setup.repositoryRoot,
  },
): Promise<{ readonly exitCode: number; readonly stdout: string[]; readonly stderr: string[] }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCode = await runCli(
    [
      "coding-task",
      "session",
      "complete",
      "--file",
      inputFile,
      "--workspace",
      setup.workspaceId,
      "--session",
      setup.sessionId,
      "--repository",
      binding.repositoryId,
      "--root",
      binding.repositoryRoot,
      "--actor-id",
      setup.agentActorId,
      "--verification-mode",
      "local_command",
      "--store",
      setup.storeRoot,
      "--json",
    ],
    {
      defaultStoreRoot: setup.storeRoot,
      applicationFactory: createProductionCliApplicationFactory(),
      writer: {
        stdout: (value) => stdout.push(value),
        stderr: (value) => stderr.push(value),
      },
      jsonDocumentReader: new NodeJsonDocumentReaderAdapter(),
    },
  );
  return { exitCode, stdout, stderr };
}

function parseOutput(stdout: readonly string[]): {
  readonly status: CliResponseStatus;
  readonly command: CliCommand;
  readonly data: Record<string, unknown>;
} {
  expect(stdout).toHaveLength(1);
  return JSON.parse(stdout[0]!) as {
    readonly status: CliResponseStatus;
    readonly command: CliCommand;
    readonly data: Record<string, unknown>;
  };
}

/** 统计真实 Git 基线之后的提交数量。 */
async function countCommits(setup: CompletionSetup): Promise<string> {
  return runCloseoutCliGit(setup.worktreeRoot, [
    "rev-list",
    "--count",
    `${setup.baseRevision}..HEAD`,
  ]);
}

/** 递归统计 Runtime Store 中已落盘的 Command Reservation。 */
async function countCommandReservations(directory: string): Promise<number> {
  let count = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) count += await countCommandReservations(path);
    else if (entry.isFile() && entry.name === "reservation.json") count += 1;
  }
  return count;
}

/** 判断指定持久化路径是否存在。 */
async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
