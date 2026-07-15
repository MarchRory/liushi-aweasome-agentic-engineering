import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ResultStatus } from "../../src/common/index.js";
import { ExecutorEvidenceLocatorKind } from "../../src/domain/executorCompatibility/index.js";
import {
  CodexCompatibilityEvidenceProjectorAdapter,
  Rfc8785Sha256DigestAdapter,
} from "../../src/infrastructure/index.js";
import { createCodexHostSmokeActivationPlan } from "../../scripts/codexHostSmoke/activation/index.mjs";
import { createCodexHostSmokeManifest } from "../../scripts/codexHostSmoke/manifest/index.mjs";
import { verifyCodexHostSmokeResult } from "../../scripts/codexHostSmoke/resultVerification/index.mjs";
import { calculateDigest } from "../../scripts/publicProjectSmoke/digest/index.mjs";

const temporaryRoots = [];
const VERIFIED_AT = "2026-07-15T08:09:10.000Z";

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("Codex Host Smoke Result Verification", () => {
  it("同时验证交互式正向闭环和负向授权拒绝", async () => {
    const fixture = await createResultFixture();

    const result = await verifyCodexHostSmokeResult(fixture.input, fixture.dependencies);

    expect(result).toMatchObject({
      schemaVersion: "liushi.codex-host-smoke.result-verification.v2",
      status: "verified",
      hostEvidenceVerified: true,
      matrixSupportClaim: "not_evaluated",
      hostScope: "interactive_tui",
      verificationEnvironment: { platform: "win32", architecture: "x64" },
      verifiedAt: VERIFIED_AT,
      prepareManifestDigest: calculateDigest(fixture.manifest),
      activationPlanDigest: calculateDigest(fixture.activationPlan),
      codexProbeDigest: calculateDigest(fixture.manifest.codexProbe),
      activationDigest: fixture.input.activationDigest,
    });
    expect(result).not.toHaveProperty("productionVerified");
    expect(result.checks).toEqual([
      "packet_digest",
      "codex_version",
      "standard_clone_head_detached",
      "trusted_hook_config",
      "hook_binding",
      "positive_exact_git_diff",
      "positive_action_journal_closed",
      "positive_apply_patch_trace",
      "positive_same_tool_invocation",
      "negative_authorization_denied",
      "negative_exact_target_same_session",
      "negative_no_post",
      "negative_target_unchanged",
    ]);
  });

  it("真实 Host Producer 结果能够通过脱敏 Evidence 投影", async () => {
    const fixture = await createResultFixture();
    const hostResult = await verifyCodexHostSmokeResult(fixture.input, fixture.dependencies);
    const projector = new CodexCompatibilityEvidenceProjectorAdapter(
      new Rfc8785Sha256DigestAdapter(),
    );

    const projection = projector.project({
      prepareManifest: fixture.manifest,
      activationPlan: fixture.activationPlan,
      hostResult,
      artifactLocatorKind: ExecutorEvidenceLocatorKind.RuntimeStore,
    });

    if (projection.status === ResultStatus.Failure) {
      throw new Error(`${projection.error.message} ${JSON.stringify(projection.error.details)}`, {
        cause: projection.error,
      });
    }
    expect(projection.status).toBe(ResultStatus.Success);
    expect(projection.value.evidence).toHaveLength(7);
    expect(projection.value.artifact.scope).not.toHaveProperty("modelId");
    expect(projection.value.artifact.scope).not.toHaveProperty("permissionMode");
  });

  it("拒绝实际采集的平台与 Prepare Manifest 不一致", async () => {
    const fixture = await createResultFixture();
    const dependencies = {
      ...fixture.dependencies,
      inspectEnvironment: () => ({ platform: "linux", architecture: "x64" }),
    };

    await expect(verifyCodexHostSmokeResult(fixture.input, dependencies)).rejects.toThrow(
      "verificationEnvironment.platform 与 Prepare Manifest executionEnvironment.platform 不一致",
    );
  });

  it.each([
    ["架构为空", { platform: "win32", architecture: "" }, "architecture"],
    ["平台类型无效", { platform: 42, architecture: "x64" }, "platform"],
  ])("拒绝实际采集的%s", async (_label, environment, field) => {
    const fixture = await createResultFixture();
    const dependencies = {
      ...fixture.dependencies,
      inspectEnvironment: () => environment,
    };

    await expect(verifyCodexHostSmokeResult(fixture.input, dependencies)).rejects.toThrow(
      `verificationEnvironment.${field} 必须是非空字符串`,
    );
  });

  it("缺少正向 Trace 时关闭式拒绝", async () => {
    const fixture = await createResultFixture();
    await rm(fixture.traceFile);

    await expect(verifyCodexHostSmokeResult(fixture.input, fixture.dependencies)).rejects.toThrow();
  });

  it("缺少负向授权拒绝 Receipt 时关闭式拒绝", async () => {
    const fixture = await createResultFixture();
    await rm(fixture.negativeReservationFile);

    await expect(verifyCodexHostSmokeResult(fixture.input, fixture.dependencies)).rejects.toThrow(
      "Command Receipt",
    );
  });

  it.each(["payload", "session_id"])("拒绝 Reservation 顶层未知字段 %s", async (field) => {
    const fixture = await createResultFixture();
    await mutateReservation(fixture.positivePreReservationFile, (record) => {
      record[field] = "forbidden";
    });

    await expect(verifyCodexHostSmokeResult(fixture.input, fixture.dependencies)).rejects.toThrow(
      "Command Reservation 结构无效",
    );
  });

  it.each([
    [
      "正向 Pre/Post 分裂到不同 Session",
      async (fixture) => {
        await mutateReservation(fixture.positivePostReservationFile, (record) => {
          record.invocationProvenance.sessionIdDigest = calculateDigest("split-session");
          refreshInvocationId(record.invocationProvenance);
        });
      },
      "不可拼接",
    ],
    [
      "正向 Post 工具名与 Pre 不一致",
      async (fixture) => {
        await mutateReservation(fixture.positivePostReservationFile, (record) => {
          record.invocationProvenance.toolName = "different_tool";
          refreshInvocationId(record.invocationProvenance);
        });
      },
      "不可拼接",
    ],
    [
      "负向 Pre 使用错误目标",
      async (fixture) => {
        await mutateReservation(fixture.negativeReservationFile, (record) => {
          record.invocationProvenance.targetsDigest = calculateDigest(["wrong-target.md"]);
        });
      },
      "精确负向目标",
    ],
    [
      "负向 invocation 出现 Post",
      async (fixture) => {
        const negativePre = JSON.parse(await readFile(fixture.negativeReservationFile, "utf8"));
        const commandId = "post-negative";
        const negativePost = {
          ...negativePre,
          commandType: "hook.post_action",
          idempotencyKey: "hook-execution-post-negative",
          commandId,
          submittedAt: "2026-07-14T00:05:00.000Z",
          receipt: {
            schemaVersion: "1.0.0",
            commandId,
            requestDigest: negativePre.requestDigest,
            status: "committed",
            committedVersion: 5,
          },
        };
        const directory = join(fixture.storeRoot, "commandGateway", "3", "record-3");
        await mkdir(directory, { recursive: true });
        await writeJson(join(directory, "reservation.json"), negativePost);
      },
      "负向 invocation 不允许存在 Post",
    ],
    [
      "仅有早于 Manifest 的陈旧 Reservation",
      async (fixture) => {
        await Promise.all(
          fixture.reservationFiles.map((path) =>
            mutateReservation(path, (record) => {
              record.submittedAt = "2026-07-13T23:59:59.999Z";
            }),
          ),
        );
      },
      "Command Receipt",
    ],
    [
      "第四条 Hook Reservation 使用非法 submittedAt",
      async (fixture) => {
        const source = JSON.parse(await readFile(fixture.positivePreReservationFile, "utf8"));
        const commandId = "pre-invalid-time";
        const invalidTime = {
          ...source,
          idempotencyKey: "hook-execution-pre-invalid-time",
          commandId,
          submittedAt: "invalid-submitted-at",
          receipt: { ...source.receipt, commandId },
        };
        const directory = join(fixture.storeRoot, "commandGateway", "3", "record-3");
        await mkdir(directory, { recursive: true });
        await writeJson(join(directory, "reservation.json"), invalidTime);
      },
      "Command Reservation 结构无效",
    ],
    [
      "单字段篡改但未重算 invocationId",
      async (fixture) => {
        await mutateReservation(fixture.positivePostReservationFile, (record) => {
          record.invocationProvenance.turnIdDigest = calculateDigest("tampered-turn");
        });
      },
      "provenance 无效",
    ],
  ])("拒绝%s", async (_label, mutate, expectedMessage) => {
    const fixture = await createResultFixture();
    await mutate(fixture);

    await expect(verifyCodexHostSmokeResult(fixture.input, fixture.dependencies)).rejects.toThrow(
      expectedMessage,
    );
  });
});

