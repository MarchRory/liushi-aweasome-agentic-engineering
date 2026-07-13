import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { parseCodexHostSmokeArguments } from "../../scripts/codexHostSmoke/cli/index.mjs";
import { createCandidateHookConfig } from "../../scripts/codexHostSmoke/config/index.mjs";
import {
  calculateActivationDigest,
  createCodexHostSmokeManifest,
} from "../../scripts/codexHostSmoke/manifest/index.mjs";
import {
  assertCodexHostSmokeCommand,
  runCodexHostSmokeCommand,
} from "../../scripts/codexHostSmoke/policy/index.mjs";
import { prepareCodexHostSmoke } from "../../scripts/codexHostSmoke/service/index.mjs";

const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("Codex Host Smoke Prepare", () => {
  it("严格解析绝对 root 和 codex executable", () => {
    const root = resolve("host-smoke-root");
    const codex = resolve("codex.exe");

    const expected = {
      command: "prepare",
      root,
      codexExecutable: codex,
    };

    expect(parseCodexHostSmokeArguments(["prepare", "--root", root, "--codex", codex])).toEqual(
      expected,
    );
    expect(
      parseCodexHostSmokeArguments(["prepare", "--", "--root", root, "--codex", codex]),
    ).toEqual(expected);

    for (const args of [
      ["execute", "--root", root, "--codex", codex],
      ["prepare", "--root", "relative", "--codex", codex],
      ["prepare", "--root", root, "--codex", "relative"],
      ["prepare", "--root", root, "--codex", codex, "--unknown", "value"],
      ["prepare", "--root", root, "--root", root, "--codex", codex],
      ["prepare", "--", "--", "--root", root, "--codex", codex],
      ["prepare", "--root", `${root}\0`, "--codex", codex],
    ]) {
      expect(() => parseCodexHostSmokeArguments(args)).toThrow();
    }
  });

  it("只重写固定 command handler，保留事件和 matcher", () => {
    const candidate = createCandidateHookConfig({
      projection: hookProjection(),
      nodeExecutable: "C:/Program Files/node/node.exe",
      cliEntrypoint: "C:/host/consumer/cliEntrypoint.js",
      storeRoot: "C:/host/runtime",
    });

    expect(candidate.hooks.PreToolUse[0].matcher).toBe("^apply_patch$");
    expect(candidate.hooks.PostToolUse[0].matcher).toBe("^apply_patch$");
    expect(candidate.hooks.PreToolUse[0].hooks[0].commandWindows).toContain(
      '"C:/Program Files/node/node.exe"',
    );
    expect(candidate.hooks.PreToolUse[0].hooks[0].commandWindows).toContain(
      '"--store" "C:/host/runtime"',
    );
    expect(candidate.hooks.PreToolUse[0].hooks[0].command).toContain(
      "'C:/host/consumer/cliEntrypoint.js'",
    );
  });

  it("只允许 Prepare 所需的 CLI 命令类别", () => {
    const captured = [];
    const runner = (_consumerRoot, args) => captured.push(args);
    const allowed = [
      ["task", "create"],
      ["artifact", "propose"],
      ["approval", "decide"],
      ["hook", "probe"],
      ["hook", "config"],
    ];

    for (const args of allowed) {
      runCodexHostSmokeCommand(runner, "consumer", args);
    }
    expect(captured).toEqual(allowed);

    for (const args of [
      ["hook", "bind"],
      ["cell", "run"],
      ["config", "set"],
      ["exec", "--model", "gpt"],
      ["hook", "probe\0"],
    ]) {
      expect(() => assertCodexHostSmokeCommand(args)).toThrow();
    }
  });

  it("activation digest 绑定风险字段并随字段漂移", () => {
    const input = manifestInput();
    const first = calculateActivationDigest(input);
    const second = calculateActivationDigest({
      ...input,
      bindingCandidate: {
        ...input.bindingCandidate,
        planRiskArtifactDigest: `sha256:${"9".repeat(64)}`,
      },
    });
    const third = calculateActivationDigest({
      ...input,
      codexProbe: { ...input.codexProbe, version: "0.145.0" },
    });

    expect(first).not.toBe(second);
    expect(first).not.toBe(third);
    expect(createCodexHostSmokeManifest(input).activation.digest).toBe(first);
  });

  it("成功时保留 fixture，但不写 worktree Hook 配置或 Binding", async () => {
    const fixture = await createServiceFixture();

    const summary = await prepareCodexHostSmoke(fixture.input, fixture.dependencies);

    expect(summary.status).toBe("human_activation_required");
    await expect(access(summary.manifestPath)).resolves.toBeUndefined();
    const manifest = JSON.parse(await readFile(summary.manifestPath, "utf8"));
    expect(manifest.bindingCandidate.hookBindExecuted).toBe(false);
    expect(manifest.codexProbe).toMatchObject({
      overallStatus: "verified",
      hookFrameworkStatus: "verified",
      productionVerified: false,
    });
    expect(manifest.activation.digest).toBe(summary.activationDigest);
    await expect(access(join(summary.worktreeRoot, ".codex", "hooks.json"))).rejects.toThrow();
    await expect(access(manifest.candidateHookConfig.path)).resolves.toBeUndefined();
  });

  it("已存在 root 时拒绝且不删除调用方内容", async () => {
    const fixture = await createServiceFixture();
    await mkdir(fixture.input.root);
    const marker = join(fixture.input.root, "ownedByHuman.txt");
    await writeFile(marker, "keep", "utf8");

    await expect(prepareCodexHostSmoke(fixture.input, fixture.dependencies)).rejects.toThrow();

    expect(await readFile(marker, "utf8")).toBe("keep");
  });

  it("Codex executable 不存在时不创建 root", async () => {
    const fixture = await createServiceFixture();
    await rm(fixture.input.codexExecutable);

    await expect(prepareCodexHostSmoke(fixture.input, fixture.dependencies)).rejects.toThrow();

    await expect(access(fixture.input.root)).rejects.toThrow();
  });

  it("Probe 降级或准备失败时只清理本次新建 root", async () => {
    const degraded = await createServiceFixture({ degradedProbe: true });
    await expect(prepareCodexHostSmoke(degraded.input, degraded.dependencies)).rejects.toThrow(
      "Probe",
    );
    await expect(access(degraded.input.root)).rejects.toThrow();

    const failed = await createServiceFixture({ baselineFailure: true });
    await expect(prepareCodexHostSmoke(failed.input, failed.dependencies)).rejects.toThrow(
      "baseline failed",
    );
    await expect(access(failed.input.root)).rejects.toThrow();

    const malformed = await createServiceFixture({ malformedCommands: true });
    await expect(prepareCodexHostSmoke(malformed.input, malformed.dependencies)).rejects.toThrow(
      "Probe",
    );
    await expect(access(malformed.input.root)).rejects.toThrow();
  });
});

