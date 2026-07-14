import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  ApprovalDecision,
  ArtifactStatus,
  ArtifactType,
  HarnessErrorCode,
  ResultStatus,
  RiskLevel,
  ActorKind,
  createHarnessApplication,
} from "../../src/index.js";
import { TemporaryRuntimeStore } from "../support/runtime/index.js";

const runtimeStores = new TemporaryRuntimeStore();
const actor = { kind: ActorKind.Human, actorId: "human-reviewer" };

describe("Codex Hook Adapter", () => {
  afterEach(async () => runtimeStores.cleanup());

  it("绑定已批准 PlanRisk 后完成 Pre/Post Action，并支持确定性重放", async () => {
    const setup = await createBoundApplication();
    const toolInput = createPatchInput("packages/liushi-harness/src/index.ts");
    const preInput = createPreInput(setup.workspaceRoot, "tool-1", toolInput);

    const firstPre = await setup.application.handleCodexHook.execute(preInput);
    const replayedPre = await setup.application.handleCodexHook.execute(preInput);
    const postInput = createPostInput(setup.workspaceRoot, "tool-1", toolInput, { success: true });
    const firstPost = await setup.application.handleCodexHook.execute(postInput);
    const replayedPost = await setup.application.handleCodexHook.execute(postInput);

    expect(firstPre).toEqual({ status: ResultStatus.Success, value: {} });
    expect(replayedPre).toEqual(firstPre);
    expect(firstPost).toMatchObject({
      status: ResultStatus.Success,
      value: { body: { hookSpecificOutput: { hookEventName: "PostToolUse" } } },
    });
    expect(replayedPost).toEqual(firstPost);
  });

  it("超出 Write Set 的 PreToolUse 返回 deny，且未执行文件动作", async () => {
    const setup = await createBoundApplication();
    const input = createPreInput(
      setup.workspaceRoot,
      "tool-outside",
      createPatchInput("packages/other/src/index.ts"),
    );

    const result = await setup.application.handleCodexHook.execute(input);

    expect(result).toMatchObject({
      status: ResultStatus.Success,
      value: {
        body: {
          hookSpecificOutput: {
            permissionDecision: "deny",
          },
        },
      },
    });
  });

  it("同一 tool_use_id 的输入变化返回 ActionConflict，未绑定 cwd fail closed", async () => {
    const setup = await createBoundApplication();
    const firstToolInput = createPatchInput("packages/liushi-harness/src/index.ts");
    const firstInput = createPreInput(setup.workspaceRoot, "tool-conflict", firstToolInput);
    const changedInput = createPreInput(
      setup.workspaceRoot,
      "tool-conflict",
      createPatchInput("packages/liushi-harness/src/other.ts"),
    );

    const first = await setup.application.handleCodexHook.execute(firstInput);
    const conflict = await setup.application.handleCodexHook.execute(changedInput);
    const missingBinding = await setup.application.handleCodexHook.execute(
      createPreInput(join(setup.storeRoot, "unbound"), "tool-missing", firstToolInput),
    );

    expect(first.status).toBe(ResultStatus.Success);
    expect(conflict).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.ActionConflict },
    });
    expect(missingBinding).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.OperationForbidden },
    });
  });
});

