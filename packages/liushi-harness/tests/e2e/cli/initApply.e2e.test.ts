import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { HarnessErrorCode } from "../../../src/common/index.js";
import {
  FileInstallAction,
  InstallationApplyDisposition,
  InstallationRevisionStatus,
} from "../../../src/domain/index.js";
import { CliCommand, CliResponseStatus } from "../../../src/presentation/index.js";
import { runCommand, singleOutput, type CommandOutput } from "./support/index.js";

const run = promisify(execFile);
const roots: string[] = [];
const WORKSPACE_ID = "workspace-init-apply-e2e";
const REPOSITORY_ID = "repository-init-apply-e2e";
const ACTOR_ID = "human-init-apply-e2e";
const IDEMPOTENCY_KEY = "init-apply-e2e-approval";

describe("CLI init --apply E2E", () => {
  afterEach(async () =>
    Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))),
  );

  it("dry-run 后显式 Apply，并以同一幂等键复用已提交 Revision", async () => {
    const fixture = await createFixture();
    const plan = await createPlan(fixture, FileInstallAction.Create);

    const applied = await runApply(fixture, plan.planId, plan.planDigest);
    expect(applied.exitCode).toBe(0);
    expect(applied.stderr).toHaveLength(0);
    const appliedEnvelope = parseApplySuccess(applied);
    expect(appliedEnvelope).toMatchObject({
      status: CliResponseStatus.Success,
      command: CliCommand.InitApply,
      data: {
        disposition: InstallationApplyDisposition.Applied,
        planId: plan.planId,
        planDigest: plan.planDigest,
        status: InstallationRevisionStatus.Committed,
        repositoryMutated: true,
      },
    });
    expect(appliedEnvelope.data.revisionId).toEqual(expect.any(String));

    const hooksContent = await readFile(join(fixture.repository, ".codex", "hooks.json"), "utf8");
    const manifestContent = await readFile(
      join(fixture.repository, ".liushi-harness", "managed-files.json"),
      "utf8",
    );
    expect(JSON.parse(hooksContent) as unknown).toEqual(expect.any(Object));
    expect(JSON.parse(manifestContent) as unknown).toMatchObject({
      schemaVersion: 1,
      entries: [
        {
          path: ".codex/hooks.json",
          repositoryId: REPOSITORY_ID,
          installationRevisionId: appliedEnvelope.data.revisionId,
          installPlanDigest: plan.planDigest,
        },
      ],
    });

    const appliedSnapshot = await snapshot(fixture.repository);
    const reused = await runApply(fixture, plan.planId, plan.planDigest);
    expect(reused.exitCode).toBe(0);
    expect(reused.stderr).toHaveLength(0);
    expect(parseApplySuccess(reused)).toMatchObject({
      status: CliResponseStatus.Success,
      command: CliCommand.InitApply,
      data: {
        disposition: InstallationApplyDisposition.Reused,
        revisionId: appliedEnvelope.data.revisionId,
        planId: plan.planId,
        planDigest: plan.planDigest,
        status: InstallationRevisionStatus.Committed,
        repositoryMutated: false,
      },
    });
    expect(await snapshot(fixture.repository)).toEqual(appliedSnapshot);
    expect(await readFile(join(fixture.repository, ".codex", "hooks.json"), "utf8")).toBe(
      hooksContent,
    );
    expect(
      await readFile(join(fixture.repository, ".liushi-harness", "managed-files.json"), "utf8"),
    ).toBe(manifestContent);
  });

  it("错误 plan digest 在 Repository 写入前失败", async () => {
    const fixture = await createFixture();
    const plan = await createPlan(fixture, FileInstallAction.Create);
    const before = await snapshot(fixture.repository);

    const result = await runApply(fixture, plan.planId, differentDigest(plan.planDigest));

    expect(result.exitCode).toBe(4);
    expect(result.stdout).toHaveLength(0);
    expect(result.stderr).toHaveLength(1);
    expect(JSON.parse(singleOutput(result.stderr)) as unknown).toMatchObject({
      status: CliResponseStatus.Failure,
      command: CliCommand.InitApply,
      error: { code: HarnessErrorCode.PreconditionNotMet },
    });
    expect(await snapshot(fixture.repository)).toEqual(before);
  });

  it("Human 文件生成 Conflict 计划且 Apply fail closed 不覆盖", async () => {
    const fixture = await createFixture();
    const humanContent = '{"human":true}\n';
    await mkdir(join(fixture.repository, ".codex"));
    await writeFile(join(fixture.repository, ".codex", "hooks.json"), humanContent, "utf8");
    await commitAll(fixture.repository, "human hooks");
    const plan = await createPlan(fixture, FileInstallAction.Conflict);
    const before = await snapshot(fixture.repository);

    const result = await runApply(fixture, plan.planId, plan.planDigest);

    expect(result.exitCode).toBe(4);
    expect(result.stdout).toHaveLength(0);
    expect(result.stderr).toHaveLength(1);
    expect(JSON.parse(singleOutput(result.stderr)) as unknown).toMatchObject({
      status: CliResponseStatus.Failure,
      command: CliCommand.InitApply,
      error: { code: HarnessErrorCode.OperationForbidden },
    });
    expect(await snapshot(fixture.repository)).toEqual(before);
    expect(await readFile(join(fixture.repository, ".codex", "hooks.json"), "utf8")).toBe(
      humanContent,
    );
  });
});

