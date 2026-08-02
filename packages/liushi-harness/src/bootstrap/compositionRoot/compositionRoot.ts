import {
  ApplicationCommandGateway,
  CodingTaskDeliveryCompletionService,
  CompileProjectProfileUseCase,
  CreateTaskUseCase,
  GetTaskStatusUseCase,
  GetTaskTimelineUseCase,
  GetActionJournalUseCase,
  InspectWorktreeUseCase,
  RunVerificationUseCase,
  RunAndPersistVerificationUseCase,
  AcquireRepositoryLockUseCase,
  ListTraceObservationsUseCase,
  ListRecoverableActionsUseCase,
  ProposeArtifactUseCase,
  RecordApprovalUseCase,
  RecordActionIntentUseCase,
  RecordActionObservationUseCase,
  RecordActionResolutionUseCase,
  RecordTraceObservationUseCase,
  ResolveRulesUseCase,
  SelectVerificationPlanUseCase,
  ScanProjectUseCase,
} from "#application/index.js";
import { HarnessError, HarnessErrorCode } from "#common/index.js";
import {
  ExclusiveFileLockManager,
  FileParentDirectoryDurability,
  FileActionJournalRepository,
  FileCommandReservationStore,
  FileEvidenceBundleStore,
  FileTraceObservationStore,
  FileSnapshotStore,
  FileTaskRepository,
  FileCodingTaskRepository,
  NodeProjectFileSystemAdapter,
  NodeWorktreeInspectorAdapter,
  NodeCommandRunnerAdapter,
  Rfc8785Sha256DigestAdapter,
  StructuredProjectConfigParserAdapter,
  StaticRepositoryRootResolverAdapter,
  SystemDelayAdapter,
  SystemClock,
  UlidGenerator,
} from "#infrastructure/index.js";
import type { HarnessApplication, HarnessApplicationOptions } from "./compositionRoot.contracts.js";
import {
  createCodingTaskCellApplication,
  createCodingTaskExecutionApplication,
  createCodingTaskSessionExecutionRuntime,
  createCodingTaskSessionApplication,
  createCodingTaskSessionHookRuntime,
  createCodingTaskAuthorizationResolver,
  createChangeSetCheckpointApplication,
  createExecutorCompatibilityApplication,
  createExecutorCompatibilityAttestationApplication,
  createManagedFileInstallationApplication,
  createRuntimeHealthUseCase,
  createRequirementApplication,
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
  const lockManager = new ExclusiveFileLockManager();
  const parentDirectoryDurability = new FileParentDirectoryDurability();
  const taskRepository = new FileTaskRepository(options.storeRoot, {
    eventIdGenerator,
    snapshotStore: new FileSnapshotStore(),
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
  const digest = new Rfc8785Sha256DigestAdapter();
  const storeDependencies = { digest, lockManager, parentDirectoryDurability };
  const unresolvedProvisionGuard = createUnresolvedProvisionGuard(actionJournalRepository, digest);
  const evidenceBundleStore = new FileEvidenceBundleStore(options.storeRoot, storeDependencies);
  const projectFileSystem = new NodeProjectFileSystemAdapter();
  const projectConfigParser = new StructuredProjectConfigParserAdapter();
  const applicationCommandGateway = new ApplicationCommandGateway(commandReservationStore, delay);
  const commandRunner = new NodeCommandRunnerAdapter();
  const codingTaskSessionHookRuntime = createCodingTaskSessionHookRuntime({
    storeRoot: options.storeRoot,
    storeDependencies,
    applicationCommandGateway,
    taskRepository,
    actionJournalRepository,
    traceObservationStore,
    clock,
    commandRunner,
  });
  const worktreeInspector = new NodeWorktreeInspectorAdapter(commandRunner);
  // prettier-ignore
  const changeSetApplication = createChangeSetCheckpointApplication({ commandRunner, worktreeInspector, digest });
  const {
    repositoryLock,
    actionExecutionLock,
    journaledActionRunner,
    managedWorktreePath,
    closeoutApplication,
  } = createCodingTaskSessionExecutionRuntime({
    storeRoot: options.storeRoot,
    storeDependencies,
    codingTaskRepository,
    hookRuntime: codingTaskSessionHookRuntime,
    actionJournalRepository,
    evidenceBundleStore,
    traceObservationStore,
    repositoryRootResolver,
    changeSetApplication,
    clock,
    repositoryLockIdGenerator,
    applicationCommandGateway,
  });
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
  // prettier-ignore
  const runAndPersistVerification = new RunAndPersistVerificationUseCase(verificationRunner, evidenceBundleStore);
  const codingTaskExecution = createCodingTaskExecutionApplication({
    storeRoot: options.storeRoot,
    storeDependencies,
    applicationCommandGateway,
    codingTaskRepository,
    authorizationResolver: codingTaskAuthorizationResolver,
    repositoryRootResolver,
    repositoryLock,
    journaledActionRunner,
    worktreeInspector,
    evidenceBundleStore,
    runAndPersistVerification,
    unresolvedProvisionGuard,
    changeSetApplication,
    effectiveCloseoutResolver: closeoutApplication.resolveCodingTaskSessionEffectiveCloseout,
    digest,
    clock,
    eventIdGenerator,
  });
  const codingTaskCellApplication = createCodingTaskCellApplication({
    applicationCommandGateway,
    codingTaskCommandHandler: codingTaskExecution.codingTaskCommandHandler,
    worktreeProvisionCommands: worktreeApplication.worktreeProvisionCommands,
    implementationCommandHandler: codingTaskExecution.implementationCommandHandler,
    implementationSubmissionHandler: codingTaskExecution.implementationSubmissionHandler,
    verificationCommandHandler: codingTaskExecution.verificationCommandHandler,
    evidenceBundleStore,
    codingTaskRepository,
    taskRepository,
    codingTaskAuthorizationResolver,
    digest,
    runtimePath: managedWorktreePath,
    ...(options.codingTaskCellRuntimeBinding === undefined
      ? {}
      : { runtimeBinding: options.codingTaskCellRuntimeBinding }),
  });
  const compileProjectProfile = new CompileProjectProfileUseCase(taskRepository, digest);
  const resolveRules = new ResolveRulesUseCase(digest);
  const selectVerificationPlan = new SelectVerificationPlanUseCase(digest);
  const { verificationCompletion, ...publicCodingTaskCellApplication } = codingTaskCellApplication;
  const { closeoutStateReader, ...deliveryApplication } = codingTaskExecution.deliveryApplication;
  const completeCodingTaskSessionDelivery = new CodingTaskDeliveryCompletionService(
    deliveryApplication.submitCodingTaskSessionDelivery,
    codingTaskRepository,
    closeoutStateReader,
    compileProjectProfile,
    resolveRules,
    selectVerificationPlan,
    repositoryRootResolver,
    managedWorktreePath,
    verificationCompletion,
    digest,
  );
  const codingTaskSessionApplication = createCodingTaskSessionApplication({
    codingTaskCommands: codingTaskCellApplication.codingTaskCommands,
    worktreeProvisionCommands: worktreeApplication.worktreeProvisionCommands,
    codingTaskRepository,
    activationRepository: codingTaskSessionHookRuntime.persistence.activationRepository,
    activationLease: codingTaskSessionHookRuntime.persistence.activationLease,
    admissionInitializer: codingTaskSessionHookRuntime.admissionInitializer,
    digest,
    runtimePath: managedWorktreePath,
    ...(options.codingTaskSessionRuntimeBinding === undefined
      ? {}
      : { runtimeBinding: options.codingTaskSessionRuntimeBinding }),
  });
  const requirementApplication = createRequirementApplication({
    storeRoot: options.storeRoot,
    requirementAnalysisAgent: options.requirementAnalysisAgent,
    applicationCommandGateway,
    lockManager,
    parentDirectoryDurability,
    clock,
    eventIdGenerator,
  });
  return {
    applicationCommandGateway,
    evidenceBundleStore,
    repositoryRootResolver,
    checkRuntimeHealth: createRuntimeHealthUseCase(options.storeRoot),
    compileProjectProfile,
    createTask: new CreateTaskUseCase(taskRepository, clock, taskIdGenerator),
    getTaskStatus: new GetTaskStatusUseCase(taskRepository),
    getTaskTimeline: new GetTaskTimelineUseCase(taskRepository),
    ...codingTaskSessionHookRuntime.hookApplication,
    ...createExecutorCompatibilityApplication(options.storeRoot, storeDependencies),
    ...createExecutorCompatibilityAttestationApplication(options, digest),
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
      delay,
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
    resolveRules,
    selectVerificationPlan,
    scanProject: new ScanProjectUseCase(projectFileSystem, projectConfigParser, digest),
    ...requirementApplication,
    inspectWorktree: new InspectWorktreeUseCase(worktreeInspector),
    inspectGitChangeSet: changeSetApplication.inspectGitChangeSet,
    changeSetCheckpoints: changeSetApplication.changeSetCheckpoints,
    ...closeoutApplication,
    ...deliveryApplication,
    completeCodingTaskSessionDelivery,
    runVerification: verificationRunner,
    runAndPersistVerification,
    acquireRepositoryLock: new AcquireRepositoryLockUseCase(repositoryLock),
    journaledActionRunner,
    ...publicCodingTaskCellApplication,
    ...codingTaskSessionApplication,
    recordAgentSessionProcessEvidence:
      codingTaskSessionHookRuntime.recordAgentSessionProcessEvidence,
    ...worktreeApplication,
  };
}
