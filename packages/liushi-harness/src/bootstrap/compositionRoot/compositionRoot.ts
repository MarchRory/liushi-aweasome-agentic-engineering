import {
  ApplicationCommandGateway,
  CodingTaskCommandHandler,
  CodingTaskCommandService,
  TaskBackedCodingTaskAuthorizationPolicy,
  ActionHookAuthorizationPolicy,
  BindHookWorkspaceUseCase,
  CanonicalHookDispatcher,
  CheckRuntimeHealthUseCase,
  CompileProjectProfileUseCase,
  CreateTaskUseCase,
  GetTaskStatusUseCase,
  GetTaskTimelineUseCase,
  GetActionJournalUseCase,
  InspectWorktreeUseCase,
  RunVerificationUseCase,
  AcquireRepositoryLockUseCase,
  JournaledActionRunner,
  ListTraceObservationsUseCase,
  ListRecoverableActionsUseCase,
  ProposeArtifactUseCase,
  ProbeCodexCapabilitiesUseCase,
  RecordApprovalUseCase,
  RecordActionIntentUseCase,
  RecordActionObservationUseCase,
  RecordActionResolutionUseCase,
  RecordTraceObservationUseCase,
  ResolveRulesUseCase,
  ScanProjectUseCase,
  RequirementWorkflowCommandHandler,
  WorkflowCommandService,
} from "#application/index.js";
import { HarnessError, HarnessErrorCode } from "#common/index.js";
import {
  ExclusiveFileLockManager,
  FileParentDirectoryDurability,
  FileActionJournalRepository,
  FileCommandReservationStore,
  FileHookBindingStore,
  CodexHookAdapter,
  CodexCapabilityProbeAdapter,
  FileTraceObservationStore,
  FileRuntimeHealthAdapter,
  FileSnapshotStore,
  FileTaskRepository,
  FileWorkflowRepository,
  FileCodingTaskRepository,
  NodeProjectFileSystemAdapter,
  NodeWorktreeInspectorAdapter,
  MockVerificationExecutorAdapter,
  NodeRepositoryLockAdapter,
  FileActionExecutionLockAdapter,
  NodeCommandRunnerAdapter,
  Rfc8785Sha256DigestAdapter,
  StructuredProjectConfigParserAdapter,
  SystemDelayAdapter,
  SystemClock,
  UlidGenerator,
} from "#infrastructure/index.js";

import type { HarnessApplication, HarnessApplicationOptions } from "./compositionRoot.contracts.js";