async function createServiceFixture(options = {}) {
  const parent = await mkdtemp(join(tmpdir(), "liushi-codex-host-prepare-test-"));
  temporaryRoots.push(parent);
  const codexExecutable = join(parent, "codex.exe");
  await writeFile(codexExecutable, "fixture", "utf8");
  const root = join(parent, "prepared");
  return {
    input: { root, codexExecutable, packageRoot: join(parent, "package") },
    dependencies: {
      clonePublicProject: async (preparedRoot) => {
        const repositoryRoot = join(preparedRoot, "repository");
        await mkdir(repositoryRoot);
        return repositoryRoot;
      },
      runBaseline: () => {
        if (options.baselineFailure) throw new Error("baseline failed");
        return [{ checkId: "baseline", status: "passed" }];
      },
      createWorktree: async (_repositoryRoot, worktreeRoot) => {
        await mkdir(worktreeRoot);
        return {
          headRevision: "82632b66f5914e9946edce300e10633a3d5c0cb7",
          clean: true,
          detached: true,
        };
      },
      createHarnessConsumer: async (_packageRoot, preparedRoot) => {
        const consumerRoot = join(preparedRoot, "consumer");
        const cliEntrypoint = join(
          consumerRoot,
          "node_modules",
          "liushi-harness",
          "dist",
          "bootstrap",
          "cli",
        );
        await mkdir(cliEntrypoint, { recursive: true });
        await writeFile(join(cliEntrypoint, "cliEntrypoint.js"), "fixture", "utf8");
        return {
          consumerRoot,
          packageVersion: "0.0.0",
          packageArtifact: { sha256: `sha256:${"1".repeat(64)}` },
        };
      },
      establishGateProtocol: async (input) => {
        input.runEnvelope(input.consumerRoot, ["task", "create"]);
        input.runEnvelope(input.consumerRoot, ["artifact", "propose"]);
        input.runEnvelope(input.consumerRoot, ["approval", "decide"]);
        return {
          sourceTaskId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
          executionAuthorization: {
            planRisk: {
              artifactId: "01ARZ3NDEKTSV4RRFFQ69G5FB0",
              artifactDigest: `sha256:${"2".repeat(64)}`,
              result: "allow",
            },
          },
        };
      },
      runHarnessEnvelope: (_consumerRoot, args) =>
        args[0] === "hook"
          ? probeEnvelope(codexExecutable, options.degradedProbe, options.malformedCommands)
          : { status: "success", data: {} },
      runHarnessNativeJson: () => hookProjection(),
      now: () => "2026-07-14T00:00:00.000Z",
    },
  };
}

