import { afterEach, describe, expect, it } from "vitest";

import {
  ActionJournalStatus,
  ActionOutcome,
  ActorKind,
  ApprovalDecision,
  ArtifactStatus,
  ArtifactType,
  COMMAND_ENVELOPE_SCHEMA_VERSION,
  CommandStatus,
  HookDecision,
  ResultStatus,
  RiskLevel,
  createHarnessApplication,
  parsePostActionHookPayload,
  parsePreActionHookPayload,
  type HarnessApplication,
  type PlanRiskArtifact,
  type PostActionHookPayload,
  type PreActionHookPayload,
} from "../../src/index.js";
import { Rfc8785Sha256DigestAdapter } from "../../src/infrastructure/index.js";
import { createPostActionHookInput, createPreActionHookInput } from "../support/hooks/index.js";
import { FixedSequenceIdGenerator, TemporaryRuntimeStore } from "../support/runtime/index.js";

const WORKSPACE_ID = "workspace-hook";
const TASK_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const ACTION_ID = "01ARZ3NDEKTSV4RRFFQ69G5FB0";
const ALTERNATE_ACTION_ID = "01ARZ3NDEKTSV4RRFFQ69G5FB1";
const HUMAN = { kind: ActorKind.Human, actorId: "hook-tester" } as const;
const runtimeStores = new TemporaryRuntimeStore();
const digest = new Rfc8785Sha256DigestAdapter();

