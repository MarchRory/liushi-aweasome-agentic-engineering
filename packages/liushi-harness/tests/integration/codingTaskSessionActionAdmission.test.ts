import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  ActionJournalStatus,
  ArtifactStatus,
  ArtifactType,
  ApprovalDecision,
  ActorKind,
  CodingTaskCommandType,
  CodingTaskSessionActivationStatus,
  ResultStatus,
  RiskLevel,
  SESSION_ACTION_JOURNAL_SCHEMA_VERSION,
  WORKTREE_PROVISION_COMMAND_TYPE,
  createHarnessApplication,
  type CodingTaskSessionRuntimeBinding,
} from "../../src/index.js";
import {
  Rfc8785Sha256DigestAdapter,
  StaticRepositoryRootResolverAdapter,
} from "../../src/infrastructure/index.js";

const roots: string[] = [];
const workspaceId = "session-admission-workspace";
const sourceTaskId = "01ARZ3NDEKTSV4RRFFQ69G5GAA";
const sessionId = "01ARZ3NDEKTSV4RRFFQ69G5GAB";
const codingTaskId = "session-admission-coding-task";
const repositoryId = "session-admission-repository";
const agentActorId = "agent:codex";
const digest = new Rfc8785Sha256DigestAdapter();

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("CodingTask Session v2 Action Admission 黄金路径", () => {
  it("Activation waiting_agent 自动创建 Binding v2 与 Admission State", async () => {
    const fixture = await createFixture();
    const activated = await fixture.application.activateCodingTaskSession.execute(fixture.manifest);

    expect(
      activated.status,
      activated.status === ResultStatus.Failure
        ? `${activated.error.message} ${JSON.stringify(activated.error.details)}`
        : "",
    ).toBe(ResultStatus.Success);
    if (activated.status !== ResultStatus.Success) return;
    expect(activated.value.status, JSON.stringify(activated.value)).toBe(
      CodingTaskSessionActivationStatus.WaitingAgent,
    );

    const binding = await readJson<BindingFile>(
      join(fixture.storeRoot, "hookBindings", "bindings.json"),
    );
    const state = await readJson<AdmissionFile>(
      join(
        fixture.storeRoot,
        "workspaces",
        workspaceId,
        "codingTaskSessions",
        sessionId,
        "admission.json",
      ),
    );
    expect(binding).toMatchObject({
      schemaVersion: "2.0.0",
      bindings: [{ schemaVersion: "2.0.0", sessionId }],
    });
    expect(state).toMatchObject({
      schemaVersion: "coding-task-session.admission.v1",
      status: "waiting_agent",
      version: 0,
      pendingAdmission: null,
      admittedActionIds: [],
    });
  });

  it("同一 session 的 Codex Pre/Post 经真实 Adapter 持久化 v2 Intent、Observation、Resolution，Post 重放幂等", async () => {
    const fixture = await createFixture();
    const activated = await activate(fixture);
    const preInput = codexInput(fixture.worktreeRoot, "PreToolUse", "tool-session-1");
    const postInput = {
      ...preInput,
      hook_event_name: "PostToolUse",
      tool_response: { success: true },
    };

    const pre = await fixture.application.handleCodexHook.execute(preInput);
    expect(pre.status, pre.status === ResultStatus.Failure ? pre.error.message : "").toBe(
      ResultStatus.Success,
    );
    expect(
      pre.status === ResultStatus.Success ? pre.value.body : undefined,
      JSON.stringify({
        body: pre.status === ResultStatus.Success ? pre.value.body : undefined,
        state: await readJson<AdmissionFile>(admissionPath(fixture)),
        journal: await readActionLines(fixture),
      }),
    ).toBeUndefined();

    const stateAfterPre = await readJson<AdmissionFile>(admissionPath(fixture));
    expect(stateAfterPre).toMatchObject({
      status: "waiting_agent",
      admittedActionIds: [expect.any(String)],
      pendingAdmission: null,
    });
    const actionId = stateAfterPre.admittedActionIds[0] as string;
    const intent = await fixture.application.getActionJournal.execute({
      workspaceId,
      taskId: sourceTaskId,
      actionId,
    });
    expect(intent.status).toBe(ResultStatus.Success);
    expect(intent.status === ResultStatus.Success ? intent.value : undefined).toMatchObject({
      status: ActionJournalStatus.IntentRecorded,
      intent: {
        schemaVersion: SESSION_ACTION_JOURNAL_SCHEMA_VERSION,
        sessionProvenance: { sessionId },
      },
    });

    const post = await fixture.application.handleCodexHook.execute(postInput);
    const replay = await fixture.application.handleCodexHook.execute(postInput);
    expect(post.status).toBe(ResultStatus.Success);
    expect(replay.status).toBe(ResultStatus.Success);
    const journal = await fixture.application.getActionJournal.execute({
      workspaceId,
      taskId: sourceTaskId,
      actionId,
    });
    const traces = await fixture.application.listTraceObservations.execute({
      workspaceId,
      taskId: sourceTaskId,
      actionId,
    });
    expect(
      journal.status,
      journal.status === ResultStatus.Failure
        ? `${journal.error.message} ${JSON.stringify(journal.error.details)}`
        : "",
    ).toBe(ResultStatus.Success);
    expect(traces.status).toBe(ResultStatus.Success);
    if (journal.status === ResultStatus.Success)
      expect(journal.value).toMatchObject({
        status: ActionJournalStatus.Committed,
        observations: [expect.anything()],
        resolutions: [expect.anything()],
      });
    if (traces.status === ResultStatus.Success) {
      expect(traces.value.observations).toHaveLength(1);
      if (journal.status === ResultStatus.Success) {
        const journalObservation = journal.value.observations[0];
        const traceObservation = traces.value.observations[0];
        expect(journalObservation).toMatchObject({
          trace: { observationDigest: digestOf(traceObservation) },
        });
        expect(traceObservation?.actionId).toBe(actionId);
      }
    }
    expect(await readJson<AdmissionFile>(admissionPath(fixture))).toMatchObject({
      status: "waiting_agent",
      admittedActionIds: [actionId],
      pendingAdmission: null,
    });
    void activated;
  });

  it("伪造或不同 session_id fail closed，且不新增 Intent", async () => {
    const fixture = await createFixture();
    await activate(fixture);
    const before = await readActionLines(fixture);
    const forged = await fixture.application.handleCodexHook.execute({
      ...codexInput(fixture.worktreeRoot, "PreToolUse", "tool-forged"),
      session_id: "01ARZ3NDEKTSV4RRFFQ69G5GAC",
    });
    expect(forged.status).toBe(ResultStatus.Success);
    if (forged.status === ResultStatus.Success)
      expect(forged.value.body).toMatchObject({
        hookSpecificOutput: { permissionDecision: "deny" },
      });
    expect(await readActionLines(fixture)).toHaveLength(before.length);
  });

  it("缺失 Post 时持久化状态证明 Action 仍未闭合", async () => {
    const fixture = await createFixture();
    await activate(fixture);
    const pre = await fixture.application.handleCodexHook.execute(
      codexInput(fixture.worktreeRoot, "PreToolUse", "tool-missing-post"),
    );
    expect(pre.status).toBe(ResultStatus.Success);
    if (pre.status !== ResultStatus.Success) return;
    const actionId = actionIdFromJournal(await readActionLines(fixture));
    const journal = await fixture.application.getActionJournal.execute({
      workspaceId,
      taskId: sourceTaskId,
      actionId,
    });
    expect(
      journal.status,
      journal.status === ResultStatus.Failure
        ? `${journal.error.message} ${JSON.stringify(journal.error.details)}`
        : "",
    ).toBe(ResultStatus.Success);
    if (journal.status === ResultStatus.Success)
      expect(journal.value).toMatchObject({
        status: ActionJournalStatus.IntentRecorded,
        observations: [],
        resolutions: [],
      });
    expect(await readJson<AdmissionFile>(admissionPath(fixture))).toMatchObject({
      status: "waiting_agent",
      pendingAdmission: null,
      admittedActionIds: [actionId],
    });
  });
});