async function createResultFixture() {
  const root = await mkdtemp(join(tmpdir(), "liushi-codex-host-result-test-"));
  temporaryRoots.push(root);
  const controlRoot = join(root, "control");
  const worktreeRoot = join(root, "worktree");
  const storeRoot = join(worktreeRoot, ".liushi-harness-runtime");
  const codexHome = join(root, "codexHome");
  const consumerRoot = join(root, "consumer");
  const repositoryRoot = join(root, "repository");
  const candidateConfigFile = join(controlRoot, "candidateHooks.json");
  const activationPlanFile = join(controlRoot, "activationPlan.json");
  const manifestFile = join(controlRoot, "prepareManifest.json");
  const intendedHookConfigFile = join(worktreeRoot, ".codex", "hooks.json");
  const codexExecutable = join(root, "codex.exe");
  const cliEntrypoint = join(
    consumerRoot,
    "node_modules",
    "liushi-harness",
    "dist",
    "bootstrap",
    "cli",
    "cliEntrypoint.js",
  );
  await Promise.all([
    mkdir(controlRoot, { recursive: true }),
    mkdir(join(worktreeRoot, ".codex"), { recursive: true }),
    mkdir(storeRoot, { recursive: true }),
    mkdir(codexHome, { recursive: true }),
    mkdir(consumerRoot, { recursive: true }),
    mkdir(repositoryRoot, { recursive: true }),
  ]);
  await writeFile(codexExecutable, "fixture", "utf8");

  const candidateConfig = { hooks: { PreToolUse: [], PostToolUse: [] } };
  const candidateConfigDigest = calculateDigest(candidateConfig);
  const bindingCandidate = {
    workspaceRoot: worktreeRoot,
    workspaceId: "liushi-public-project-smoke",
    taskId: "01KXF44CKMCND3C14F4E7BHSC8",
    planRiskArtifactId: "01KXF44E7QE04TX02M0EBRHDK7",
    planRiskArtifactDigest: `sha256:${"6".repeat(64)}`,
    gateResult: "allow",
    hookBindExecuted: false,
  };
  const activationPlan = createCodexHostSmokeActivationPlan({
    actorId: "smoke-human",
    model: "gpt-5.6-sol",
    codexExecutable,
    codexHome,
    nodeExecutable: "C:/node.exe",
    cliEntrypoint,
    storeRoot,
    worktreeRoot,
    candidateConfigFile,
    candidateConfigDigest,
    intendedHookConfigFile,
    bindingCandidate,
  });
  const manifest = createCodexHostSmokeManifest({
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
      artifact: {
        fileName: "liushi-harness-0.0.0.tgz",
        sha256: `sha256:${"1".repeat(64)}`,
        npmIntegrity: "sha512-fixture",
        npmShasum: "1".repeat(40),
        size: 1,
        unpackedSize: 2,
        entryCount: 3,
      },
    },
    executionEnvironment: { nodeVersion: "v20", platform: "win32", architecture: "x64" },
    paths: {
      root,
      repositoryRoot,
      worktreeRoot,
      storeRoot,
      consumerRoot,
      candidateConfigFile,
      activationPlanFile,
      intendedHookConfigFile,
    },
    worktree: {
      headRevision: "82632b66f5914e9946edce300e10633a3d5c0cb7",
      clean: true,
      detached: true,
      gitEntryKind: "directory",
      baselineChecks: [
        { checkId: "baseline-install", status: "passed" },
        { checkId: "baseline-test", status: "passed" },
      ],
    },
    codexProbe: {
      schemaVersion: "2.0.0",
      executable: codexExecutable,
      version: "0.144.0-alpha.4",
      overallStatus: "verified",
      hookFrameworkStatus: "verified",
      productionVerified: false,
      commands: [
        { kind: "version", executable: codexExecutable, args: ["--version"] },
        { kind: "help", executable: codexExecutable, args: ["--help"] },
        {
          kind: "features_list",
          executable: codexExecutable,
          args: ["features", "list"],
        },
      ],
    },
    candidateHookConfig: { path: candidateConfigFile, digest: candidateConfigDigest },
    activationPlan,
    bindingCandidate,
  });
  await Promise.all([
    writeJson(candidateConfigFile, candidateConfig),
    writeJson(activationPlanFile, activationPlan),
    writeJson(manifestFile, manifest),
    writeJson(intendedHookConfigFile, candidateConfig),
    writeFile(
      join(codexHome, "config.toml"),
      activationPlan.projectTrust.proposedToml.replaceAll("\n", "\r\n"),
      "utf8",
    ),
  ]);

  await writeBinding(storeRoot, worktreeRoot, bindingCandidate);
  const actionId = "01KXF44E7QE04TX02M0EBRHDM0";
  const taskDirectory = join(
    storeRoot,
    "workspaces",
    bindingCandidate.workspaceId,
    "tasks",
    bindingCandidate.taskId,
  );
  await mkdir(taskDirectory, { recursive: true });
  const positiveInputDigest = calculateDigest({ command: "positive-apply-patch" });
  const actionRecords = createActionRecords(actionId, bindingCandidate, positiveInputDigest);
  await writeFile(
    join(taskDirectory, "actions.jsonl"),
    `${actionRecords.map((record) => JSON.stringify(record)).join("\n")}\n`,
    "utf8",
  );
  const traceFile = join(taskDirectory, "traces.jsonl");
  await writeFile(
    traceFile,
    `${JSON.stringify({
      schemaVersion: "1.0.0",
      actionId,
      commandId: "post-positive",
      workspaceId: bindingCandidate.workspaceId,
      taskId: bindingCandidate.taskId,
      operationKind: "tool",
      operationName: "apply_patch",
      status: "ok",
      tool: { toolName: "apply_patch", toolCallId: calculateDigest("tool-positive") },
    })}\n`,
    "utf8",
  );
  const reservationFiles = await writeReservations(
    storeRoot,
    actionId,
    positiveInputDigest,
    bindingCandidate.taskId,
  );

  return {
    input: { manifestPath: manifestFile, activationDigest: manifest.activation.digest },
    manifest,
    activationPlan,
    storeRoot,
    traceFile,
    reservationFiles,
    positivePreReservationFile: reservationFiles[0],
    positivePostReservationFile: reservationFiles[1],
    negativeReservationFile: reservationFiles[2],
    dependencies: {
      inspectWorktree: () => ({
        root: worktreeRoot,
        headRevision: manifest.worktree.headRevision,
        detached: true,
        gitEntryKind: "directory",
      }),
      inspectCodexVersion: () => `codex-cli ${manifest.codexProbe.version}`,
      inspectGitEvidence: async () => ({
        status: [" M test/utils.test.ts", "?? .codex/hooks.json"],
        changedFiles: ["test/utils.test.ts"],
        numstat: "1\t0\ttest/utils.test.ts",
        diff: "+// liushi-host-smoke-positive",
        positiveContent: "fixture\n// liushi-host-smoke-positive\n",
        negativeContent: "fixture\n",
      }),
      inspectEnvironment: () => ({ platform: "win32", architecture: "x64" }),
      now: () => VERIFIED_AT,
    },
  };
}