/** 唯一 Composition Root，负责构造具体 Adapter 和 Use Case。 */
export function createHarnessApplication(options: HarnessApplicationOptions): HarnessApplication {
  if (options.storeRoot.trim().length === 0) {
    throw new HarnessError(HarnessErrorCode.InvalidInput, "Runtime Store root cannot be empty.", {
      field: "storeRoot",
    });
  }

  const clock = options.clock ?? new SystemClock();
  const delay = options.delay ?? new SystemDelayAdapter();
  const taskIdGenerator = options.taskIdGenerator ?? new UlidGenerator();
  const eventIdGenerator = options.eventIdGenerator ?? new UlidGenerator();
  const artifactIdGenerator = options.artifactIdGenerator ?? new UlidGenerator();
  const decisionRequestIdGenerator = options.decisionRequestIdGenerator ?? new UlidGenerator();
  const approvalIdGenerator = options.approvalIdGenerator ?? new UlidGenerator();
  const repositoryLockIdGenerator = options.repositoryLockIdGenerator ?? new UlidGenerator();
  const snapshotStore = new FileSnapshotStore();
  const lockManager = new ExclusiveFileLockManager();
  const parentDirectoryDurability = new FileParentDirectoryDurability();
  const taskRepository = new FileTaskRepository(options.storeRoot, {
    eventIdGenerator,
    snapshotStore,
    lockManager,
    parentDirectoryDurability,
  });
  const workflowRepository = new FileWorkflowRepository(options.storeRoot, {
    lockManager,
    parentDirectoryDurability,
  });
  const codingTaskRepository = new FileCodingTaskRepository(options.storeRoot, {
    lockManager,
    parentDirectoryDurability,
  });
  const codingTaskAuthorizationResolver =
    options.codingTaskAuthorizationResolver ??
    new TaskBackedCodingTaskAuthorizationPolicy(taskRepository, clock);
  const actionJournalRepository = new FileActionJournalRepository(options.storeRoot, {
    lockManager,
    parentDirectoryDurability,
  });
  const commandReservationStore = new FileCommandReservationStore(options.storeRoot, {
    lockManager,
    parentDirectoryDurability,
  });
  const traceObservationStore = new FileTraceObservationStore(options.storeRoot, { lockManager });
  const runtimeHealth = new FileRuntimeHealthAdapter(options.storeRoot);
  const digest = new Rfc8785Sha256DigestAdapter();
  const projectFileSystem = new NodeProjectFileSystemAdapter();
  const projectConfigParser = new StructuredProjectConfigParserAdapter();
  const applicationCommandGateway = new ApplicationCommandGateway(commandReservationStore, delay);
  const hookBindingStore = new FileHookBindingStore(options.storeRoot, {
    lockManager,
    parentDirectoryDurability,
  });
  const hookAuthorizationPolicy = new ActionHookAuthorizationPolicy(taskRepository);
  const canonicalHookDispatcher = new CanonicalHookDispatcher(
    applicationCommandGateway,
    hookAuthorizationPolicy,
    actionJournalRepository,
    traceObservationStore,
    digest,
  );

  return {
    applicationCommandGateway,
    bindHookWorkspace: new BindHookWorkspaceUseCase(taskRepository, hookBindingStore, clock),
    checkRuntimeHealth: new CheckRuntimeHealthUseCase(runtimeHealth),
    compileProjectProfile: new CompileProjectProfileUseCase(taskRepository, digest),
    createTask: new CreateTaskUseCase(taskRepository, clock, taskIdGenerator),
    getTaskStatus: new GetTaskStatusUseCase(taskRepository),
    getTaskTimeline: new GetTaskTimelineUseCase(taskRepository),
    handleHook: canonicalHookDispatcher,
    handleCodexHook: new CodexHookAdapter(
      canonicalHookDispatcher,
      hookBindingStore,
      actionJournalRepository,
      taskRepository,
      digest,
      clock,
    ),
    probeCodexCapabilities: new ProbeCodexCapabilitiesUseCase(
      new CodexCapabilityProbeAdapter(new NodeCommandRunnerAdapter()),
    ),
    getActionJournal: new GetActionJournalUseCase(actionJournalRepository),
    listRecoverableActions: new ListRecoverableActionsUseCase(actionJournalRepository),
    listTraceObservations: new ListTraceObservationsUseCase(traceObservationStore),
    proposeArtifact: new ProposeArtifactUseCase(
      taskRepository,
      digest,
      clock,
      artifactIdGenerator,
      decisionRequestIdGenerator,
    ),
    recordApproval: new RecordApprovalUseCase(
      taskRepository,
      digest,
      clock,
      approvalIdGenerator,
      delay,
    ),
    recordActionIntent: new RecordActionIntentUseCase(actionJournalRepository),
    recordActionObservation: new RecordActionObservationUseCase(actionJournalRepository),
    recordActionResolution: new RecordActionResolutionUseCase(actionJournalRepository),
    recordTraceObservation: new RecordTraceObservationUseCase(traceObservationStore),
    resolveRules: new ResolveRulesUseCase(digest),
    scanProject: new ScanProjectUseCase(projectFileSystem, projectConfigParser, digest),
    workflowCommands: new WorkflowCommandService(
      applicationCommandGateway,
      new RequirementWorkflowCommandHandler(workflowRepository, clock, eventIdGenerator),
    ),
    codingTaskCommands: new CodingTaskCommandService(
      applicationCommandGateway,
      new CodingTaskCommandHandler(
        codingTaskRepository,
        clock,
        eventIdGenerator,
        codingTaskAuthorizationResolver,
      ),
    ),
    inspectWorktree: new InspectWorktreeUseCase(
      new NodeWorktreeInspectorAdapter(new NodeCommandRunnerAdapter()),
    ),
    runVerification: new RunVerificationUseCase(
      options.verificationExecutor ?? new MockVerificationExecutorAdapter(clock),
      digest,
      clock,
    ),
    acquireRepositoryLock: new AcquireRepositoryLockUseCase(
      new NodeRepositoryLockAdapter(
        options.storeRoot,
        lockManager,
        clock,
        repositoryLockIdGenerator,
      ),
    ),
    journaledActionRunner: new JournaledActionRunner(
      actionJournalRepository,
      clock,
      new FileActionExecutionLockAdapter(options.storeRoot, lockManager),
    ),
  };
}
