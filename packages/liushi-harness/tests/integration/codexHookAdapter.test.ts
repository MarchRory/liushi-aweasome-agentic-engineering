import { readFile, readdir } from "node:fs/promises";
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
import { Rfc8785Sha256DigestAdapter } from "../../src/infrastructure/index.js";
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
    const reservations = await readHookReservations(setup.storeRoot);
    const preReservation = reservations.find((record) => record.commandType === "hook.pre_action");
    const postReservation = reservations.find(
      (record) => record.commandType === "hook.post_action",
    );
    expect(reservations).toHaveLength(2);
    expect(preReservation?.invocationProvenance).toEqual(postReservation?.invocationProvenance);
    const sessionIdDigest = calculateDigest("session-1");
    const turnIdDigest = calculateDigest("turn-1");
    const toolCallIdDigest = calculateDigest("tool-1");
    expect(preReservation?.invocationProvenance).toEqual({
      schemaVersion: "1.0.0",
      executor: "codex",
      invocationId: calculateDigest({
        executor: "codex",
        sessionIdDigest,
        turnIdDigest,
        toolCallIdDigest,
        toolName: "apply_patch",
      }),
      sessionIdDigest,
      turnIdDigest,
      toolCallIdDigest,
      toolName: "apply_patch",
      targetsDigest: calculateDigest(["packages/liushi-harness/src/index.ts"]),
      inputDigest: calculateDigest(toolInput),
    });
    const persistedEvidenceText = await readPersistedCodexEvidenceText(setup);
    expect(persistedEvidenceText).not.toContain("session-1");
    expect(persistedEvidenceText).not.toContain("turn-1");
    expect(persistedEvidenceText).not.toContain("tool-1");
  });

  it("相同 tool_use_id 跨 Session 时生成不同 provenance、Trace 与 Span", async () => {
    const setup = await createBoundApplication();
    const toolInput = createPatchInput("packages/liushi-harness/src/index.ts");

    for (const sessionId of ["session-a", "session-b"]) {
      const preInput = {
        ...createPreInput(setup.workspaceRoot, "shared-tool", toolInput),
        session_id: sessionId,
      };
      const postInput = {
        ...createPostInput(setup.workspaceRoot, "shared-tool", toolInput, { success: true }),
        session_id: sessionId,
      };
      expect((await setup.application.handleCodexHook.execute(preInput)).status).toBe(
        ResultStatus.Success,
      );
      expect((await setup.application.handleCodexHook.execute(postInput)).status).toBe(
        ResultStatus.Success,
      );
    }

    const reservations = await readHookReservations(setup.storeRoot);
    const preInvocationIds = reservations
      .filter((record) => record.commandType === "hook.pre_action")
      .map((record) => record.invocationProvenance.invocationId);
    expect(new Set(preInvocationIds).size).toBe(2);
    const traces = await readJsonLines(
      join(setup.storeRoot, "workspaces", setup.workspaceId, "tasks", setup.taskId, "traces.jsonl"),
    );
    expect(traces).toHaveLength(2);
    expect(new Set(traces.map((trace) => trace.traceId)).size).toBe(2);
    expect(new Set(traces.map((trace) => trace.spanId)).size).toBe(2);
  });

  it("拒绝使用分隔符碰撞元组关闭其他调用的 Action", async () => {
    const setup = await createBoundApplication();
    const toolInput = createPatchInput("packages/liushi-harness/src/index.ts");
    const preInput = {
      ...createPreInput(setup.workspaceRoot, "shared-tool", toolInput),
      session_id: "session:a",
      turn_id: "turn",
    };
    const collidingPostInput = {
      ...createPostInput(setup.workspaceRoot, "shared-tool", toolInput, { success: true }),
      session_id: "session",
      turn_id: "a:turn",
    };

    const pre = await setup.application.handleCodexHook.execute(preInput);
    const collidingPost = await setup.application.handleCodexHook.execute(collidingPostInput);

    expect(pre.status).toBe(ResultStatus.Success);
    expect(collidingPost).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.ActionNotFound },
    });
    expect(await readActionRecordTypes(setup)).toEqual(["action_intent"]);
    expect(await readHookReservations(setup.storeRoot)).toHaveLength(1);
    await expect(
      readFile(
        join(
          setup.storeRoot,
          "workspaces",
          setup.workspaceId,
          "tasks",
          setup.taskId,
          "traces.jsonl",
        ),
        "utf8",
      ),
    ).rejects.toThrow();
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
    const [reservation] = await readHookReservations(setup.storeRoot);
    const sessionIdDigest = calculateDigest("session-1");
    const turnIdDigest = calculateDigest("turn-1");
    const toolCallIdDigest = calculateDigest("tool-outside");
    expect(reservation?.invocationProvenance).toEqual({
      schemaVersion: "1.0.0",
      executor: "codex",
      invocationId: calculateDigest({
        executor: "codex",
        sessionIdDigest,
        turnIdDigest,
        toolCallIdDigest,
        toolName: "apply_patch",
      }),
      sessionIdDigest,
      turnIdDigest,
      toolCallIdDigest,
      toolName: "apply_patch",
      targetsDigest: calculateDigest(["packages/other/src/index.ts"]),
      inputDigest: calculateDigest(input["tool_input"]),
    });
    expect(reservation?.receipt).toMatchObject({
      status: "rejected",
      errorCode: "authorization_denied",
    });
    const reservationText = (await readHookReservationTexts(setup.storeRoot)).join("\n");
    expect(reservationText).not.toContain("session-1");
    expect(reservationText).not.toContain("turn-1");
    expect(reservationText).not.toContain("tool-outside");
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
  return { application, storeRoot, workspaceRoot, workspaceId, taskId };
}

