import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { createHarnessApplication } from "../../../src/bootstrap/compositionRoot/index.js";
import {
  CliCommand,
  NodeJsonDocumentReaderAdapter,
  runCli,
  type CliWriter,
} from "../../../src/presentation/index.js";
import { Rfc8785Sha256DigestAdapter } from "../../../src/infrastructure/index.js";
import { HarnessErrorCode, ResultStatus } from "../../../src/common/index.js";

const run = promisify(execFile);
const roots: string[] = [];

describe("CLI init --dry-run E2E", () => {
  afterEach(async () =>
    Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))),
  );

  it("生成 Create 计划且不改变 Git 状态或 Repository 快照", async () => {
    const fixture = await createFixture();
    const before = await snapshot(fixture.repository);
    const result = await invoke(fixture.store, fixture.repository);
    expect(result.exitCode).toBe(0);
    expect(result.data).toMatchObject({
      repositoryMutated: false,
      planPersisted: true,
      plan: { requiredGate: "G0", files: [{ path: ".codex/hooks.json", action: "create" }] },
    });
    expect(await snapshot(fixture.repository)).toEqual(before);
  });

  it("Existing Human hooks.json 生成 Conflict 且不改变 Git 状态或内容", async () => {
    const fixture = await createFixture();
    await mkdir(join(fixture.repository, ".codex"));
    await writeFile(join(fixture.repository, ".codex", "hooks.json"), '{"human":true}\n', "utf8");
    const before = await snapshot(fixture.repository);
    const result = await invoke(fixture.store, fixture.repository);
    expect(result.exitCode).toBe(0);
    expect(result.data).toMatchObject({
      repositoryMutated: false,
      planPersisted: true,
      plan: { files: [{ path: ".codex/hooks.json", action: "conflict" }] },
    });
    expect(await snapshot(fixture.repository)).toEqual(before);
  });

  it("拒绝位于 Repository 内的 Runtime Store 且保持零写入", async () => {
    const fixture = await createFixture();
    const before = await snapshot(fixture.repository);
    const result = await invoke(join(fixture.repository, ".runtime"), fixture.repository);
    expect(result).toMatchObject({
      exitCode: 4,
      error: { code: HarnessErrorCode.OperationForbidden },
    });
    expect(await snapshot(fixture.repository)).toEqual(before);
  });

  it("拒绝经符号链接落入 Repository 的 Runtime Store", async () => {
    const fixture = await createFixture();
    const alias = join(dirname(fixture.repository), "repository-alias");
    try {
      await symlink(fixture.repository, alias, "junction");
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "EPERM"
      )
        return;
      throw error;
    }
    const before = await snapshot(fixture.repository);
    const result = await invoke(join(alias, ".runtime"), fixture.repository);
    expect(result).toMatchObject({
      exitCode: 4,
      error: { code: HarnessErrorCode.OperationForbidden },
    });
    expect(await snapshot(fixture.repository)).toEqual(before);
  });

  it("拒绝 Runtime Store 后代符号链接把计划写入 Repository", async () => {
    const fixture = await createFixture();
    await mkdir(fixture.store);
    try {
      await symlink(fixture.repository, join(fixture.store, "install-plans"), "junction");
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "EPERM"
      )
        return;
      throw error;
    }
    const before = await snapshot(fixture.repository);
    const result = await invoke(fixture.store, fixture.repository);
    expect(result).toMatchObject({
      exitCode: 4,
      error: { code: HarnessErrorCode.OperationForbidden },
    });
    expect(await snapshot(fixture.repository)).toEqual(before);
  });

  it("Repository 自声明 Manifest 不能取得 Human File 所有权", async () => {
    const fixture = await createFixture();
    const content = '{"human":true}\n';
    await mkdir(join(fixture.repository, ".codex"));
    await writeFile(join(fixture.repository, ".codex", "hooks.json"), content, "utf8");
    await mkdir(join(fixture.repository, ".liushi-harness"));
    await writeFile(
      join(fixture.repository, ".liushi-harness", "managed-files.json"),
      `${JSON.stringify({ schemaVersion: 1, entries: [manifestEntry(content)] })}\n`,
      "utf8",
    );
    const before = await snapshot(fixture.repository);
    const result = await invoke(fixture.store, fixture.repository);
    expect(result).toMatchObject({
      exitCode: 0,
      data: {
        plan: { files: [{ action: "conflict", persisted: { provenance: "unverified_claim" } }] },
      },
    });
    expect(await snapshot(fixture.repository)).toEqual(before);
  });

  it("保留其他 profile 的无关 Manifest 条目", async () => {
    const fixture = await createFixture();
    await mkdir(join(fixture.repository, ".liushi-harness"));
    await writeFile(
      join(fixture.repository, ".liushi-harness", "managed-files.json"),
      `${JSON.stringify({
        schemaVersion: 1,
        entries: [
          manifestEntry("unrelated", {
            path: ".claude/settings.json",
            profile: "claude-compatible",
          }),
        ],
      })}\n`,
      "utf8",
    );
    const before = await snapshot(fixture.repository);
    const result = await invoke(fixture.store, fixture.repository);
    expect(result).toMatchObject({
      exitCode: 0,
      data: { plan: { files: [{ path: ".codex/hooks.json", action: "create" }] } },
    });
    expect(await snapshot(fixture.repository)).toEqual(before);
  });

  it.runIf(process.platform === "win32")(
    "Windows 下拒绝仅大小写不同的 Manifest 路径别名",
    async () => {
      const fixture = await createFixture();
      await mkdir(join(fixture.repository, ".liushi-harness"));
      await writeFile(
        join(fixture.repository, ".liushi-harness", "managed-files.json"),
        `${JSON.stringify({
          schemaVersion: 1,
          entries: [manifestEntry("alias", { path: ".CODEX/hooks.json" })],
        })}\n`,
        "utf8",
      );
      const result = await invoke(fixture.store, fixture.repository);
      expect(result).toMatchObject({
        exitCode: 6,
        error: { code: HarnessErrorCode.CorruptStore },
      });
    },
  );
});

