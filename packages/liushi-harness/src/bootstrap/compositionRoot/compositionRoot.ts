import {
  ApplicationCommandGateway,
  CodingTaskCommandHandler,
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
  RunAndPersistVerificationUseCase,
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
  SelectVerificationPlanUseCase,
  ScanProjectUseCase,
  RequirementWorkflowCommandHandler,
  VerificationActionExecutor,
  VerificationCommandHandler,
  ImplementationCommandHandler,
  ImplementationSubmissionHandler,
  WorkflowCommandService,
} from "#application/index.js";
import { HarnessError, HarnessErrorCode } from "#common/index.js";
import {
  ExclusiveFileLockManager,
  FileParentDirectoryDurability,
  FileActionJournalRepository,
  FileCommandReservationStore,
  FileEvidenceBundleStore,
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
  NodeFileMutationExecutorAdapter,
  NodeGitCheckpointAdapter,
  NodeRepositoryLockAdapter,
  FileActionExecutionLockAdapter,
  NodeCommandRunnerAdapter,
  Rfc8785Sha256DigestAdapter,
  StructuredProjectConfigParserAdapter,
  StaticRepositoryRootResolverAdapter,
  SystemDelayAdapter,
  SystemClock,
  UlidGenerator,
  NodeCodingTaskCellRuntimePathAdapter,
} from "#infrastructure/index.js";
import type { HarnessApplication, HarnessApplicationOptions } from "./compositionRoot.contracts.js";
import {
  createCodingTaskCellApplication,
  createCodingTaskAuthorizationResolver,
  createManagedFileInstallationApplication,
  createUnresolvedProvisionGuard,
  createVerificationExecutor,
  createWorktreeApplication,
} from "./factory/index.js";
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
  const repositoryRootResolver =
    options.repositoryRootResolver ?? new StaticRepositoryRootResolverAdapter();
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
  const codingTaskAuthorizationResolver = createCodingTaskAuthorizationResolver(
    options.codingTaskAuthorizationResolver,
    taskRepository,
    clock,
  );
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
  const unresolvedProvisionGuard = createUnresolvedProvisionGuard(actionJournalRepository, digest);
  const evidenceBundleStore = new FileEvidenceBundleStore(options.storeRoot, {
    lockManager,
    parentDirectoryDurability,
    digest,
  });
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
  const commandRunner = new NodeCommandRunnerAdapter();
  const worktreeInspector = new NodeWorktreeInspectorAdapter(commandRunner);
  const repositoryLock = new NodeRepositoryLockAdapter(
    options.storeRoot,
    lockManager,
    clock,
    repositoryLockIdGenerator,
  );
  const actionExecutionLock = new FileActionExecutionLockAdapter(options.storeRoot, lockManager);
  const journaledActionRunner = new JournaledActionRunner(
    actionJournalRepository,
    clock,
    actionExecutionLock,
  );
  const worktreeApplication = createWorktreeApplication({
    applicationCommandGateway,
    codingTaskRepository,
    codingTaskAuthorizationResolver,
    actionJournalRepository,
    repositoryRootResolver,
    repositoryLock,
    actionExecutionLock,
    journaledActionRunner,
    commandRunner,
    worktreeInspector,
    digest,
    clock,
    unresolvedProvisionGuard,
  });
  // prettier-ignore
  const verificationExecutor = createVerificationExecutor(options.verificationExecutor, options.verificationExecutionMode, commandRunner, clock);
  const verificationRunner = new RunVerificationUseCase(verificationExecutor, digest, clock);
  const runAndPersistVerification = new RunAndPersistVerificationUseCase(
    verificationRunner,
    evidenceBundleStore,
  );
  const codingTaskCommandHandler = new CodingTaskCommandHandler(
    codingTaskRepository,
    clock,
    eventIdGenerator,
    codingTaskAuthorizationResolver,
  );
  const verificationCommandHandler = new VerificationCommandHandler(
    codingTaskRepository,
    codingTaskAuthorizationResolver,
    repositoryLock,
    journaledActionRunner,
    new VerificationActionExecutor(runAndPersistVerification),
    evidenceBundleStore,
    codingTaskCommandHandler,
    digest,
    unresolvedProvisionGuard,
  );
  const implementationCommandHandler = new ImplementationCommandHandler(
    codingTaskRepository,
    codingTaskAuthorizationResolver,
    repositoryLock,
    journaledActionRunner,
    new NodeFileMutationExecutorAdapter(worktreeInspector, digest),
    digest,
    unresolvedProvisionGuard,
  );
  const implementationSubmissionHandler = new ImplementationSubmissionHandler(
    codingTaskRepository,
    codingTaskAuthorizationResolver,
    repositoryRootResolver,
    repositoryLock,
    journaledActionRunner,
    new NodeGitCheckpointAdapter(commandRunner, worktreeInspector, digest),
    codingTaskCommandHandler,
    digest,
    unresolvedProvisionGuard,
  );
  const codingTaskCellApplication = createCodingTaskCellApplication({
    applicationCommandGateway,
    codingTaskCommandHandler,
    worktreeProvisionCommands: worktreeApplication.worktreeProvisionCommands,
    implementationCommandHandler,
    implementationSubmissionHandler,
    verificationCommandHandler,
    evidenceBundleStore,
    codingTaskRepository,
    taskRepository,
    codingTaskAuthorizationResolver,
    digest,
    runtimePath: new NodeCodingTaskCellRuntimePathAdapter(),
    ...(options.codingTaskCellRuntimeBinding === undefined
      ? {}
      : { runtimeBinding: options.codingTaskCellRuntimeBinding }),
  });
  return {
    applicationCommandGateway,
    evidenceBundleStore,
    repositoryRootResolver,
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
      new CodexCapabilityProbeAdapter(commandRunner),
    ),
    // prettier-ignore
    ...createManagedFileInstallationApplication(options, { digest, clock, lockManager, parentDirectoryDurability, repositoryLock }),
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
    selectVerificationPlan: new SelectVerificationPlanUseCase(digest),
    scanProject: new ScanProjectUseCase(projectFileSystem, projectConfigParser, digest),
    workflowCommands: new WorkflowCommandService(
      applicationCommandGateway,
      new RequirementWorkflowCommandHandler(workflowRepository, clock, eventIdGenerator),
    ),
    inspectWorktree: new InspectWorktreeUseCase(worktreeInspector),
    runVerification: verificationRunner,
    runAndPersistVerification,
    acquireRepositoryLock: new AcquireRepositoryLockUseCase(repositoryLock),
    journaledActionRunner,
    ...codingTaskCellApplication,
    ...worktreeApplication,
  };
}
