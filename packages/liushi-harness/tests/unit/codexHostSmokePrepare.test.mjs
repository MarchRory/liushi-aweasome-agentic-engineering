import { access, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runProcess } from "../../scripts/common/process/index.mjs";
import { parseCodexHostSmokeArguments } from "../../scripts/codexHostSmoke/cli/index.mjs";
import { createCandidateHookConfig } from "../../scripts/codexHostSmoke/config/index.mjs";
import { CODEX_HOST_SMOKE_REQUIRED_HUMAN_ACTIONS } from "../../scripts/codexHostSmoke/constants/index.mjs";
import {
  calculateActivationDigest,
  createCodexHostSmokeManifest,
} from "../../scripts/codexHostSmoke/manifest/index.mjs";
import {
  assertCodexHostSmokeCommand,
  runCodexHostSmokeCommand,
} from "../../scripts/codexHostSmoke/policy/index.mjs";
import { createCodexHostSmokeWorktree } from "../../scripts/codexHostSmoke/project/index.mjs";
import { prepareCodexHostSmoke } from "../../scripts/codexHostSmoke/service/index.mjs";
import { verifyCodexHostSmoke } from "../../scripts/codexHostSmoke/verification/index.mjs";

const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("Codex Host Smoke Prepare", () => {
  it("严格解析 Prepare 的路径和执行身份", () => {
    const root = resolve("host-smoke-root");
    const codex = resolve("codex.exe");
    const codexHome = resolve("codex-home");
    const options = [
      "--root",
      root,
      "--codex",
      codex,
      "--codex-home",
      codexHome,
      "--model",
      "gpt-5.6-sol",
      "--actor-id",
      "smoke-human",
    ];

    const expected = {
      command: "prepare",
      root,
      codexExecutable: codex,
      codexHome,
      model: "gpt-5.6-sol",
      actorId: "smoke-human",
    };

    expect(parseCodexHostSmokeArguments(["prepare", ...options])).toEqual(expected);
    expect(parseCodexHostSmokeArguments(["prepare", "--", ...options])).toEqual(expected);

    for (const args of [
      ["execute", ...options],
      ["prepare", ...options, "--unknown", "value"],
      ["prepare", ...options, "--root", root],
      ["prepare", "--", "--", ...options],
      ["prepare", ...options.slice(0, -2)],
      ["prepare", ...options.slice(0, 1), "relative", ...options.slice(2)],
      ["prepare", ...options.slice(0, 7), "unsafe model", ...options.slice(8)],
      ["prepare", ...options.slice(0, 9), "actor\0", ...options.slice(10)],
    ]) {
      expect(() => parseCodexHostSmokeArguments(args)).toThrow();
    }
  });

  it("严格解析 Verify Manifest 和 Activation Digest", () => {
    const manifestPath = resolve("prepareManifest.json");
    const activationDigest = `sha256:${"a".repeat(64)}`;
    const expected = { command: "verify", manifestPath, activationDigest };

    expect(
      parseCodexHostSmokeArguments([
        "verify",
        "--manifest",
        manifestPath,
        "--activation-digest",
        activationDigest,
      ]),
    ).toEqual(expected);
    expect(
      parseCodexHostSmokeArguments([
        "verify",
        "--",
        "--manifest",
        manifestPath,
        "--activation-digest",
        activationDigest,
      ]),
    ).toEqual(expected);

    for (const args of [
      ["verify", "--manifest", "relative", "--activation-digest", activationDigest],
      ["verify", "--manifest", manifestPath],
      ["verify", "--manifest", manifestPath, "--activation-digest", "sha256:ABC"],
      ["verify", "--manifest", manifestPath, "--manifest", manifestPath],
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
    const fourth = calculateActivationDigest({
      ...input,
      activationPlan: { ...input.activationPlan, model: { id: "gpt-next" } },
    });
    const fifth = calculateActivationDigest({
      ...input,
      worktree: { ...input.worktree, gitEntryKind: "file" },
    });

    expect(first).not.toBe(second);
    expect(first).not.toBe(third);
    expect(first).not.toBe(fourth);
    expect(first).not.toBe(fifth);
    const manifest = createCodexHostSmokeManifest(input);
    expect(manifest.schemaVersion).toBe("liushi.codex-host-smoke.prepare.v3");
    expect(manifest.activation.digest).toBe(first);
    expect(manifest.activation.binding.requiredHumanActions).toEqual(
      CODEX_HOST_SMOKE_REQUIRED_HUMAN_ACTIONS,
    );
    expect(manifest.activation.requiredHumanActions.at(-1)).toContain("/hooks");
  });

  it("使用普通 Clone 隔离 Host Smoke", async () => {
    const parent = await mkdtemp(join(tmpdir(), "liushi-codex-host-clone-test-"));
    temporaryRoots.push(parent);
    const sourceRoot = join(parent, "source");
    const worktreeRoot = join(parent, "worktree");
    await mkdir(sourceRoot);
    runGitFixture(sourceRoot, ["init"]);
    runGitFixture(sourceRoot, ["config", "user.name", "liushi-host-smoke-test"]);
    runGitFixture(sourceRoot, ["config", "user.email", "liushi-host-smoke@example.invalid"]);
    await writeFile(join(sourceRoot, "README.md"), "fixture\n", "utf8");
    runGitFixture(sourceRoot, ["add", "README.md"]);
    runGitFixture(sourceRoot, ["commit", "-m", "fixture"]);
    const revision = runGitFixture(sourceRoot, ["rev-parse", "HEAD"]);

    const result = createCodexHostSmokeWorktree(sourceRoot, worktreeRoot, revision);

    expect(result).toMatchObject({
      headRevision: revision,
      clean: true,
      detached: true,
      gitEntryKind: "directory",
    });
    expect((await lstat(join(worktreeRoot, ".git"))).isDirectory()).toBe(true);
  });

  it("拒绝 linked worktree 的 .git 文件形态", async () => {
    const fixture = await createServiceFixture({ gitEntryKind: "file" });

    await expect(prepareCodexHostSmoke(fixture.input, fixture.dependencies)).rejects.toThrow(
      "普通 Clone",
    );
    await expect(access(fixture.input.root)).rejects.toThrow();
  });

  it("成功时保留 fixture，但不写 worktree Hook 配置或 Binding", async () => {
    const fixture = await createServiceFixture();

    const summary = await prepareCodexHostSmoke(fixture.input, fixture.dependencies);

    expect(summary.status).toBe("human_activation_required");
    await expect(access(summary.manifestPath)).resolves.toBeUndefined();
    const manifest = JSON.parse(await readFile(summary.manifestPath, "utf8"));
    expect(manifest.worktree.gitEntryKind).toBe("directory");
    expect(manifest.activation.binding.worktreeGitEntryKind).toBe("directory");
    expect(manifest.bindingCandidate.hookBindExecuted).toBe(false);
    expect(manifest.codexProbe).toMatchObject({
      overallStatus: "verified",
      hookFrameworkStatus: "verified",
      productionVerified: false,
    });
    expect(manifest.activation.digest).toBe(summary.activationDigest);
    expect(summary.activationPlanPath).toBe(manifest.activationPlan.path);
    const activationPlan = JSON.parse(await readFile(summary.activationPlanPath, "utf8"));
    expect(activationPlan).toMatchObject({
      schemaVersion: "liushi.codex-host-smoke.activation-plan.v1",
      status: "human_approval_required",
      actorId: "smoke-human",
      model: { id: "gpt-5.6-sol", reasoningEffort: "low" },
      projectTrust: { writeExecuted: false },
      hookConfigWrite: { writeExecuted: false },
      hookBinding: { executed: false },
      hookDefinitionTrust: { command: "/hooks", bypassAllowed: false, completed: false },
    });
    expect(activationPlan.hostRuns).toHaveLength(2);
    expect(activationPlan.hostRuns.every((run) => run.executed === false)).toBe(true);
    expect(activationPlan.hostRuns.flatMap((run) => run.args)).not.toContain(
      "--dangerously-bypass-hook-trust",
    );
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

  it("只读 Verify 接受未漂移 Packet，并拒绝候选 Hook 漂移", async () => {
    const fixture = await createServiceFixture();
    const prepared = await prepareCodexHostSmoke(fixture.input, fixture.dependencies);
    const manifest = JSON.parse(await readFile(prepared.manifestPath, "utf8"));
    const verificationDependencies = {
      inspectWorktree: (root) => ({
        root,
        headRevision: manifest.worktree.headRevision,
        clean: true,
        detached: true,
        gitEntryKind: "directory",
      }),
      inspectCodexVersion: () => `codex-cli ${manifest.codexProbe.version}`,
    };

    const verified = await verifyCodexHostSmoke(
      {
        manifestPath: prepared.manifestPath,
        activationDigest: prepared.activationDigest,
      },
      verificationDependencies,
    );
    expect(verified).toMatchObject({
      schemaVersion: "liushi.codex-host-smoke.verification.v1",
      status: "verified",
      activationDigest: prepared.activationDigest,
    });

    const candidate = JSON.parse(await readFile(manifest.candidateHookConfig.path, "utf8"));
    candidate.drift = true;
    await writeFile(manifest.candidateHookConfig.path, JSON.stringify(candidate), "utf8");
    await expect(
      verifyCodexHostSmoke(
        {
          manifestPath: prepared.manifestPath,
          activationDigest: prepared.activationDigest,
        },
        verificationDependencies,
      ),
    ).rejects.toThrow("Candidate Hook Config");
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
  const codexHome = join(parent, "codexHome");
  await mkdir(codexHome);
  await writeFile(join(codexHome, "config.toml"), "", "utf8");
  const root = join(parent, "prepared");
  return {
    input: {
      root,
      codexExecutable,
      codexHome,
      model: "gpt-5.6-sol",
      actorId: "smoke-human",
      packageRoot: join(parent, "package"),
    },
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
          gitEntryKind: options.gitEntryKind ?? "directory",
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

function runGitFixture(cwd, args) {
  return runProcess("git", args, {
    cwd,
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  }).stdout.trim();
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
    paths: {
      worktreeRoot: "C:/host/worktree",
      activationPlanFile: "C:/host/control/activationPlan.json",
    },
    worktree: {
      headRevision: "82632b66f5914e9946edce300e10633a3d5c0cb7",
      clean: true,
      detached: true,
      gitEntryKind: "directory",
    },
    codexProbe: {
      executable: "C:/codex.exe",
      version: "0.144.0-alpha.4",
    },
    candidateHookConfig: {
      digest: `sha256:${"3".repeat(64)}`,
      path: "C:/host/control/candidateHooks.json",
    },
    activationPlan: {
      schemaVersion: "liushi.codex-host-smoke.activation-plan.v1",
      model: { id: "gpt-5.6-sol", reasoningEffort: "low" },
      hostRuns: [],
    },
    bindingCandidate: {
      workspaceId: "liushi-public-project-smoke",
      taskId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      planRiskArtifactId: "01ARZ3NDEKTSV4RRFFQ69G5FB0",
      planRiskArtifactDigest: `sha256:${"2".repeat(64)}`,
    },
  };
}
