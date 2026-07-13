import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";

import { resolveNpmCliPath, runProcess } from "../../common/process/index.mjs";
import { SMOKE_HUMAN_ACTOR_ID, WORKSPACE_ID, WRITE_SET } from "../constants/index.mjs";
import { calculateFileDigest } from "../digest/index.mjs";

export async function createHarnessConsumer(packageRoot, temporaryRoot) {
  const packRoot = join(temporaryRoot, "pack");
  const consumerRoot = join(temporaryRoot, "consumer");
  await Promise.all([mkdir(packRoot), mkdir(consumerRoot)]);
  const packed = parseSingleJson(
    runNpm(["pack", "--json", "--pack-destination", packRoot], packageRoot).stdout,
    "npm pack",
  );
  const tarball = join(packRoot, packed.filename);
  await writeFile(
    join(consumerRoot, "package.json"),
    `${JSON.stringify({ name: "liushi-public-project-smoke-consumer", private: true }, null, 2)}\n`,
  );
  runNpm(
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false", tarball],
    consumerRoot,
  );
  const installedManifest = JSON.parse(
    await readFile(join(consumerRoot, "node_modules", "liushi-harness", "package.json"), "utf8"),
  );
  if (installedManifest.name !== "liushi-harness") {
    throw new Error("独立 consumer 未安装预期的 liushi-harness tarball。");
  }
  return {
    consumerRoot,
    packageVersion: installedManifest.version,
    packageArtifact: {
      fileName: requireString(packed.filename, "Tarball Filename"),
      sha256: await calculateFileDigest(tarball),
      npmIntegrity: requireString(packed.integrity, "Tarball npm Integrity"),
      npmShasum: requireString(packed.shasum, "Tarball npm Shasum"),
      size: requireNonNegativeInteger(packed.size, "Tarball Size"),
      unpackedSize: requireNonNegativeInteger(packed.unpackedSize, "Tarball Unpacked Size"),
      entryCount: requireNonNegativeInteger(packed.entryCount, "Tarball Entry Count"),
    },
  };
}

export async function establishGateProtocol(input) {
  const runEnvelope = input.runEnvelope ?? runHarnessEnvelope;
  const created = runEnvelope(input.consumerRoot, [
    "task",
    "create",
    "--workspace",
    WORKSPACE_ID,
    "--source",
    "fixed-public-project-smoke",
    "--actor-id",
    SMOKE_HUMAN_ACTOR_ID,
    "--store",
    input.storeRoot,
    "--json",
  ]);
  const sourceTaskId = requireString(created.data?.taskId, "task create taskId");

  const requirementFile = join(input.storeRoot, "requirementContract.json");
  await writeFile(requirementFile, JSON.stringify(requirementProposal()));
  const requirement = runEnvelope(
    input.consumerRoot,
    proposalArgs(sourceTaskId, requirementFile, input.storeRoot),
  );
  const requirementApproval = approveDecision(
    input.consumerRoot,
    input.storeRoot,
    sourceTaskId,
    requirement.data?.decisionRequest,
    "public-smoke-requirement-approval",
    runEnvelope,
  );

  const planFile = join(input.storeRoot, "planRisk.json");
  await writeFile(planFile, JSON.stringify(planRiskProposal()));
  const plan = runEnvelope(
    input.consumerRoot,
    proposalArgs(sourceTaskId, planFile, input.storeRoot),
  );
  const planArtifact = plan.data?.artifact;
  if (planArtifact?.artifactType !== "plan_risk") throw new Error("PlanRisk Proposal 类型不正确。");
  const planApproval = approveDecision(
    input.consumerRoot,
    input.storeRoot,
    sourceTaskId,
    plan.data?.decisionRequest,
    "public-smoke-plan-risk-approval",
    runEnvelope,
  );
  const gateEvaluation = planApproval.data?.gateEvaluation;
  if (gateEvaluation?.result !== "allow") throw new Error("G4 自动化模拟审批未形成 allow。");
  if (
    gateEvaluation.artifactId !== planArtifact.artifactId ||
    gateEvaluation.artifactDigest !== planArtifact.digest
  ) {
    throw new Error("G4 GateEvaluation 未精确绑定 PlanRisk Artifact。");
  }
  if (requirementApproval.data?.gateEvaluation?.result !== "allow") {
    throw new Error("G1 自动化模拟审批未形成 allow。");
  }
  return {
    sourceTaskId,
    executionAuthorization: {
      planRisk: {
        artifactId: planArtifact.artifactId,
        artifactDigest: planArtifact.digest,
        result: gateEvaluation.result,
        requiredGates: gateEvaluation.requiredGates,
        satisfiedApprovalIds: gateEvaluation.satisfiedApprovals,
      },
      historicalLogicChange: false,
    },
  };
}