describe("CanonicalHookDispatcher", () => {
  it("完成 R1 Pre/Post 主路径、幂等重放、Action Journal 与 Trace 落盘", async () => {
    const storeRoot = await runtimeStores.create("liushi-hook-happy-");
    const { app, planRisk } = await prepareTask(storeRoot, RiskLevel.R1);
    const prePayload = validPrePayload(planRisk);
    const preCommand = commandFor(prePayload, 0);

    const pre = await app.handleHook.execute(preCommand);
    const replayedPre = await app.handleHook.execute(preCommand);

    expect(pre.status).toBe(ResultStatus.Success);
    expect(replayedPre.status).toBe(ResultStatus.Success);
    if (pre.status === ResultStatus.Success && replayedPre.status === ResultStatus.Success) {
      expect(pre.value).toMatchObject({ decision: HookDecision.Allow });
      expect(replayedPre.value).toMatchObject({
        decision: HookDecision.Allow,
        receipt: { status: CommandStatus.Committed },
      });
    }

    const postPayload = validPostPayload();
    const postCommand = commandFor(postPayload, 1);
    const post = await app.handleHook.execute(postCommand);
    const replayedPost = await app.handleHook.execute(postCommand);

    expect(post.status).toBe(ResultStatus.Success);
    expect(replayedPost.status).toBe(ResultStatus.Success);
    if (post.status === ResultStatus.Success && replayedPost.status === ResultStatus.Success) {
      expect(post.value).toMatchObject({
        decision: HookDecision.Allow,
        actionStatus: ActionJournalStatus.Committed,
      });
      expect(replayedPost.value.receipt.status).toBe(CommandStatus.Committed);
    }

    const journal = await app.getActionJournal.execute({
      workspaceId: WORKSPACE_ID,
      taskId: TASK_ID,
      actionId: ACTION_ID,
    });
    const traces = await app.listTraceObservations.execute({
      workspaceId: WORKSPACE_ID,
      taskId: TASK_ID,
      actionId: ACTION_ID,
    });
    expect(journal.status).toBe(ResultStatus.Success);
    expect(traces.status).toBe(ResultStatus.Success);
    if (journal.status === ResultStatus.Success && traces.status === ResultStatus.Success) {
      expect(journal.value).toMatchObject({
        lastSequence: 3,
        status: ActionJournalStatus.Committed,
      });
      expect(journal.value.observations).toHaveLength(1);
      expect(journal.value.resolutions).toHaveLength(1);
      expect(traces.value.observations).toHaveLength(1);
    }
  });

  it("拒绝 Write Set 外目标且不创建 Action Intent", async () => {
    const storeRoot = await runtimeStores.create("liushi-hook-write-set-");
    const { app, planRisk } = await prepareTask(storeRoot, RiskLevel.R1);
    const payload = validPrePayload(planRisk, {
      actionId: ALTERNATE_ACTION_ID,
      commandId: "command-outside-write-set",
      hookExecutionId: "hook-outside-write-set",
      targets: ["packages/other/src/index.ts"],
    });

    const result = await app.handleHook.execute(commandFor(payload, 0));
    const recoverable = await app.listRecoverableActions.execute({
      workspaceId: WORKSPACE_ID,
      taskId: TASK_ID,
    });

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Success) {
      expect(result.value).toMatchObject({ decision: HookDecision.Deny });
    }
    expect(recoverable.status).toBe(ResultStatus.Success);
    if (recoverable.status === ResultStatus.Success) {
      expect(recoverable.value).toHaveLength(0);
    }
  });

  it("R2 PlanRisk 未获得 G4 Human Approval 时拒绝 PreAction", async () => {
    const storeRoot = await runtimeStores.create("liushi-hook-r2-");
    const { app, planRisk } = await prepareTask(storeRoot, RiskLevel.R2);
    const payload = validPrePayload(planRisk);

    const result = await app.handleHook.execute(commandFor(payload, 0));

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Success) {
      expect(result.value).toMatchObject({ decision: HookDecision.Deny });
    }
  });

  it("拒绝未因果绑定对应 Intent 的 PostAction", async () => {
    const storeRoot = await runtimeStores.create("liushi-hook-causation-");
    const { app, planRisk } = await prepareTask(storeRoot, RiskLevel.R1);
    const prePayload = validPrePayload(planRisk);
    const pre = await app.handleHook.execute(commandFor(prePayload, 0));
    expect(pre.status).toBe(ResultStatus.Success);

    const forgedPost = validPostPayload({ causationId: "forged-pre-command" });
    const result = await app.handleHook.execute(commandFor(forgedPost, 1));
    const journal = await app.getActionJournal.execute({
      workspaceId: WORKSPACE_ID,
      taskId: TASK_ID,
      actionId: ACTION_ID,
    });

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Success) {
      expect(result.value).toMatchObject({ decision: HookDecision.Deny });
    }
    expect(journal.status).toBe(ResultStatus.Success);
    if (journal.status === ResultStatus.Success) {
      expect(journal.value).toMatchObject({
        lastSequence: 1,
        status: ActionJournalStatus.IntentRecorded,
      });
    }
  });

  it("拒绝 Envelope 与 Payload 的摘要绑定不一致", async () => {
    const storeRoot = await runtimeStores.create("liushi-hook-binding-");
    const { app, planRisk } = await prepareTask(storeRoot, RiskLevel.R1);
    const payload = validPrePayload(planRisk);
    const command = commandFor(payload, 0);

    const result = await app.handleHook.execute({
      ...command,
      requestDigest: `sha256:${"0".repeat(64)}`,
    });

    expect(result.status).toBe(ResultStatus.Failure);
  });
});

afterEach(async () => runtimeStores.cleanup());

async function prepareTask(
  storeRoot: string,
  riskLevel: RiskLevel,
): Promise<{ app: HarnessApplication; planRisk: PlanRiskArtifact }> {
  const app = createHarnessApplication({
    storeRoot,
    taskIdGenerator: new FixedSequenceIdGenerator([TASK_ID]),
  });
  const created = await app.createTask.execute({
    workspaceId: WORKSPACE_ID,
    source: "ticket-hook",
    actor: HUMAN,
  });
  expect(created.status).toBe(ResultStatus.Success);
  if (created.status !== ResultStatus.Success) throw created.error;

  const requirement = await app.proposeArtifact.execute({
    workspaceId: WORKSPACE_ID,
    taskId: created.value.task.taskId,
    actor: HUMAN,
    proposal: requirementProposal(),
  });
  if (
    requirement.status !== ResultStatus.Success ||
    requirement.value.decisionRequest === undefined
  ) {
    throw new Error("测试前置 Requirement 必须产生 G1 决策请求。");
  }
  const approved = await app.recordApproval.execute({
    workspaceId: WORKSPACE_ID,
    taskId: created.value.task.taskId,
    decisionRequestId: requirement.value.decisionRequest.decisionRequestId,
    decisionRequestDigest: requirement.value.decisionRequest.digest,
    idempotencyKey: `approve-requirement-${riskLevel}`,
    actor: HUMAN,
    decision: ApprovalDecision.Approved,
  });
  if (approved.status !== ResultStatus.Success) throw approved.error;

  const planned = await app.proposeArtifact.execute({
    workspaceId: WORKSPACE_ID,
    taskId: created.value.task.taskId,
    actor: HUMAN,
    proposal: planRiskProposal(riskLevel),
  });
  if (planned.status !== ResultStatus.Success) throw planned.error;
  return { app, planRisk: planned.value.artifact as PlanRiskArtifact };
}