/** 真实 Composition Root 与 Git Session Fixture。 */
interface Fixture {
  readonly application: ReturnType<typeof createHarnessApplication>;
  readonly storeRoot: string;
  readonly repositoryRoot: string;
  readonly worktreeRoot: string;
  readonly manifest: Record<string, unknown>;
}
/** Admission State 权威 JSON 的最小读取投影。 */
interface AdmissionFile {
  readonly status: string;
  readonly admittedActionIds: readonly string[];
  readonly pendingAdmission: unknown;
}
/** Binding v2 权威 JSON 的最小读取投影。 */
interface BindingFile {
  readonly schemaVersion: string;
  readonly bindings: readonly Record<string, unknown>[];
}

async function createFixture(): Promise<Fixture> {
  const storeRoot = await temporary("liushi-session-store-");
  const repositoryRoot = await temporary("liushi-session-repository-");
  await runGit(repositoryRoot, ["init", "-b", "main"]);
  await runGit(repositoryRoot, ["config", "user.name", "liushi-test"]);
  await runGit(repositoryRoot, ["config", "user.email", "liushi-test@example.com"]);
  await mkdir(join(repositoryRoot, "src"));
  await writeFile(join(repositoryRoot, "src", "index.ts"), "export const value = 1;\n");
  await runGit(repositoryRoot, ["add", "."]);
  await runGit(repositoryRoot, ["commit", "-m", "base"]);
  const baseRevision = await runGit(repositoryRoot, ["rev-parse", "HEAD"]);
  const application = createHarnessApplication({
    storeRoot,
    taskIdGenerator: { next: () => sourceTaskId },
    repositoryRootResolver: new StaticRepositoryRootResolverAdapter([
      { workspaceId, repositoryId, repositoryRoot },
    ]),
  });
  const task = await application.createTask.execute({
    workspaceId,
    source: "session-admission",
    actor: { kind: ActorKind.Human, actorId: "human" },
  });
  if (task.status !== ResultStatus.Success) throw task.error;
  const requirement = await application.proposeArtifact.execute({
    workspaceId,
    taskId: sourceTaskId,
    actor: { kind: ActorKind.Human, actorId: "human" },
    proposal: requirementProposal(),
  });
  if (
    requirement.status !== ResultStatus.Success ||
    requirement.value.decisionRequest === undefined
  )
    throw new Error("Requirement fixture failed");
  const approved = await application.recordApproval.execute({
    workspaceId,
    taskId: sourceTaskId,
    decisionRequestId: requirement.value.decisionRequest.decisionRequestId,
    decisionRequestDigest: requirement.value.decisionRequest.digest,
    idempotencyKey: "approve-requirement",
    actor: { kind: ActorKind.Human, actorId: "human" },
    decision: ApprovalDecision.Approved,
  });
  if (approved.status !== ResultStatus.Success) throw approved.error;
  const plan = await application.proposeArtifact.execute({
    workspaceId,
    taskId: sourceTaskId,
    actor: { kind: ActorKind.Human, actorId: "human" },
    proposal: planProposal(),
  });
  if (plan.status !== ResultStatus.Success || plan.value.decisionRequest === undefined)
    throw new Error(
      `Plan fixture failed: ${plan.status === ResultStatus.Failure ? plan.error.message : "missing decision request"}`,
    );
  const planApproved = await application.recordApproval.execute({
    workspaceId,
    taskId: sourceTaskId,
    decisionRequestId: plan.value.decisionRequest.decisionRequestId,
    decisionRequestDigest: plan.value.decisionRequest.digest,
    idempotencyKey: "approve-plan",
    actor: { kind: ActorKind.Human, actorId: "human" },
    decision: ApprovalDecision.Approved,
  });
  if (planApproved.status !== ResultStatus.Success) throw planApproved.error;
  const evaluation = planApproved.value.gateEvaluation;
  const authorization = {
    planRisk: {
      artifactId: plan.value.artifact.artifactId,
      artifactDigest: plan.value.artifact.digest,
      result: evaluation.result,
      requiredGates: evaluation.requiredGates,
      satisfiedApprovalIds: evaluation.satisfiedApprovals,
    },
    historicalLogicChange: false,
  };
  const worktreeRoot = join(repositoryRoot, "worktrees", "session");
  const manifest = sessionManifest(repositoryRoot, baseRevision, authorization);
  const runtimeBinding: CodingTaskSessionRuntimeBinding = {
    workspaceId,
    repositoryId,
    repositoryRoot,
    agentActorId,
  };
  const boundApplication = createHarnessApplication({
    storeRoot,
    taskIdGenerator: { next: () => sourceTaskId },
    repositoryRootResolver: new StaticRepositoryRootResolverAdapter([
      { workspaceId, repositoryId, repositoryRoot },
    ]),
    codingTaskSessionRuntimeBinding: runtimeBinding,
  });
  return { application: boundApplication, storeRoot, repositoryRoot, worktreeRoot, manifest };
}

