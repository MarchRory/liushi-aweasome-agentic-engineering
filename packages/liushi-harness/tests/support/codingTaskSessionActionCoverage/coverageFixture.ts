import {
  ACTION_JOURNAL_SCHEMA_VERSION,
  ActionJournalRecordType,
  ActionKind,
  ActionOutcome,
  ActionResolution,
  appendActionObservation,
  appendActionResolution,
  createActionJournalState,
  createCodingTaskSessionActivationRecord,
  createAgentSessionProcessEvidence,
  AgentSessionProcessEvidenceSchemaVersion,
  AgentSessionProcessHostSurface,
  AgentSessionProcessOutcome,
  AgentSessionProcessEvidenceCreateDisposition,
  CODING_TASK_SESSION_ACTIVATION_SCHEMA_VERSION,
  CodingTaskSessionAdmissionSchemaVersion,
  CodingTaskSessionAdmissionStatus,
  parseArtifactDigest,
  parseActionResolution,
  parseSessionActionIntent,
  parseSessionActionObservation,
  SESSION_ACTION_JOURNAL_SCHEMA_VERSION,
  TRACE_OBSERVATION_SCHEMA_VERSION,
  TraceOperationKind,
  TraceSpanKind,
  TraceStatusCode,
  type HarnessError,
  type ActionJournalRepository,
  type ActionJournalState,
  type CodingTaskSessionActivationRecord,
  type CodingTaskSessionActivationRepository,
  type CodingTaskSessionActionCoverageInput,
  type CodingTaskSessionActionCoverageServiceDependencies,
  type CodingTaskSessionAdmissionState,
  type AgentSessionProcessEvidence,
  type ContentDigestPort,
  type TraceObservationStore,
  type AgentSessionProcessEvidenceStore,
  type TraceQueryResult,
  type TraceSpanObservation,
} from "../../../src/index.js";
import {
  ActorKind,
  ResultStatus,
  failure,
  parseActionId,
  parseArtifactId,
  parseCodingTaskId,
  parseCodingTaskSessionId,
  parseContentDigest,
  parseRepositoryId,
  parseTaskId,
  parseWorkspaceId,
  success,
  type Result,
} from "../../../src/index.js";
import { Rfc8785Sha256DigestAdapter } from "../../../src/infrastructure/index.js";

const workspaceId = unwrap(parseWorkspaceId("coverage-workspace"));
const sessionId = unwrap(parseCodingTaskSessionId("01ARZ3NDEKTSV4RRFFQ69G5FAV"));
const sourceTaskId = unwrap(parseTaskId("01ARZ3NDEKTSV4RRFFQ69G5FCX"));
const codingTaskId = unwrap(parseCodingTaskId("coverage-coding-task"));
const repositoryId = unwrap(parseRepositoryId("coverage-repository"));
const planRiskArtifactId = unwrap(parseArtifactId("01ARZ3NDEKTSV4RRFFQ69G5FDA"));
const actionA = unwrap(parseActionId("01ARZ3NDEKTSV4RRFFQ69G5FCY"));
const actionB = unwrap(parseActionId("01ARZ3NDEKTSV4RRFFQ69G5FCZ"));
const digest = unwrap(parseContentDigest(`sha256:${"a".repeat(64)}`));
const sessionBindingDigest = unwrap(parseContentDigest(`sha256:${"b".repeat(64)}`));
const executorSessionIdDigest = unwrap(parseContentDigest(`sha256:${"c".repeat(64)}`));

/** Coverage Service 单测使用的全量 Port fixture。 */
export interface CoverageFixture {
  readonly input: CodingTaskSessionActionCoverageInput;
  readonly activation: CodingTaskSessionActivationRecord;
  readonly admission: CodingTaskSessionAdmissionState;
  /** Coverage 必须加载的合成 completed 进程证据。 */
  readonly processEvidence: AgentSessionProcessEvidence;
  readonly journals: Map<string, ActionJournalState>;
  readonly traces: Map<string, TraceQueryResult>;
  readonly calls: { readonly journal: string[]; readonly trace: string[] };
  readonly faults: {
    activationRecord?: CodingTaskSessionActivationRecord;
    activationError?: HarnessError;
    admissionError?: HarnessError;
    journalError?: HarnessError;
    traceError?: HarnessError;
  };
  readonly digest: ContentDigestPort;
  readonly dependencies: CodingTaskSessionActionCoverageServiceDependencies;
}