export function runCellWithCli(input) {
  return runHarnessEnvelope(input.consumerRoot, [
    "cell",
    "run",
    "--file",
    input.manifestFile,
    "--workspace",
    WORKSPACE_ID,
    "--repository",
    input.repositoryId,
    "--root",
    input.repositoryRoot,
    "--verification-mode",
    "local_command",
    "--store",
    input.storeRoot,
    "--json",
  ]);
}

function proposalArgs(taskId, file, storeRoot) {
  return [
    "artifact",
    "propose",
    "--workspace",
    WORKSPACE_ID,
    "--task",
    taskId,
    "--file",
    file,
    "--actor-id",
    SMOKE_HUMAN_ACTOR_ID,
    "--store",
    storeRoot,
    "--json",
  ];
}

function approveDecision(consumerRoot, storeRoot, taskId, request, idempotencyKey, runEnvelope) {
  const requestId = requireString(request?.decisionRequestId, "DecisionRequest ID");
  const digest = requireString(request?.digest, "DecisionRequest Digest");
  return runEnvelope(consumerRoot, [
    "approval",
    "decide",
    "--workspace",
    WORKSPACE_ID,
    "--task",
    taskId,
    "--request",
    requestId,
    "--request-digest",
    digest,
    "--decision",
    "approved",
    "--idempotency-key",
    idempotencyKey,
    "--reason",
    "自动化 smoke 模拟审批，仅验证 Gate 协议。",
    "--actor-id",
    SMOKE_HUMAN_ACTOR_ID,
    "--store",
    storeRoot,
    "--json",
  ]);
}

export function runHarnessEnvelope(consumerRoot, args) {
  const envelope = runHarnessJson(consumerRoot, args);
  if (envelope.status !== "success")
    throw new Error(`liushi-harness CLI 返回 ${String(envelope.status)}。`);
  return envelope;
}

export function runHarnessNativeJson(consumerRoot, args) {
  return runHarnessJson(consumerRoot, args);
}

function runHarnessJson(consumerRoot, args) {
  const result = runNpm(["exec", "--offline", "--", "liushi-harness", ...args], consumerRoot);
  if (result.stderr.trim().length > 0) {
    throw new Error("liushi-harness CLI 意外写入 stderr。");
  }
  return JSON.parse(result.stdout);
}

function runNpm(args, cwd) {
  return runProcess(process.execPath, [resolveNpmCliPath(), ...args], {
    cwd,
    timeout: 300_000,
    maxBuffer: 1024 * 1024,
  });
}

function parseSingleJson(stdout, label) {
  const parsed = JSON.parse(stdout);
  if (!Array.isArray(parsed) || parsed.length !== 1) throw new Error(`${label} 未返回单一结果。`);
  return parsed[0];
}

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} 缺失。`);
  return value;
}

function requireNonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${label} 必须是非负整数。`);
  return value;
}

function requirementProposal() {
  return {
    artifactType: "requirement_contract",
    status: "proposed",
    payload: {
      problem: "为 defu 的 isPlainObject 增加 module namespace object 回归测试。",
      goals: ["仅修改 test/utils.test.ts 并通过固定测试。"],
      nonGoals: ["修改 src 或历史业务逻辑。"],
      observableBehaviors: ["动态导入 ../src/_utils 后 isPlainObject(namespace) 返回 true。"],
      acceptanceCriteria: ["离线安装与 pnpm test 均通过并生成 PRReadyArtifact。"],
      includedScopes: WRITE_SET,
      forbiddenScopes: ["src", "其他文件"],
      repositories: ["unjs/defu"],
      edgeCases: ["跨进程重复执行同一 Manifest。"],
      compatibilityConstraints: ["固定 revision 且仅形成一个 checkpoint。"],
      evidence: [],
      claims: [],
      unknowns: [],
      humanAnswers: [],
    },
  };
}

function planRiskProposal() {
  return {
    artifactType: "plan_risk",
    status: "proposed",
    payload: {
      steps: [
        { order: 1, action: "在 test/utils.test.ts 增加 module namespace object 回归测试。" },
      ],
      readSet: WRITE_SET,
      writeSet: WRITE_SET,
      risks: [
        {
          description: "测试可能受固定工具链或模块解析差异影响。",
          mitigation: "在受管 Worktree 中离线安装并运行完整 pnpm test。",
        },
      ],
      riskLevel: "R2",
      historicalLogicChange: false,
      riskOperations: [{ target: WRITE_SET[0], reason: "新增固定回归测试。" }],
      testPlan: ["pnpm@10.33.4 install --offline --frozen-lockfile", "pnpm@10.33.4 test"],
      rollbackPlan: ["回退 CodingTask 生成的唯一 checkpoint。"],
      requiredGates: [],
    },
  };
}