function createActionRecords(actionId, binding, inputDigest) {
  const records = [
    {
      schemaVersion: "1.0.0",
      recordType: "action_intent",
      actionId,
      sequence: 1,
      workspaceId: binding.workspaceId,
      taskId: binding.taskId,
      commandId: "pre-positive",
      target: JSON.stringify(["test/utils.test.ts"]),
      inputDigest,
    },
    {
      schemaVersion: "1.0.0",
      recordType: "action_observation",
      actionId,
      sequence: 2,
      workspaceId: binding.workspaceId,
      taskId: binding.taskId,
      outcome: "succeeded",
    },
    {
      schemaVersion: "1.0.0",
      recordType: "action_resolution",
      actionId,
      sequence: 3,
      workspaceId: binding.workspaceId,
      taskId: binding.taskId,
      resolution: "committed",
    },
  ];
  let previousHash = "0".repeat(64);
  return records.map((record, index) => {
    const input = {
      schemaVersion: "1.0.0",
      journalSequence: index + 1,
      record,
      previousHash,
    };
    const envelope = { ...input, hash: calculateDigest(input).slice("sha256:".length) };
    previousHash = envelope.hash;
    return envelope;
  });
}

async function writeBinding(storeRoot, worktreeRoot, binding) {
  const directory = join(storeRoot, "hookBindings");
  await mkdir(directory, { recursive: true });
  await writeJson(join(directory, "bindings.json"), {
    schemaVersion: "1.0.0",
    bindings: [
      {
        schemaVersion: "1.0.0",
        workspaceRoot: worktreeRoot,
        workspaceId: binding.workspaceId,
        taskId: binding.taskId,
        planRiskArtifactId: binding.planRiskArtifactId,
        planRiskArtifactDigest: binding.planRiskArtifactDigest,
        actorId: "smoke-human",
        boundAt: "2026-07-14T00:01:00.000Z",
      },
    ],
  });
}