async function createFixture(): Promise<{ readonly repository: string; readonly store: string }> {
  const root = await mkdtemp(join(tmpdir(), "liushi-init-apply-e2e-"));
  roots.push(root);
  const repository = join(root, "repository");
  const store = join(root, "runtime");
  await run("git", ["init", "repository"], { cwd: root });
  await writeFile(join(repository, "README.md"), "fixture\n", "utf8");
  await commitAll(repository, "fixture");
  return { repository, store };
}

async function commitAll(repository: string, message: string): Promise<void> {
  await run("git", ["add", "."], { cwd: repository });
  await run(
    "git",
    ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", message],
    { cwd: repository },
  );
}

async function createPlan(
  fixture: { readonly repository: string; readonly store: string },
  expectedAction: FileInstallAction,
): Promise<{ readonly planId: string; readonly planDigest: string }> {
  const before = await snapshot(fixture.repository);
  const result = await runCommand(
    [
      "init",
      "--target",
      "codex",
      "--root",
      fixture.repository,
      "--workspace",
      WORKSPACE_ID,
      "--repository",
      REPOSITORY_ID,
      "--dry-run",
      "--store",
      fixture.store,
      "--json",
    ],
    fixture.store,
  );
  expect(result.exitCode).toBe(0);
  expect(result.stderr).toHaveLength(0);
  expect(result.stdout).toHaveLength(1);
  const envelope = JSON.parse(singleOutput(result.stdout)) as {
    readonly status: CliResponseStatus;
    readonly command: CliCommand;
    readonly data: {
      readonly repositoryMutated: boolean;
      readonly planPersisted: boolean;
      readonly plan: {
        readonly planId: string;
        readonly planDigest: string;
        readonly requiredGate: string;
        readonly files: readonly { readonly path: string; readonly action: FileInstallAction }[];
      };
    };
  };
  expect(envelope).toMatchObject({
    status: CliResponseStatus.Success,
    command: CliCommand.InitDryRun,
    data: {
      repositoryMutated: false,
      planPersisted: true,
      plan: {
        requiredGate: "G0",
        files: [{ path: ".codex/hooks.json", action: expectedAction }],
      },
    },
  });
  expect(envelope.data.plan.planId).toEqual(expect.any(String));
  expect(envelope.data.plan.planDigest).toMatch(/^sha256:[a-f0-9]{64}$/u);
  expect(await snapshot(fixture.repository)).toEqual(before);
  return envelope.data.plan;
}

async function runApply(
  fixture: { readonly repository: string; readonly store: string },
  planId: string,
  planDigest: string,
): Promise<CommandOutput> {
  return runCommand(
    [
      "init",
      "--apply",
      planId,
      "--plan-digest",
      planDigest,
      "--workspace",
      WORKSPACE_ID,
      "--repository",
      REPOSITORY_ID,
      "--actor-id",
      ACTOR_ID,
      "--idempotency-key",
      IDEMPOTENCY_KEY,
      "--store",
      fixture.store,
      "--json",
    ],
    fixture.store,
  );
}

function parseApplySuccess(output: CommandOutput): {
  readonly status: CliResponseStatus;
  readonly command: CliCommand;
  readonly data: {
    readonly disposition: InstallationApplyDisposition;
    readonly revisionId: string;
    readonly planId: string;
    readonly planDigest: string;
    readonly status: InstallationRevisionStatus;
    readonly repositoryMutated: boolean;
  };
} {
  expect(output.stdout).toHaveLength(1);
  return JSON.parse(singleOutput(output.stdout)) as ReturnType<typeof parseApplySuccess>;
}

async function snapshot(root: string): Promise<{
  readonly status: string;
  readonly hooks: string | undefined;
  readonly manifest: string | undefined;
}> {
  return {
    status: (await run("git", ["status", "--porcelain=v1"], { cwd: root })).stdout,
    hooks: await optionalRead(join(root, ".codex", "hooks.json")),
    manifest: await optionalRead(join(root, ".liushi-harness", "managed-files.json")),
  };
}

async function optionalRead(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    )
      return undefined;
    throw error;
  }
}

function differentDigest(digest: string): string {
  return `${digest.slice(0, -1)}${digest.endsWith("0") ? "1" : "0"}`;
}