async function activate(fixture: Fixture) {
  const result = await fixture.application.activateCodingTaskSession.execute(fixture.manifest);
  expect(result.status).toBe(ResultStatus.Success);
  if (result.status !== ResultStatus.Success) throw result.error;
  expect(result.value.status).toBe(CodingTaskSessionActivationStatus.WaitingAgent);
  return result.value;
}

function sessionManifest(repositoryRoot: string, baseRevision: string, authorization: unknown) {
  const payload = {
    workspaceId,
    sourceTaskId,
    repositoryId,
    baseRevision,
    worktreeBinding: {
      worktreeId: "session-worktree",
      relativePath: "worktrees/session",
      branchName: "feature/session",
      managed: true,
    },
    writeSet: ["src/index.ts"],
    inputBindingSet: { bindings: [] },
    executionAuthorization: authorization,
  };
  return {
    schemaVersion: "coding-task.session.activate.v1",
    sessionId,
    createCommand: command(
      "session-create",
      CodingTaskCommandType.Create,
      0,
      payload,
      codingTaskId,
    ),
    provision: {
      command: command(
        "session-provision",
        WORKTREE_PROVISION_COMMAND_TYPE,
        1,
        {
          workspaceId,
          actionId: "01ARZ3NDEKTSV4RRFFQ69G5GAD",
          repositoryRootDigest: digestOf({ repositoryRoot }),
        },
        codingTaskId,
      ),
      runtime: { repositoryRoot },
    },
    startAttemptCommand: command(
      "session-start",
      CodingTaskCommandType.StartAttempt,
      1,
      { workspaceId, attemptNumber: 1 },
      codingTaskId,
    ),
  };
}