async function writeReservations(storeRoot, actionId, positiveInputDigest, taskId) {
  const positiveProvenance = createInvocationProvenance({
    sessionId: "session-host-smoke",
    turnId: "turn-positive",
    toolCallId: "tool-positive",
    target: "test/utils.test.ts",
    inputDigest: positiveInputDigest,
  });
  const negativeProvenance = createInvocationProvenance({
    sessionId: "session-host-smoke",
    turnId: "turn-negative",
    toolCallId: "tool-negative",
    target: `liushiHostSmokeNegative${taskId}.md`,
    inputDigest: calculateDigest({ command: "negative-apply-patch" }),
  });
  const records = [
    createReservation(
      "hook.pre_action",
      "pre-positive",
      actionId,
      "committed",
      2,
      positiveProvenance,
    ),
    createReservation(
      "hook.post_action",
      "post-positive",
      actionId,
      "committed",
      3,
      positiveProvenance,
    ),
    createReservation(
      "hook.pre_action",
      "pre-negative",
      "01KXF44E7QE04TX02M0EBRHDN1",
      "rejected",
      4,
      negativeProvenance,
      {
        errorCode: "authorization_denied",
        errorMessage: "PreAction 目标超出 PlanRisk Write Set。",
      },
    ),
  ];
  return Promise.all(
    records.map(async (record, index) => {
      const directory = join(storeRoot, "commandGateway", String(index), `record-${index}`);
      await mkdir(directory, { recursive: true });
      const file = join(directory, "reservation.json");
      await writeJson(file, record);
      return file;
    }),
  );
}