async function createBoundApplication() {
  const storeRoot = await runtimeStores.create("liushi-codex-hook-");
  const application = createHarnessApplication({ storeRoot });
  const workspaceId = "workspace-codex";
  const created = await application.createTask.execute({
    workspaceId,
    source: "codex-hook-test",
    actor,
  });
  if (created.status !== ResultStatus.Success) throw new Error("Task fixture creation failed.");
  const taskId = created.value.task.taskId;
  const requirement = await application.proposeArtifact.execute({
    workspaceId,
    taskId,
    actor,
    proposal: requirementProposal(),
  });
  if (
    requirement.status !== ResultStatus.Success ||
    requirement.value.decisionRequest === undefined
  ) {
    throw new Error("Requirement fixture proposal failed.");
  }
  await approve(application, workspaceId, taskId, requirement.value.decisionRequest, "approve-g1");

  const plan = await application.proposeArtifact.execute({
    workspaceId,
    taskId,
    actor,
    proposal: planRiskProposal(),
  });
  if (plan.status !== ResultStatus.Success || plan.value.decisionRequest === undefined) {
    throw new Error("PlanRisk fixture proposal failed.");
  }
  await approve(application, workspaceId, taskId, plan.value.decisionRequest, "approve-g4");

  const workspaceRoot = join(storeRoot, "repository");
  const bound = await application.bindHookWorkspace.execute({
    workspaceRoot,
    workspaceId,
    taskId,
    planRiskArtifactId: plan.value.artifact.artifactId,
    planRiskArtifactDigest: plan.value.artifact.digest,
    actorId: "coding-agent",
  });
  if (bound.status !== ResultStatus.Success) {
    throw new Error(`Hook binding fixture failed: ${bound.error.message}`);
  }
  return { application, storeRoot, workspaceRoot, taskId };
}

async function approve(
  application: ReturnType<typeof createHarnessApplication>,
  workspaceId: string,
  taskId: string,
  request: { decisionRequestId: string; digest: string },
  idempotencyKey: string,
): Promise<void> {
  const result = await application.recordApproval.execute({
    workspaceId,
    taskId,
    decisionRequestId: request.decisionRequestId,
    decisionRequestDigest: request.digest,
    idempotencyKey,
    actor,
    decision: ApprovalDecision.Approved,
  });
  if (result.status !== ResultStatus.Success) throw new Error("Approval fixture failed.");
}

function createPreInput(
  cwd: string,
  toolUseId: string,
  toolInput: Record<string, string>,
): Record<string, unknown> {
  return {
    session_id: "session-1",
    cwd,
    hook_event_name: "PreToolUse",
    model: "gpt-5",
    permission_mode: "default",
    turn_id: "turn-1",
    transcript_path: null,
    agent_id: "code-mode-agent",
    agent_type: "code_mode",
    tool_name: "apply_patch",
    tool_use_id: toolUseId,
    tool_input: toolInput,
  };
}

function createPostInput(
  cwd: string,
  toolUseId: string,
  toolInput: Record<string, string>,
  toolResponse: unknown,
): Record<string, unknown> {
  return {
    ...createPreInput(cwd, toolUseId, toolInput),
    hook_event_name: "PostToolUse",
    tool_response: toolResponse,
  };
}

function createPatchInput(target: string): Record<string, string> {
  return {
    command: `*** Begin Patch\n*** Update File: ${target}\n@@\n*** End Patch`,
  };
}

function requirementProposal() {
  return {
    artifactType: ArtifactType.RequirementContract,
    status: ArtifactStatus.Proposed,
    payload: {
      problem: "Validate Codex Hook authorization.",
      goals: ["Bind a real approved PlanRisk to a Hook workspace."],
      nonGoals: ["Implement Workflow Runtime."],
      observableBehaviors: ["Unsafe targets are denied."],
      acceptanceCriteria: ["Pre and Post Hook calls are replayable."],
      includedScopes: ["packages/liushi-harness"],
      forbiddenScopes: ["unrelated packages"],
      repositories: ["liushi-aweasome-agentic-engineering"],
      edgeCases: ["changed tool input"],
      compatibilityConstraints: ["Codex native Hook JSON"],
      evidence: [],
      claims: [],
      unknowns: [],
      humanAnswers: [],
    },
  };
}

function planRiskProposal() {
  return {
    artifactType: ArtifactType.PlanRisk,
    status: ArtifactStatus.Proposed,
    payload: {
      steps: [{ order: 1, action: "Run a bounded apply_patch action." }],
      readSet: ["packages/liushi-harness/src"],
      writeSet: ["packages/liushi-harness/src"],
      risks: [{ description: "File mutation", mitigation: "Use exact Write Set." }],
      riskLevel: RiskLevel.R2,
      historicalLogicChange: false,
      riskOperations: [{ target: "source-file", reason: "Updates source code." }],
      testPlan: ["Run Hook integration tests."],
      rollbackPlan: ["Restore the patch."],
      requiredGates: [],
    },
  };
}