/** Adapter 集成测试读取的最小 Hook Reservation 结构。 */
interface HookReservationFixture {
  readonly commandType: string;
  readonly receipt: {
    readonly status: string;
    readonly errorCode?: string;
  };
  readonly invocationProvenance: {
    readonly schemaVersion: string;
    readonly executor: string;
    readonly invocationId: string;
    readonly sessionIdDigest: string;
    readonly turnIdDigest: string;
    readonly toolCallIdDigest: string;
    readonly toolName: string;
    readonly targetsDigest: string;
    readonly inputDigest: string;
  };
}

/** Adapter 集成测试读取的最小 Trace 结构。 */
interface TraceFixture {
  readonly traceId: string;
  readonly spanId: string;
}

async function readHookReservations(storeRoot: string): Promise<HookReservationFixture[]> {
  const files = await collectReservationFiles(join(storeRoot, "commandGateway"));
  const records = await Promise.all(
    files.map(async (path) => JSON.parse(await readFile(path, "utf8")) as HookReservationFixture),
  );
  return records.filter((record) => record.commandType.startsWith("hook."));
}

async function readHookReservationTexts(storeRoot: string): Promise<string[]> {
  const files = await collectReservationFiles(join(storeRoot, "commandGateway"));
  const texts = await Promise.all(files.map((path) => readFile(path, "utf8")));
  return texts.filter((text) => {
    const record = JSON.parse(text) as HookReservationFixture;
    return record.commandType.startsWith("hook.");
  });
}

async function readPersistedCodexEvidenceText(setup: {
  readonly storeRoot: string;
  readonly workspaceId: string;
  readonly taskId: string;
}): Promise<string> {
  const taskDirectory = join(
    setup.storeRoot,
    "workspaces",
    setup.workspaceId,
    "tasks",
    setup.taskId,
  );
  const reservationFiles = await collectReservationFiles(join(setup.storeRoot, "commandGateway"));
  const evidenceFiles = [
    ...reservationFiles,
    join(taskDirectory, "actions.jsonl"),
    join(taskDirectory, "traces.jsonl"),
  ];
  return (await Promise.all(evidenceFiles.map((path) => readFile(path, "utf8")))).join("\n");
}

async function readActionRecordTypes(setup: {
  readonly storeRoot: string;
  readonly workspaceId: string;
  readonly taskId: string;
}): Promise<string[]> {
  const path = join(
    setup.storeRoot,
    "workspaces",
    setup.workspaceId,
    "tasks",
    setup.taskId,
    "actions.jsonl",
  );
  return (await readFile(path, "utf8"))
    .trim()
    .split(/\r?\n/u)
    .map((line) => {
      const envelope = JSON.parse(line) as { readonly record?: { readonly recordType?: string } };
      return envelope.record?.recordType ?? "";
    });
}

async function collectReservationFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectReservationFiles(path)));
    else if (entry.isFile() && entry.name === "reservation.json") files.push(path);
  }
  return files;
}

async function readJsonLines(path: string): Promise<TraceFixture[]> {
  return (await readFile(path, "utf8"))
    .trim()
    .split(/\r?\n/u)
    .map((line) => JSON.parse(line) as TraceFixture);
}

function calculateDigest(input: unknown): string {
  const digest = new Rfc8785Sha256DigestAdapter().calculate(input);
  if (digest.status !== ResultStatus.Success) throw digest.error;
  return digest.value;
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
