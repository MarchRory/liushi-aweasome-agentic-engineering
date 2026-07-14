import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createCodexHostSmokeActivationPlan } from "../../scripts/codexHostSmoke/activation/index.mjs";
import { createCodexHostSmokeManifest } from "../../scripts/codexHostSmoke/manifest/index.mjs";
import { verifyCodexHostSmokeResult } from "../../scripts/codexHostSmoke/resultVerification/index.mjs";
import { calculateDigest } from "../../scripts/publicProjectSmoke/digest/index.mjs";

const temporaryRoots = [];

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
      schemaVersion: "liushi.codex-host-smoke.result-verification.v1",
      status: "verified",
      productionVerified: true,
      hostScope: "interactive_tui",
      activationDigest: fixture.input.activationDigest,
    });
    expect(result.checks).toContain("positive_action_journal_closed");
    expect(result.checks).toContain("negative_authorization_denied");
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
});

async function createResultFixture() {
  const root = await mkdtemp(join(tmpdir(), "liushi-codex-host-result-test-"));
  temporaryRoots.push(root);
  const controlRoot = join(root, "control");
  const worktreeRoot = join(root, "worktree");
  const storeRoot = join(root, "runtime");
  const codexHome = join(root, "codexHome");
  const consumerRoot = join(root, "consumer");
  const repositoryRoot = join(root, "repository");
  const candidateConfigFile = join(controlRoot, "candidateHooks.json");
  const activationPlanFile = join(controlRoot, "activationPlan.json");
  const manifestFile = join(controlRoot, "prepareManifest.json");
  const intendedHookConfigFile = join(worktreeRoot, ".codex", "hooks.json");
  const codexExecutable = join(root, "codex.exe");
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
    cliEntrypoint: "C:/consumer/cliEntrypoint.js",
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
      artifact: { sha256: `sha256:${"1".repeat(64)}` },
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
      baselineChecks: [],
    },
    codexProbe: {
      executable: codexExecutable,
      version: "0.144.0-alpha.4",
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
    writeFile(join(codexHome, "config.toml"), activationPlan.projectTrust.proposedToml, "utf8"),
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
  const actionRecords = createActionRecords(actionId, bindingCandidate);
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
      tool: { toolName: "apply_patch", toolCallId: "tool-positive" },
    })}\n`,
    "utf8",
  );
  const reservationFiles = await writeReservations(storeRoot, actionId);

  return {
    input: { manifestPath: manifestFile, activationDigest: manifest.activation.digest },
    traceFile,
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
    },
  };
}

function createActionRecords(actionId, binding) {
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

async function writeReservations(storeRoot, actionId) {
  const records = [
    createReservation("hook.pre_action", "pre-positive", actionId, "committed", 2),
    createReservation("hook.post_action", "post-positive", actionId, "committed", 3),
    createReservation(
      "hook.pre_action",
      "pre-negative",
      "01KXF44E7QE04TX02M0EBRHDN1",
      "rejected",
      4,
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

function createReservation(commandType, commandId, aggregateId, status, minute, receiptExtra = {}) {
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

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