function probeEnvelope(executable, degraded, malformedCommands) {
  return {
    status: "success",
    data: {
      schemaVersion: "2.0.0",
      executable,
      version: "0.144.0-alpha.4",
      overallStatus: degraded ? "unverified" : "verified",
      hookFramework: { status: degraded ? "unverified" : "verified" },
      productionVerified: false,
      commands: [
        { kind: "version", executable, args: ["--version"] },
        { kind: "help", executable, args: ["--help"] },
        {
          kind: "features_list",
          executable,
          args: malformedCommands ? ["features", "show"] : ["features", "list"],
        },
      ],
    },
  };
}

function hookProjection() {
  return {
    hooks: {
      PreToolUse: [
        {
          matcher: "^apply_patch$",
          hooks: [
            {
              type: "command",
              command: "liushi-harness hook handle --executor codex",
              commandWindows: "liushi-harness hook handle --executor codex",
              statusMessage: "校验文件变更权限",
            },
          ],
        },
      ],
      PostToolUse: [
        {
          matcher: "^apply_patch$",
          hooks: [
            {
              type: "command",
              command: "liushi-harness hook handle --executor codex",
              commandWindows: "liushi-harness hook handle --executor codex",
              statusMessage: "记录文件变更结果",
            },
          ],
        },
      ],
    },
  };
}

function manifestInput() {
  return {
    generatedAt: "2026-07-14T00:00:00.000Z",
    project: {
      repositoryId: "unjs-defu",
      url: "https://github.com/unjs/defu.git",
      revision: "82632b66f5914e9946edce300e10633a3d5c0cb7",
      packageManager: "pnpm@10.33.4",
    },
    package: {
      name: "liushi-harness",
      version: "0.0.0",
      artifact: { sha256: `sha256:${"1".repeat(64)}` },
    },
    executionEnvironment: { nodeVersion: "v24", platform: "win32", architecture: "x64" },
    paths: { worktreeRoot: "C:/host/worktree" },
    worktree: {
      headRevision: "82632b66f5914e9946edce300e10633a3d5c0cb7",
      clean: true,
      detached: true,
    },
    codexProbe: {
      executable: "C:/codex.exe",
      version: "0.144.0-alpha.4",
    },
    candidateHookConfig: {
      digest: `sha256:${"3".repeat(64)}`,
      path: "C:/host/control/candidateHooks.json",
    },
    bindingCandidate: {
      workspaceId: "liushi-public-project-smoke",
      taskId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      planRiskArtifactId: "01ARZ3NDEKTSV4RRFFQ69G5FB0",
      planRiskArtifactDigest: `sha256:${"2".repeat(64)}`,
    },
  };
}