function createReservation(
  commandType,
  commandId,
  aggregateId,
  status,
  minute,
  invocationProvenance,
  receiptExtra = {},
) {
  const requestDigest = `sha256:${String(minute).repeat(64)}`;
  return {
    schemaVersion: "1.0.0",
    aggregateType: "action",
    aggregateId,
    commandType,
    idempotencyKey: `hook-execution-${commandId}`,
    commandId,
    requestDigest,
    submittedAt: `2026-07-14T00:0${minute}:00.000Z`,
    invocationProvenance,
    receipt: {
      schemaVersion: "1.0.0",
      commandId,
      requestDigest,
      status,
      ...(status === "committed" ? { committedVersion: minute } : {}),
      ...receiptExtra,
    },
  };
}

function createInvocationProvenance({ sessionId, turnId, toolCallId, target, inputDigest }) {
  const provenance = {
    schemaVersion: "1.0.0",
    executor: "codex",
    sessionIdDigest: calculateDigest(sessionId),
    turnIdDigest: calculateDigest(turnId),
    toolCallIdDigest: calculateDigest(toolCallId),
    toolName: "apply_patch",
    targetsDigest: calculateDigest([target]),
    inputDigest,
  };
  refreshInvocationId(provenance);
  return provenance;
}

function refreshInvocationId(provenance) {
  provenance.invocationId = calculateDigest({
    executor: provenance.executor,
    sessionIdDigest: provenance.sessionIdDigest,
    turnIdDigest: provenance.turnIdDigest,
    toolCallIdDigest: provenance.toolCallIdDigest,
    toolName: provenance.toolName,
  });
}

async function mutateReservation(path, mutate) {
  const record = JSON.parse(await readFile(path, "utf8"));
  mutate(record);
  await writeJson(path, record);
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