function command(
  commandId: string,
  commandType: string,
  expectedVersion: number,
  payload: unknown,
  aggregateId: string,
) {
  return {
    schemaVersion: "1.0.0",
    commandId,
    commandType,
    aggregateType: "coding_task",
    aggregateId,
    expectedVersion,
    idempotencyKey: commandId,
    requestDigest: digestOf(payload),
    actor: { kind: "agent", actorId: agentActorId },
    authorizationContext: {},
    correlationId: "session-admission-correlation",
    submittedAt: "2026-07-23T00:00:00.000Z",
    payload,
  };
}
function codexInput(cwd: string, event: string, toolUseId: string) {
  return {
    session_id: sessionId,
    cwd,
    hook_event_name: event,
    model: "gpt-5",
    permission_mode: "default",
    turn_id: "turn-1",
    transcript_path: null,
    agent_id: "code-mode-agent",
    agent_type: "code_mode",
    tool_name: "apply_patch",
    tool_use_id: toolUseId,
    tool_input: { command: "*** Begin Patch\n*** Update File: src/index.ts\n@@\n*** End Patch" },
    ...(event === "PostToolUse" ? { tool_response: { success: true } } : {}),
  };
}
function digestOf(value: unknown): string {
  const result = digest.calculate(value);
  if (result.status !== ResultStatus.Success) throw result.error;
  return result.value;
}
function admissionPath(fixture: Fixture) {
  return join(
    fixture.storeRoot,
    "workspaces",
    workspaceId,
    "codingTaskSessions",
    sessionId,
    "admission.json",
  );
}
async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}
async function readActionLines(fixture: Fixture): Promise<unknown[]> {
  try {
    return (
      await readFile(
        join(fixture.storeRoot, "workspaces", workspaceId, "tasks", sourceTaskId, "actions.jsonl"),
        "utf8",
      )
    )
      .trim()
      .split(/\r?\n/u)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as unknown);
  } catch {
    return [];
  }
}
function actionIdFromJournal(lines: readonly unknown[]): string {
  const actionId = lines
    .map((line) =>
      isRecord(line) && isRecord(line["record"]) && line["record"]["recordType"] === "action_intent"
        ? line["record"]["actionId"]
        : undefined,
    )
    .reverse()
    .find((value): value is string => typeof value === "string" && value.length > 0);
  if (actionId === undefined)
    throw new Error(`Action Journal 未落盘有效 Session actionId: ${JSON.stringify(lines)}`);
  return actionId;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
async function temporary(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}
async function runGit(cwd: string, args: readonly string[]): Promise<string> {
  const { execFile } = await import("node:child_process");
  return await new Promise((resolve, reject) =>
    execFile("git", args, { cwd }, (error, stdout) =>
      error
        ? reject(error instanceof Error ? error : new Error("git command failed"))
        : resolve(stdout.trim()),
    ),
  );
}
function requirementProposal() {
  return {
    artifactType: ArtifactType.RequirementContract,
    status: ArtifactStatus.Proposed,
    payload: {
      problem: "验证 Session Admission",
      goals: ["允许真实 Codex Hook"],
      nonGoals: ["暴露内部 closing API"],
      observableBehaviors: ["Pre/Post 可审计"],
      acceptanceCriteria: ["Action Journal 可重放"],
      includedScopes: ["src"],
      forbiddenScopes: ["other"],
      repositories: [repositoryId],
      edgeCases: ["伪造 session"],
      compatibilityConstraints: ["Codex 原始 Hook JSON"],
      evidence: [],
      claims: [],
      unknowns: [],
      humanAnswers: [],
    },
  };
}
function planProposal() {
  return {
    artifactType: ArtifactType.PlanRisk,
    status: ArtifactStatus.Proposed,
    payload: {
      steps: [{ order: 1, action: "执行 apply_patch" }],
      readSet: ["src/index.ts"],
      writeSet: ["src/index.ts"],
      risks: [{ description: "文件变更", mitigation: "限定 Write Set" }],
      riskLevel: RiskLevel.R2,
      historicalLogicChange: false,
      riskOperations: [],
      testPlan: ["运行集成测试"],
      rollbackPlan: ["恢复测试 worktree"],
      requiredGates: [],
    },
  };
}