/** 创建含 Committed、Recovered 和可选多 Trace Action 的 Coverage fixture。 */
export function createCoverageFixture(
  options: { readonly multiTrace?: boolean } = {},
): CoverageFixture {
  const digestPort = new Rfc8785Sha256DigestAdapter();
  const activation = unwrap(
    createCodingTaskSessionActivationRecord(
      {
        schemaVersion: CODING_TASK_SESSION_ACTIVATION_SCHEMA_VERSION,
        sessionId,
        workspaceId,
        codingTaskId,
        sourceTaskId,
        repositoryId,
        attemptNumber: 1,
        attemptStartedAt: "2026-07-26T00:00:00.000Z",
        worktreeId: "coverage-worktree",
        worktreeRootDigest: digest,
        planRiskArtifactId,
        planRiskArtifactDigest: unwrap(parseArtifactDigest(digest)),
        agentActorId: "agent:coverage",
        activatedAt: "2026-07-26T00:00:00.000Z",
      },
      digestPort,
    ),
  );
  const admission: CodingTaskSessionAdmissionState = {
    schemaVersion: CodingTaskSessionAdmissionSchemaVersion.V1,
    workspaceId,
    sessionId,
    activationBindingDigest: activation.bindingDigest,
    sessionBindingDigest,
    status: CodingTaskSessionAdmissionStatus.Closing,
    pendingAdmission: null,
    admittedActionIds: [actionB, actionA],
    claimedExecutorSessionIdDigest: executorSessionIdDigest,
    version: 2,
    updatedAt: "2026-07-26T00:02:00.000Z",
  };
  const traceA = [createTrace(actionA, "1", "1")];
  if (options.multiTrace === true) traceA.push(createTrace(actionA, "2", "2"));
  const traceB = [createTrace(actionB, "3", "3")];
  const journals = new Map<string, ActionJournalState>([
    [actionA, createJournal(actionA, traceA, ActionResolution.Committed, digestPort, activation)],
    [actionB, createJournal(actionB, traceB, ActionResolution.Recovered, digestPort, activation)],
  ]);
  const traces = new Map<string, TraceQueryResult>([
    [actionA, { observations: traceA, skippedRecordCount: 0 }],
    [actionB, { observations: traceB, skippedRecordCount: 0 }],
  ]);
  const calls: { journal: string[]; trace: string[] } = { journal: [], trace: [] };
  const faults: CoverageFixture["faults"] = {};
  const processEvidence = unwrap(
    createAgentSessionProcessEvidence(
      {
        schemaVersion: AgentSessionProcessEvidenceSchemaVersion.V1,
        workspaceId,
        sessionId,
        codingTaskId,
        sourceTaskId,
        attemptNumber: activation.attemptNumber,
        worktreeId: activation.worktreeId,
        worktreeRootDigest: activation.worktreeRootDigest,
        activationBindingDigest: activation.bindingDigest,
        sessionBindingDigest,
        executorSessionIdDigest,
        executorId: "codex",
        executorVersion: "1.0.0",
        executableDigest: digest,
        hostSurface: AgentSessionProcessHostSurface.Cli,
        modelId: "gpt-5",
        reasoningEffort: "high",
        permissionMode: "workspace-write",
        promptDigest: digest,
        hookConfigDigest: digest,
        startedAt: "2026-07-26T00:00:00.000Z",
        completedAt: "2026-07-26T00:02:00.000Z",
        durationMs: 120000,
        outcome: AgentSessionProcessOutcome.Completed,
        exitCode: 0,
        signal: null,
        timedOut: false,
      },
      digestPort,
    ),
  );
  const agentSessionProcessEvidenceStore: AgentSessionProcessEvidenceStore = {
    create: (evidence) =>
      Promise.resolve(
        success({ disposition: AgentSessionProcessEvidenceCreateDisposition.Created, evidence }),
      ),
    load: () => Promise.resolve(success(processEvidence)),
  };
  const activationRepository = {
    load: () =>
      Promise.resolve(
        faults.activationError === undefined
          ? success(faults.activationRecord ?? activation)
          : failure(faults.activationError),
      ),
  } as unknown as CodingTaskSessionActivationRepository;
  const admissionStateStore = {
    load: () =>
      Promise.resolve(
        faults.admissionError === undefined ? success(admission) : failure(faults.admissionError),
      ),
  } as unknown as CodingTaskSessionActionCoverageServiceDependencies["admissionStateStore"];
  const actionJournalRepository = {
    load: ({ actionId }: { readonly actionId: string }) => {
      calls.journal.push(actionId);
      return Promise.resolve(
        faults.journalError === undefined
          ? success(journals.get(actionId)!)
          : failure(faults.journalError),
      );
    },
  } as unknown as ActionJournalRepository;
  const traceObservationStore = {
    query: ({ actionId }: { readonly actionId?: string }) => {
      calls.trace.push(actionId ?? "");
      if (faults.traceError !== undefined) return Promise.resolve(failure(faults.traceError));
      return Promise.resolve(success(traces.get(actionId ?? "")!));
    },
  } as unknown as TraceObservationStore;
  return {
    input: { workspaceId, sessionId },
    activation,
    admission,
    processEvidence,
    journals,
    traces,
    calls,
    faults,
    digest: digestPort,
    dependencies: {
      activationRepository,
      admissionStateStore,
      agentSessionProcessEvidenceStore,
      actionJournalRepository,
      traceObservationStore,
      contentDigest: digestPort,
    },
  };
}

