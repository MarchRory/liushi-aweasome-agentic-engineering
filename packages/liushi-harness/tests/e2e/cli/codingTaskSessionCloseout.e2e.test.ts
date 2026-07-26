import { access, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { CodingTaskSessionCloseoutStatus } from "../../../src/application/index.js";
import { HarnessErrorCode } from "../../../src/common/index.js";
import {
  CLI_EXIT_CODE_CONFLICT,
  CliCommand,
  CliResponseStatus,
} from "../../../src/presentation/index.js";

import {
  assertSuccessfulRun,
  closeoutStatus,
  createCodingTaskSessionCloseoutCliSetup,
  parseCloseoutCliOutput,
  readCloseoutCliEvidence,
  runCloseoutCli,
  runCloseoutCliGit,
} from "../../support/codingTaskSessionCloseoutCli/index.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("CodingTask Session Closeout CLI 真实 Git E2E", () => {
  it("错误 Actor 或 Repository Root 在生产 Composition Root 中 fail closed 且不创建 checkpoint", async () => {
    const setup = await createCodingTaskSessionCloseoutCliSetup(temporaryRoots);

    for (const overrides of [
      { agentActorId: "agent:other" },
      { repositoryRoot: join(setup.repositoryRoot, "missing-root") },
    ]) {
      const result = await runCloseoutCli(setup, overrides);
      expect(result.exitCode).toBe(CLI_EXIT_CODE_CONFLICT);
      expect(result.stdout).toHaveLength(0);
      expect(result.stderr).toHaveLength(1);
      expect(JSON.parse(result.stderr[0]!)).toMatchObject({
        status: CliResponseStatus.Failure,
        command: CliCommand.CodingTaskSessionCloseout,
        error: { code: HarnessErrorCode.PreconditionNotMet },
      });
    }
    expect(await runCloseoutCliGit(setup.worktreeRoot, ["rev-parse", "HEAD"])).toBe(
      setup.baseRevision,
    );
    expect(
      await runCloseoutCliGit(setup.worktreeRoot, [
        "rev-list",
        "--count",
        `${setup.baseRevision}..HEAD`,
      ]),
    ).toBe("0");
    await expect(access(setup.closeoutStateFile)).rejects.toThrow();
  }, 30_000);

  it("首次闭合生成唯一 checkpoint，新的 CLI Application 重放不产生第二个副作用", async () => {
    const setup = await createCodingTaskSessionCloseoutCliSetup(temporaryRoots);
    const command = setup.closeoutCommand;
    expect(command).toMatchObject({
      schemaVersion: "1.0.0",
      commandType: "coding_task_session.closeout",
      aggregateType: "coding_task_session",
      aggregateId: setup.sessionId,
      expectedVersion: 0,
      idempotencyKey: command["commandId"],
      actor: { kind: "agent", actorId: setup.agentActorId },
      submittedAt: "2026-07-27T00:00:00.000Z",
      payload: { workspaceId: setup.workspaceId, sessionId: setup.sessionId },
    });
    expect(typeof command["requestDigest"]).toBe("string");

    const first = await runCloseoutCli(setup);
    assertSuccessfulRun(first);
    const firstOutput = parseCloseoutCliOutput(first);
    expect(firstOutput).toMatchObject({
      status: CliResponseStatus.Success,
      command: CliCommand.CodingTaskSessionCloseout,
      data: { status: CodingTaskSessionCloseoutStatus.CheckpointBound },
    });
    expect(closeoutStatus(firstOutput)).toBe(CodingTaskSessionCloseoutStatus.CheckpointBound);
    const evidenceAfterFirst = await readCloseoutCliEvidence(setup);
    const firstHead = await runCloseoutCliGit(setup.worktreeRoot, ["rev-parse", "HEAD"]);
    const firstCommitCount = await runCloseoutCliGit(setup.worktreeRoot, [
      "rev-list",
      "--count",
      `${setup.baseRevision}..HEAD`,
    ]);
    expect(firstCommitCount).toBe("1");
    expect(await runCloseoutCliGit(setup.worktreeRoot, ["status", "--porcelain=v1"])).toBe("");
    expect(await readFile(join(setup.worktreeRoot, "src", "index.ts"), "utf8")).toBe(
      "export const value = 2;\n",
    );

    const second = await runCloseoutCli(setup);
    assertSuccessfulRun(second);
    const secondOutput = parseCloseoutCliOutput(second);
    expect(secondOutput).toEqual(firstOutput);
    expect(await readCloseoutCliEvidence(setup)).toEqual(evidenceAfterFirst);
    expect(await runCloseoutCliGit(setup.worktreeRoot, ["rev-parse", "HEAD"])).toBe(firstHead);
    expect(
      await runCloseoutCliGit(setup.worktreeRoot, [
        "rev-list",
        "--count",
        `${setup.baseRevision}..HEAD`,
      ]),
    ).toBe("1");
    expect(await runCloseoutCliGit(setup.worktreeRoot, ["status", "--porcelain=v1"])).toBe("");
    expect(await readFile(join(setup.worktreeRoot, "src", "index.ts"), "utf8")).toBe(
      "export const value = 2;\n",
    );
  }, 30_000);
});