async function createFixture(): Promise<{ readonly repository: string; readonly store: string }> {
  const root = await mkdtemp(join(tmpdir(), "liushi-init-e2e-"));
  roots.push(root);
  const repository = join(root, "repository");
  const store = join(root, "runtime");
  await run("git", ["init", "repository"], { cwd: root });
  await writeFile(join(repository, "README.md"), "fixture\n", "utf8");
  await run("git", ["add", "."], { cwd: repository });
  await run(
    "git",
    ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "fixture"],
    { cwd: repository },
  );
  return { repository, store };
}

async function invoke(
  store: string,
  root: string,
): Promise<{
  readonly exitCode: number;
  readonly data: Record<string, unknown>;
  readonly error?: { readonly code: HarnessErrorCode };
}> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const writer: CliWriter = {
    stdout: (value) => stdout.push(value),
    stderr: (value) => stderr.push(value),
  };
  const exitCode = await runCli(
    [
      "init",
      "--target",
      "codex",
      "--root",
      root,
      "--workspace",
      "workspace-1",
      "--repository",
      "repository-1",
      "--dry-run",
      "--store",
      store,
      "--json",
    ],
    {
      defaultStoreRoot: store,
      applicationFactory: {
        create: (storeRoot) => createHarnessApplication({ storeRoot, packageVersion: "test" }),
      },
      writer,
      jsonDocumentReader: new NodeJsonDocumentReaderAdapter(),
    },
  );
  const envelope = JSON.parse(stdout[0] ?? stderr[0] ?? "{}") as {
    command: CliCommand;
    data?: Record<string, unknown>;
    error?: { readonly code: HarnessErrorCode };
  };
  expect(envelope.command).toBe(CliCommand.InitDryRun);
  return {
    exitCode,
    data: envelope.data ?? {},
    ...(envelope.error === undefined ? {} : { error: envelope.error }),
  };
}

function manifestEntry(
  content: string,
  overrides: { readonly path?: string; readonly profile?: string } = {},
) {
  const digest = new Rfc8785Sha256DigestAdapter();
  const lastAppliedDigest = digest.calculate(content);
  const sourceDigest = digest.calculate("source");
  if (
    lastAppliedDigest.status === ResultStatus.Failure ||
    sourceDigest.status === ResultStatus.Failure
  )
    throw new Error("fixture digest failed");
  return {
    path: overrides.path ?? ".codex/hooks.json",
    lastAppliedDigest: lastAppliedDigest.value,
    repositoryId: "repository-1",
    installationRevisionId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    installPlanDigest: `sha256:${"c".repeat(64)}`,
    original: { kind: "missing" },
    metadata: {
      ownerPackage: "liushi-harness",
      profile: overrides.profile ?? "codex",
      packageVersion: "test",
      template: ".codex/hooks.json",
      source: "codex.hooks",
      sourceDigest: sourceDigest.value,
    },
  };
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