function createJournal(
  actionId: typeof actionA,
  traces: readonly TraceSpanObservation[],
  finalResolution: ActionResolution,
  digestPort: ContentDigestPort,
  activation: CodingTaskSessionActivationRecord,
): ActionJournalState {
  const provenance = {
    sessionId,
    codingTaskId,
    attemptNumber: 1,
    worktreeId: activation.worktreeId,
    worktreeRootDigest: activation.worktreeRootDigest,
    activationBindingDigest: activation.bindingDigest,
    sessionBindingDigest,
    executorSessionIdDigest,
  };
  const intent = unwrap(
    parseSessionActionIntent({
      schemaVersion: SESSION_ACTION_JOURNAL_SCHEMA_VERSION,
      recordType: ActionJournalRecordType.Intent,
      actionId,
      sequence: 1,
      workspaceId,
      taskId: sourceTaskId,
      commandId: `command-${actionId}`,
      correlationId: `correlation-${actionId}`,
      idempotencyKey: `idempotency-${actionId}`,
      kind: ActionKind.FileMutation,
      target: "src/a.ts",
      targets: ["src/a.ts"],
      inputDigest: digest,
      postconditionDigest: digest,
      recoveryGuidance: "等待 Human 复核并决定恢复方式。",
      sessionProvenance: provenance,
      actor: { kind: ActorKind.Agent, actorId: "agent:coverage" },
      recordedAt: "2026-07-26T00:03:00.000Z",
    }),
  );
  let state = parseState(intent);
  for (const [index, trace] of traces.entries()) {
    const observationDigest = unwrap(digestPort.calculate(trace));
    state = appendObservation(state, {
      schemaVersion: SESSION_ACTION_JOURNAL_SCHEMA_VERSION,
      recordType: ActionJournalRecordType.Observation,
      actionId,
      workspaceId,
      taskId: sourceTaskId,
      sequence: index * 2 + 2,
      outcome: index === traces.length - 1 ? ActionOutcome.Succeeded : ActionOutcome.NotApplied,
      evidenceIds: [`evidence-${actionId}-${index}`],
      sessionProvenance: provenance,
      targets: ["src/a.ts"],
      trace: {
        observationDigest,
        disposition: "persisted",
        recoveryPathDigests: [],
      },
      actor: { kind: ActorKind.Agent, actorId: "agent:coverage" },
      recordedAt: `2026-07-26T00:0${4 + index}:00.000Z`,
    });
    state = appendResolution(state, {
      schemaVersion: ACTION_JOURNAL_SCHEMA_VERSION,
      recordType: ActionJournalRecordType.Resolution,
      actionId,
      workspaceId,
      taskId: sourceTaskId,
      sequence: index * 2 + 3,
      resolution: index === traces.length - 1 ? finalResolution : ActionResolution.RetryPermitted,
      reason: "依据 Observation 完成确定性收口。",
      actor: { kind: ActorKind.Agent, actorId: "agent:coverage" },
      recordedAt: `2026-07-26T00:0${5 + index}:00.000Z`,
    });
  }
  return state;
}

function createTrace(
  actionId: typeof actionA,
  traceIdDigit: string,
  spanIdDigit: string,
): TraceSpanObservation {
  return {
    schemaVersion: TRACE_OBSERVATION_SCHEMA_VERSION,
    traceId: traceIdDigit.repeat(32) as TraceSpanObservation["traceId"],
    spanId: spanIdDigit.repeat(16) as TraceSpanObservation["spanId"],
    workspaceId,
    taskId: sourceTaskId,
    commandId: `command-${actionId}`,
    correlationId: `correlation-${actionId}`,
    actionId,
    actor: { kind: ActorKind.Agent, actorId: "agent:coverage" },
    operationKind: TraceOperationKind.Tool,
    operationName: "workspace.writeFile",
    spanKind: TraceSpanKind.Client,
    status: TraceStatusCode.Ok,
    startedAt: "2026-07-26T00:03:00.000Z",
    endedAt: "2026-07-26T00:03:01.000Z",
    tool: { toolName: "workspace.writeFile", toolCallId: `call-${actionId}-${spanIdDigit}` },
  };
}

function parseState(intent: Parameters<typeof createActionJournalState>[0]): ActionJournalState {
  return createActionJournalState(intent);
}

function appendObservation(state: ActionJournalState, input: unknown): ActionJournalState {
  return unwrap(appendActionObservation(state, unwrap(parseSessionActionObservation(input))));
}

function appendResolution(state: ActionJournalState, input: unknown): ActionJournalState {
  return unwrap(appendActionResolution(state, unwrap(parseActionResolution(input))));
}

function unwrap<T, E>(result: Result<T, E>): T {
  if (result.status === ResultStatus.Failure) {
    throw result.error instanceof Error ? result.error : new Error(String(result.error));
  }
  return result.value;
}