function validPrePayload(
  planRisk: PlanRiskArtifact,
  overrides: Readonly<Record<string, unknown>> = {},
): PreActionHookPayload {
  const parsed = parsePreActionHookPayload(
    createPreActionHookInput({
      workspaceId: WORKSPACE_ID,
      taskId: TASK_ID,
      planRiskArtifactId: planRisk.artifactId,
      planRiskArtifactDigest: planRisk.digest,
      ...overrides,
    }),
  );
  if (parsed.status === ResultStatus.Failure) throw parsed.error;
  return parsed.value;
}

function validPostPayload(
  overrides: Readonly<Record<string, unknown>> = {},
): PostActionHookPayload {
  const parsed = parsePostActionHookPayload(
    createPostActionHookInput({
      workspaceId: WORKSPACE_ID,
      taskId: TASK_ID,
      actionId: ACTION_ID,
      outcome: ActionOutcome.Succeeded,
      ...overrides,
    }),
  );
  if (parsed.status === ResultStatus.Failure) throw parsed.error;
  return parsed.value;
}

function commandFor(
  payload: PreActionHookPayload | PostActionHookPayload,
  expectedVersion: number,
) {
  const requestDigest = digest.calculate(payload);
  if (requestDigest.status === ResultStatus.Failure) throw requestDigest.error;
  return {
    schemaVersion: COMMAND_ENVELOPE_SCHEMA_VERSION,
    commandId: payload.commandId,
    commandType: `hook.${payload.event}`,
    aggregateType: "action",
    aggregateId: payload.actionId,
    expectedVersion,
    idempotencyKey: payload.hookExecutionId,
    requestDigest: requestDigest.value,
    actor: payload.actor,
    authorizationContext: {},
    correlationId: payload.correlationId,
    ...(payload.causationId === undefined ? {} : { causationId: payload.causationId }),
    submittedAt: payload.occurredAt,
    payload,
  };
}

function requirementProposal() {
  return {
    artifactType: ArtifactType.RequirementContract,
    status: ArtifactStatus.Proposed,
    payload: {
      problem: "验证 Canonical Hook 主路径。",
      goals: ["副作用必须经过 PlanRisk 授权。"],
      nonGoals: ["实现平台 Hook Adapter。"],
      observableBehaviors: ["Write Set 外动作被拒绝。"],
      acceptanceCriteria: ["Action Journal 可重放。"],
      includedScopes: ["packages/liushi-harness"],
      forbiddenScopes: ["packages/other"],
      repositories: ["liushi-aweasome-agentic-engineering"],
      edgeCases: ["重复 Hook"],
      compatibilityConstraints: ["保持事件日志权威"],
      evidence: [],
      claims: [],
      unknowns: [],
      humanAnswers: [],
    },
  };
}

function planRiskProposal(riskLevel: RiskLevel) {
  return {
    artifactType: ArtifactType.PlanRisk,
    status: ArtifactStatus.Proposed,
    payload: {
      steps: [{ order: 1, action: "修改 Harness 源文件。" }],
      readSet: ["packages/liushi-harness/src"],
      writeSet: ["packages/liushi-harness/src"],
      risks: [{ description: "实现错误。", mitigation: "执行自动化测试。" }],
      riskLevel,
      historicalLogicChange: false,
      riskOperations: [],
      testPlan: ["运行测试。"],
      rollbackPlan: ["由 Human 审查恢复。"],
      requiredGates: [],
    },
  };
}
