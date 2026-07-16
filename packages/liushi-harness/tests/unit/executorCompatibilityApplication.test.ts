import { describe, expect, it } from "vitest";

import {
  CompileCodexExecutorCompatibilityUseCase,
  ExecutorCompatibilityWriteDisposition,
  QueryExecutorCompatibilityUseCase,
  type CodexCompatibilityEvidenceProjectorPort,
  type CodexContractEvidenceProjection,
  type CodexContractEvidenceProjectorPort,
  type ExecutorCompatibilityEvidenceProjection,
  type ExecutorCompatibilityEvidenceProjectionSetVerifierPort,
  type ExecutorCompatibilityEvidenceProjectionVerifierPort,
  type ExecutorCompatibilityEvidenceWriteResult,
  type ExecutorCompatibilityEvidenceStore,
  type ExecutorCompatibilityMatrixRecord,
  type ExecutorCompatibilityMatrixWriteResult,
  type ExecutorCompatibilityMatrixStore,
  type ProjectCodexCompatibilityEvidenceInput,
  type ProjectCodexContractEvidenceInput,
} from "../../src/application/index.js";
import {
  failure,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  success,
  type ContentDigest,
  type Result,
} from "../../src/common/index.js";
import {
  EXECUTOR_CAPABILITY_EVIDENCE_SCHEMA_VERSION,
  ExecutorAdapterKind,
  ExecutorArchitecture,
  ExecutorCapability,
  ExecutorCapabilityQualifierKind,
  ExecutorDistribution,
  ExecutorEvidenceKind,
  ExecutorEvidenceLocatorKind,
  ExecutorEvidenceOutcome,
  ExecutorHostSurface,
  ExecutorOperatingSystem,
  ExecutorSupportLevel,
  compileExecutorCompatibilityMatrix,
  createExecutorCapabilityEvidenceDigestInput,
  createExecutorCompatibilityMatrixDigestInput,
  createExecutorCompatibilityPolicyDigestInput,
  createManagedFileMutationHookPolicy,
  type ExecutorCapabilityEvidence,
  type ExecutorCompatibilityPolicy,
  type ExecutorHostScope,
} from "../../src/domain/executorCompatibility/index.js";
import {
  CodexCompatibilityEvidenceProjectorAdapter,
  Rfc8785Sha256DigestAdapter,
  SchemaRoutedExecutorCompatibilityProjectionSetVerifierAdapter,
} from "../../src/infrastructure/index.js";

const digestAdapter = new Rfc8785Sha256DigestAdapter();
const OBSERVATION_ANCHOR = "2026-07-15T00:00:00.000Z";

describe("Executor Compatibility Application", () => {
  it("现有 Codex Projector Adapter 结构化满足 Application Port", () => {
    const adapter = new CodexCompatibilityEvidenceProjectorAdapter(digestAdapter);
    const projector: CodexCompatibilityEvidenceProjectorPort = adapter;
    const verifier: ExecutorCompatibilityEvidenceProjectionVerifierPort = adapter;

    expect(projector).toBeInstanceOf(CodexCompatibilityEvidenceProjectorAdapter);
    expect(verifier).toBe(projector);
  });

  it("Compile 强制 RuntimeStore Locator 并按 Projection、Matrix 顺序持久化", async () => {
    const events: string[] = [];
    const hostProjection = createHostProjection();
    const contractProjection = createContractProjection(hostProjection);
    const projector = new SpyProjector(success(hostProjection), events);
    const contractProjector = new SpyContractProjector(success(contractProjection), events);
    const evidenceStore = new SpyEvidenceStore(events);
    const matrixStore = new SpyMatrixStore(events);
    const useCase = new CompileCodexExecutorCompatibilityUseCase(
      projector,
      contractProjector,
      projector,
      evidenceStore,
      matrixStore,
      digestAdapter,
    );

    const result = await useCase.execute(createCompileInput());

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) throw result.error;
    expect(projector.inputs).toEqual([
      expect.objectContaining({ artifactLocatorKind: ExecutorEvidenceLocatorKind.RuntimeStore }),
    ]);
    expect(contractProjector.inputs).toEqual([
      {
        scope: hostProjection.evidence[0]?.scope,
        hostArtifactDigest: hostProjection.artifactDigest,
        observationAnchor: OBSERVATION_ANCHOR,
        artifactLocatorKind: ExecutorEvidenceLocatorKind.RuntimeStore,
      },
    ]);
    expect(events).toEqual([
      "project",
      "contract.project",
      "projectionSet.verify",
      "evidence.persist",
      "evidence.persist",
      "matrix.persist",
    ]);
    expect(evidenceStore.persisted).toEqual([hostProjection, contractProjection]);
    expect(matrixStore.persisted[0]).toMatchObject({
      matrix: result.value.matrix,
      policy: createManagedFileMutationHookPolicy(),
    });
    expect(result.value.matrix.evidenceDigests).toHaveLength(12);
    expect(result.value.matrix.supportLevel).toBe(ExecutorSupportLevel.Compatible);
    expect(result.value.evidencePersistences).toEqual([
      createEvidenceWriteResult(hostProjection),
      createEvidenceWriteResult(contractProjection),
    ]);
    expect(result.value.matrixPersistence).toEqual(
      createMatrixWriteResult(result.value.matrix.matrixDigest),
    );
  });

  it("Compile 仅使用 set verifier 返回的 Projection 编译并持久化", async () => {
    const hostProjection = createHostProjection();
    const contractProjection = createContractProjection(hostProjection);
    const verifiedHostProjection: ExecutorCompatibilityEvidenceProjection = {
      ...hostProjection,
      evidence: [...hostProjection.evidence],
    };
    const verifiedContractProjection: ExecutorCompatibilityEvidenceProjection = {
      ...contractProjection,
      evidence: [...contractProjection.evidence],
    };
    const verifier = new SpyProjector();
    verifier.projectionSetResult = success([verifiedHostProjection, verifiedContractProjection]);
    const evidenceStore = new SpyEvidenceStore();
    const useCase = new CompileCodexExecutorCompatibilityUseCase(
      new SpyProjector(success(hostProjection)),
      new SpyContractProjector(success(contractProjection)),
      verifier,
      evidenceStore,
      new SpyMatrixStore(),
      digestAdapter,
    );

    const result = await useCase.execute(createCompileInput());

    expect(result.status).toBe(ResultStatus.Success);
    expect(evidenceStore.persisted[0]).toBe(verifiedHostProjection);
    expect(evidenceStore.persisted[1]).toBe(verifiedContractProjection);
    expect(evidenceStore.persisted[0]).not.toBe(hostProjection);
    expect(evidenceStore.persisted[1]).not.toBe(contractProjection);
  });

  it("Compile 拒绝绑定错误 Host Artifact Digest 的 Contract 且零写入", async () => {
    const hostProjection = createHostProjection();
    const otherHostProjection = {
      ...hostProjection,
      artifactDigest: calculateDigest("other-host-artifact"),
    };
    const contractProjection = createContractProjection(otherHostProjection);
    const hostProjector = new SpyProjector(success(hostProjection));
    const contractProjector = new SpyContractProjector(success(contractProjection));
    const verifier = new SchemaRoutedExecutorCompatibilityProjectionSetVerifierAdapter(
      [
        {
          schemaVersion: "unit-host-artifact.v1",
          exactCount: 1,
          verifier: hostProjector,
        },
        {
          schemaVersion: "unit-contract-artifact.v1",
          exactCount: 1,
          verifier: contractProjector,
        },
      ],
      [
        {
          parentSchemaVersion: "unit-host-artifact.v1",
          dependentSchemaVersion: "unit-contract-artifact.v1",
          dependentArtifactDigestField: "hostArtifactDigest",
          dependentObservationAnchorField: "observationAnchor",
          parentObservationKinds: [
            ExecutorEvidenceKind.SmokeTest,
            ExecutorEvidenceKind.NegativeTest,
          ],
        },
      ],
    );
    const evidenceStore = new SpyEvidenceStore();
    const matrixStore = new SpyMatrixStore();
    const useCase = new CompileCodexExecutorCompatibilityUseCase(
      hostProjector,
      contractProjector,
      verifier,
      evidenceStore,
      matrixStore,
      digestAdapter,
    );

    const result = await useCase.execute(createCompileInput());

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: {
        code: HarnessErrorCode.InvalidInput,
        details: { causeCode: HarnessErrorCode.CorruptStore },
      },
    });
    expect(hostProjector.verifiedProjections).toEqual([hostProjection]);
    expect(contractProjector.verifiedInputs).toEqual([contractProjection]);
    expect(evidenceStore.persisted).toEqual([]);
    expect(matrixStore.persisted).toEqual([]);
  });

  it("Compile 将单条 Failed ContractTest 编译并持久化为 Unsupported Matrix", async () => {
    const events: string[] = [];
    const hostProjection = createHostProjection();
    const contractProjection = replaceEvidence(createContractProjection(hostProjection), 0, {
      outcome: ExecutorEvidenceOutcome.Failed,
    });
    const evidenceStore = new SpyEvidenceStore(events);
    const matrixStore = new SpyMatrixStore(events);
    const useCase = new CompileCodexExecutorCompatibilityUseCase(
      new SpyProjector(success(hostProjection), events),
      new SpyContractProjector(success(contractProjection), events),
      new SpyProjector(undefined, events),
      evidenceStore,
      matrixStore,
      digestAdapter,
    );

    const result = await useCase.execute(createCompileInput());

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) throw result.error;
    expect(result.value.matrix.supportLevel).toBe(ExecutorSupportLevel.Unsupported);
    expect(evidenceStore.persisted).toEqual([hostProjection, contractProjection]);
    expect(matrixStore.persisted).toHaveLength(1);
    expect(events).toEqual([
      "project",
      "contract.project",
      "projectionSet.verify",
      "evidence.persist",
      "evidence.persist",
      "matrix.persist",
    ]);
  });

  it("Compile 在投影失败后停止且透传原错误", async () => {
    const projectionError = new HarnessError(HarnessErrorCode.InvalidInput, "投影失败。");
    const projector = new SpyProjector(failure(projectionError));
    const evidenceStore = new SpyEvidenceStore();
    const matrixStore = new SpyMatrixStore();
    const useCase = new CompileCodexExecutorCompatibilityUseCase(
      projector,
      new SpyContractProjector(),
      new SpyProjector(),
      evidenceStore,
      matrixStore,
      digestAdapter,
    );

    const result = await useCase.execute(createCompileInput());

    expect(result).toEqual(failure(projectionError));
    expect(projector.inputs).toHaveLength(1);
    expect(evidenceStore.persisted).toEqual([]);
    expect(matrixStore.persisted).toEqual([]);
  });

  it("Compile 在 Contract 投影失败后停止且不持久化 Host Projection", async () => {
    const projectionError = new HarnessError(HarnessErrorCode.InvalidInput, "Contract 投影失败。");
    const hostProjection = createHostProjection();
    const evidenceStore = new SpyEvidenceStore();
    const matrixStore = new SpyMatrixStore();
    const useCase = new CompileCodexExecutorCompatibilityUseCase(
      new SpyProjector(success(hostProjection)),
      new SpyContractProjector(failure(projectionError)),
      new SpyProjector(),
      evidenceStore,
      matrixStore,
      digestAdapter,
    );

    const result = await useCase.execute(createCompileInput());

    expect(result).toEqual(failure(projectionError));
    expect(evidenceStore.persisted).toEqual([]);
    expect(matrixStore.persisted).toEqual([]);
  });

  it("Compile 在 Evidence 持久化失败后不写入 Matrix", async () => {
    const persistenceError = new HarnessError(HarnessErrorCode.IoFailure, "Evidence 写入失败。");
    const evidenceStore = new SpyEvidenceStore();
    evidenceStore.persistResult = failure(persistenceError);
    const matrixStore = new SpyMatrixStore();
    const hostProjection = createHostProjection();
    const useCase = new CompileCodexExecutorCompatibilityUseCase(
      new SpyProjector(success(hostProjection)),
      new SpyContractProjector(success(createContractProjection(hostProjection))),
      new SpyProjector(),
      evidenceStore,
      matrixStore,
      digestAdapter,
    );

    const result = await useCase.execute(createCompileInput());

    expect(result).toEqual(failure(persistenceError));
    expect(evidenceStore.persisted).toHaveLength(1);
    expect(matrixStore.persisted).toEqual([]);
  });

  it("Compile 在 Contract Evidence 持久化失败后保留 Host 安全孤儿且不发布 Matrix", async () => {
    const persistenceError = new HarnessError(HarnessErrorCode.IoFailure, "Contract 写入失败。");
    const hostProjection = createHostProjection();
    const contractProjection = createContractProjection(hostProjection);
    const evidenceStore = new SpyEvidenceStore();
    evidenceStore.persistResults.push(
      success(createEvidenceWriteResult(hostProjection)),
      failure(persistenceError),
    );
    const matrixStore = new SpyMatrixStore();
    const useCase = new CompileCodexExecutorCompatibilityUseCase(
      new SpyProjector(success(hostProjection)),
      new SpyContractProjector(success(contractProjection)),
      new SpyProjector(),
      evidenceStore,
      matrixStore,
      digestAdapter,
    );

    const result = await useCase.execute(createCompileInput());

    expect(result).toEqual(failure(persistenceError));
    expect(evidenceStore.persisted).toEqual([hostProjection, contractProjection]);
    expect(matrixStore.persisted).toEqual([]);
  });

  it("Compile 在两项 Projection 完成前拒绝 observedAt 或 Scope 漂移且不持久化", async () => {
    const hostProjection = createHostProjection();
    const driftedHost = replaceEvidence(hostProjection, 1, {
      observedAt: "2026-07-15T00:00:01.000Z",
    });
    const contractProjection = createContractProjection(hostProjection);
    const driftedContract = replaceEvidence(contractProjection, 0, {
      scope: { ...createScope(), architecture: ExecutorArchitecture.Arm64 },
    });

    for (const [host, contract] of [
      [driftedHost, contractProjection],
      [hostProjection, driftedContract],
    ] as const) {
      const evidenceStore = new SpyEvidenceStore();
      const matrixStore = new SpyMatrixStore();
      const useCase = new CompileCodexExecutorCompatibilityUseCase(
        new SpyProjector(success(host)),
        new SpyContractProjector(success(contract)),
        new SpyProjector(),
        evidenceStore,
        matrixStore,
        digestAdapter,
      );

      const result = await useCase.execute(createCompileInput());

      expect(result).toMatchObject({
        status: ResultStatus.Failure,
        error: { code: HarnessErrorCode.InvalidInput },
      });
      expect(evidenceStore.persisted).toEqual([]);
      expect(matrixStore.persisted).toEqual([]);
    }
  });

  it("Compile 在 Matrix 持久化失败时不返回成功声明", async () => {
    const persistenceError = new HarnessError(
      HarnessErrorCode.ExecutorCompatibilityCommitOutcomeUnknown,
      "Matrix 提交结果未知。",
    );
    const matrixStore = new SpyMatrixStore();
    matrixStore.persistResult = failure(persistenceError);
    const hostProjection = createHostProjection();
    const useCase = new CompileCodexExecutorCompatibilityUseCase(
      new SpyProjector(success(hostProjection)),
      new SpyContractProjector(success(createContractProjection(hostProjection))),
      new SpyProjector(),
      new SpyEvidenceStore(),
      matrixStore,
      digestAdapter,
    );

    const result = await useCase.execute(createCompileInput());

    expect(result).toEqual(failure(persistenceError));
    expect(matrixStore.persisted).toHaveLength(1);
  });

  it("Query 在 Policy Gate 拒绝摘要自洽但非源码固定 Policy，且不加载 Projection", async () => {
    const projection = createProjection();
    const policy = createAlternativePolicy();
    const record = createMatrixRecord(projection, policy);
    const trustedPolicy = createManagedFileMutationHookPolicy();
    const projector = new SpyProjector();
    const evidenceStore = new SpyEvidenceStore([], undefined, projection.evidence);
    const useCase = new QueryExecutorCompatibilityUseCase(
      projector,
      evidenceStore,
      new SpyMatrixStore([], record),
      digestAdapter,
    );

    expect(record.policy).toEqual(policy);
    expect(record.policy).not.toEqual(trustedPolicy);
    expect(record.matrix.policyDigest).toBe(
      calculateDigest(createExecutorCompatibilityPolicyDigestInput(policy)),
    );
    expect(record.matrix.matrixDigest).toBe(
      calculateDigest(createExecutorCompatibilityMatrixDigestInput(record.matrix)),
    );

    const result = await useCase.execute(record.matrix.matrixDigest);

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: {
        code: HarnessErrorCode.CorruptStore,
        details: {
          storedPolicyDigest: record.matrix.policyDigest,
          trustedPolicyDigest: calculateDigest(
            createExecutorCompatibilityPolicyDigestInput(trustedPolicy),
          ),
        },
      },
    });
    expect(evidenceStore.projectionLoads).toEqual([]);
    expect(evidenceStore.loaded).toEqual([]);
    expect(projector.verifiedProjections).toEqual([]);
  });

  it("Query 将 Matrix 引用的 Evidence 缺失归类为 CorruptStore", async () => {
    const record = createMatrixRecord();
    const notFound = new HarnessError(
      HarnessErrorCode.ExecutorCompatibilityEvidenceNotFound,
      "Evidence 不存在。",
      { evidenceDigest: record.matrix.evidenceDigests[0]! },
    );
    const evidenceStore = new SpyEvidenceStore();
    evidenceStore.loadFailure = notFound;
    const useCase = new QueryExecutorCompatibilityUseCase(
      new SpyProjector(),
      evidenceStore,
      new SpyMatrixStore([], record),
      digestAdapter,
    );

    const result = await useCase.execute(record.matrix.matrixDigest);

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: {
        code: HarnessErrorCode.CorruptStore,
        details: { evidenceDigest: record.matrix.evidenceDigests[0] },
      },
    });
    expect(evidenceStore.loaded).toEqual(record.matrix.evidenceDigests);
  });

  it("Query 通过完整内容比对拒绝 Matrix 内容篡改", async () => {
    const record = createMatrixRecord();
    const tamperedRecord: ExecutorCompatibilityMatrixRecord = {
      ...record,
      matrix: { ...record.matrix, supportLevel: ExecutorSupportLevel.Unsupported },
    };
    const useCase = new QueryExecutorCompatibilityUseCase(
      new SpyProjector(),
      new SpyEvidenceStore([], undefined, recordEvidence(record)),
      new SpyMatrixStore([], tamperedRecord),
      digestAdapter,
    );

    const result = await useCase.execute(record.matrix.matrixDigest);

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.CorruptStore },
    });
  });

  it("Query 将 Evidence 摘要不一致的重编译失败归类为 CorruptStore", async () => {
    const projection = createProjection();
    const record = createMatrixRecord(projection);
    const original = projection.evidence[0];
    if (original === undefined) throw new Error("测试 Evidence 缺失。");
    const tamperedEvidence = { ...original, outcome: ExecutorEvidenceOutcome.Failed };
    const useCase = new QueryExecutorCompatibilityUseCase(
      new SpyProjector(),
      new SpyEvidenceStore([], undefined, [tamperedEvidence]),
      new SpyMatrixStore([], record),
      digestAdapter,
    );

    const result = await useCase.execute(record.matrix.matrixDigest);

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.CorruptStore },
    });
  });

  it("Query 成功返回本次重编译 Matrix 与 recomputed 标记", async () => {
    const projection = createProjection();
    const record = createMatrixRecord(projection);
    const evidenceStore = new SpyEvidenceStore([], undefined, projection.evidence);
    const useCase = new QueryExecutorCompatibilityUseCase(
      new SpyProjector(),
      evidenceStore,
      new SpyMatrixStore([], record),
      digestAdapter,
    );

    const result = await useCase.execute(record.matrix.matrixDigest);

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) throw result.error;
    expect(result.value).toEqual({ matrix: record.matrix, recomputed: true });
    expect(result.value.matrix).not.toBe(record.matrix);
    expect(evidenceStore.loaded).toEqual(record.matrix.evidenceDigests);
    expect(evidenceStore.projectionLoads).toEqual([record.matrix.evidenceDigests]);
  });

  it("Query 一次集合复验两个独立 Artifact，并合并全部 Evidence 重编译", async () => {
    const projections = [createProjection("artifact-a"), createProjection("artifact-b")];
    const record = createMatrixRecordFromProjections(projections);
    const evidenceStore = new SpyEvidenceStore(
      [],
      undefined,
      projections.flatMap((projection) => projection.evidence),
    );
    const verifier = new SpyProjector();
    const useCase = new QueryExecutorCompatibilityUseCase(
      verifier,
      evidenceStore,
      new SpyMatrixStore([], record),
      digestAdapter,
    );

    const result = await useCase.execute(record.matrix.matrixDigest);

    expect(result).toEqual({
      status: ResultStatus.Success,
      value: { matrix: record.matrix, recomputed: true },
    });
    expect(verifier.verifiedProjections.map((projection) => projection.artifactDigest)).toEqual(
      projections.map((projection) => projection.artifactDigest).sort(),
    );
    expect(verifier.verifiedProjections.flatMap((projection) => projection.evidence)).toHaveLength(
      2,
    );
    expect(verifier.verificationSetCalls).toBe(1);
  });

  it("Query 将任一来源的复验失败收敛为不泄漏 Artifact 的 CorruptStore", async () => {
    const projections = [
      createProjection("private-artifact-a"),
      createProjection("private-artifact-b"),
    ];
    const orderedProjections = [...projections].sort((left, right) =>
      left.artifactDigest.localeCompare(right.artifactDigest),
    );
    const failedProjection = orderedProjections[1];
    if (failedProjection === undefined) throw new Error("测试 Projection 缺失。");
    const record = createMatrixRecordFromProjections(projections);
    const verifier = new SpyProjector();
    verifier.verificationFailure = {
      artifactDigest: failedProjection.artifactDigest,
      error: new HarnessError(HarnessErrorCode.InvalidInput, "复验失败。", {
        artifact: JSON.stringify(failedProjection.artifact),
      }),
    };
    const useCase = new QueryExecutorCompatibilityUseCase(
      verifier,
      new SpyEvidenceStore(
        [],
        undefined,
        projections.flatMap((projection) => projection.evidence),
      ),
      new SpyMatrixStore([], record),
      digestAdapter,
    );

    const result = await useCase.execute(record.matrix.matrixDigest);

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: {
        code: HarnessErrorCode.CorruptStore,
        details: {
          requestedMatrixDigest: record.matrix.matrixDigest,
          causeCode: HarnessErrorCode.InvalidInput,
        },
      },
    });
    if (result.status === ResultStatus.Success) throw new Error("预期 Query 失败。");
    expect(result.error.details).not.toHaveProperty("artifact");
    expect(verifier.verifiedProjections).toHaveLength(2);
  });
});

class SpyProjector
  implements
    CodexCompatibilityEvidenceProjectorPort,
    ExecutorCompatibilityEvidenceProjectionSetVerifierPort,
    ExecutorCompatibilityEvidenceProjectionVerifierPort
{
  public readonly inputs: ProjectCodexCompatibilityEvidenceInput[] = [];
  public readonly verifiedProjections: ExecutorCompatibilityEvidenceProjection[] = [];
  public verificationFailure:
    { readonly artifactDigest: ContentDigest; readonly error: HarnessError } | undefined;
  public projectionSetResult:
    Result<readonly ExecutorCompatibilityEvidenceProjection[], HarnessError> | undefined;
  public verificationSetCalls = 0;

  public constructor(
    private readonly result: Result<
      ExecutorCompatibilityEvidenceProjection,
      HarnessError
    > = success(createProjection()),
    private readonly events: string[] = [],
  ) {}

  public project(
    input: ProjectCodexCompatibilityEvidenceInput,
  ): Result<ExecutorCompatibilityEvidenceProjection, HarnessError> {
    this.events.push("project");
    this.inputs.push(input);
    return this.result;
  }

  public verifyPersistedProjection(
    projection: ExecutorCompatibilityEvidenceProjection,
  ): Result<ExecutorCompatibilityEvidenceProjection, HarnessError> {
    this.events.push("project.verify");
    this.verifiedProjections.push(projection);
    if (this.verificationFailure?.artifactDigest === projection.artifactDigest) {
      return failure(this.verificationFailure.error);
    }
    return success(projection);
  }

  public verifyPersistedProjectionSet(
    projections: readonly ExecutorCompatibilityEvidenceProjection[],
  ): Result<readonly ExecutorCompatibilityEvidenceProjection[], HarnessError> {
    this.events.push("projectionSet.verify");
    this.verificationSetCalls += 1;
    this.verifiedProjections.push(...projections);
    if (this.projectionSetResult !== undefined) return this.projectionSetResult;
    const failed = projections.find(
      (projection) => this.verificationFailure?.artifactDigest === projection.artifactDigest,
    );
    return failed === undefined || this.verificationFailure === undefined
      ? success(projections)
      : failure(this.verificationFailure.error);
  }
}

class SpyContractProjector implements CodexContractEvidenceProjectorPort {
  public readonly verifiedInputs: ExecutorCompatibilityEvidenceProjection[] = [];
  public readonly inputs: ProjectCodexContractEvidenceInput[] = [];

  public constructor(
    private readonly result: Result<CodexContractEvidenceProjection, HarnessError> = success(
      createContractProjection(createHostProjection()),
    ),
    private readonly events: string[] = [],
  ) {}

  public project(
    input: ProjectCodexContractEvidenceInput,
  ): Promise<Result<CodexContractEvidenceProjection, HarnessError>> {
    this.events.push("contract.project");
    this.inputs.push(input);
    return Promise.resolve(this.result);
  }

  public verifyPersistedProjection(
    projection: ExecutorCompatibilityEvidenceProjection,
  ): Result<CodexContractEvidenceProjection, HarnessError> {
    this.verifiedInputs.push(projection);
    return this.result;
  }
}

class SpyEvidenceStore implements ExecutorCompatibilityEvidenceStore {
  public readonly persisted: ExecutorCompatibilityEvidenceProjection[] = [];
  public readonly loaded: ContentDigest[] = [];
  public readonly projectionLoads: ContentDigest[][] = [];
  public persistResult: Result<ExecutorCompatibilityEvidenceWriteResult, HarnessError> | undefined;
  public readonly persistResults: Array<
    Result<ExecutorCompatibilityEvidenceWriteResult, HarnessError>
  > = [];
  public loadFailure: HarnessError | undefined;
  private readonly evidenceByDigest: ReadonlyMap<ContentDigest, ExecutorCapabilityEvidence>;

  public constructor(
    private readonly events: string[] = [],
    loadFailure?: HarnessError,
    evidence: readonly ExecutorCapabilityEvidence[] = [],
  ) {
    this.loadFailure = loadFailure;
    this.evidenceByDigest = new Map(evidence.map((item) => [item.evidenceDigest, item]));
  }

  public persist(
    projection: ExecutorCompatibilityEvidenceProjection,
  ): Promise<Result<ExecutorCompatibilityEvidenceWriteResult, HarnessError>> {
    this.events.push("evidence.persist");
    this.persisted.push(projection);
    return Promise.resolve(
      this.persistResults.shift() ??
        this.persistResult ??
        success(createEvidenceWriteResult(projection)),
    );
  }

  public load(
    evidenceDigest: ContentDigest,
  ): Promise<Result<ExecutorCapabilityEvidence, HarnessError>> {
    this.events.push("evidence.load");
    this.loaded.push(evidenceDigest);
    if (this.loadFailure !== undefined) return Promise.resolve(failure(this.loadFailure));
    const evidence = this.evidenceByDigest.get(evidenceDigest);
    return Promise.resolve(
      evidence === undefined
        ? failure(
            new HarnessError(
              HarnessErrorCode.ExecutorCompatibilityEvidenceNotFound,
              "Evidence 不存在。",
            ),
          )
        : success(evidence),
    );
  }

  public async loadProjections(
    evidenceDigests: readonly ContentDigest[],
  ): Promise<Result<readonly ExecutorCompatibilityEvidenceProjection[], HarnessError>> {
    this.projectionLoads.push([...evidenceDigests]);
    const evidence: ExecutorCapabilityEvidence[] = [];
    for (const evidenceDigest of evidenceDigests) {
      const loaded = await this.load(evidenceDigest);
      if (loaded.status === ResultStatus.Failure) return loaded;
      evidence.push(loaded.value);
    }
    if (evidence.length === 0) {
      return failure(new HarnessError(HarnessErrorCode.CorruptStore, "Projection 集合为空。"));
    }
    const groups = new Map<ContentDigest, ExecutorCapabilityEvidence[]>();
    for (const item of evidence) {
      const group = groups.get(item.source.artifactDigest);
      if (group === undefined) groups.set(item.source.artifactDigest, [item]);
      else group.push(item);
    }
    return success(
      [...groups.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([artifactDigest, groupedEvidence]) => ({
          artifact: { kind: "spy-artifact", artifactDigest },
          artifactDigest,
          evidence: groupedEvidence,
        })),
    );
  }
}

class SpyMatrixStore implements ExecutorCompatibilityMatrixStore {
  public readonly persisted: ExecutorCompatibilityMatrixRecord[] = [];
  public readonly loaded: ContentDigest[] = [];
  public persistResult: Result<ExecutorCompatibilityMatrixWriteResult, HarnessError> | undefined;

  public constructor(
    private readonly events: string[] = [],
    private readonly record?: ExecutorCompatibilityMatrixRecord,
  ) {}

  public persist(
    record: ExecutorCompatibilityMatrixRecord,
  ): Promise<Result<ExecutorCompatibilityMatrixWriteResult, HarnessError>> {
    this.events.push("matrix.persist");
    this.persisted.push(record);
    return Promise.resolve(
      this.persistResult ?? success(createMatrixWriteResult(record.matrix.matrixDigest)),
    );
  }

  public load(
    matrixDigest: ContentDigest,
  ): Promise<Result<ExecutorCompatibilityMatrixRecord, HarnessError>> {
    this.events.push("matrix.load");
    this.loaded.push(matrixDigest);
    return Promise.resolve(
      this.record === undefined
        ? failure(
            new HarnessError(
              HarnessErrorCode.ExecutorCompatibilityMatrixNotFound,
              "Matrix 不存在。",
            ),
          )
        : success(this.record),
    );
  }
}

function createCompileInput() {
  return {
    prepareManifest: { kind: "prepare" },
    activationPlan: { kind: "activation" },
    hostResult: { kind: "result" },
  };
}

function createProjection(
  artifactKind = "redacted-codex-artifact",
): ExecutorCompatibilityEvidenceProjection {
  return createProjectionWithEvidence(
    { kind: artifactKind },
    [
      {
        capability: ExecutorCapability.CommandHookHandler,
        kind: ExecutorEvidenceKind.StaticProbe,
      },
    ],
    "unit-artifact.v1",
  );
}

function createHostProjection(): ExecutorCompatibilityEvidenceProjection {
  return createProjectionWithEvidence(
    { schemaVersion: "unit-host-artifact.v1", kind: "host" },
    [
      {
        capability: ExecutorCapability.CommandHookHandler,
        kind: ExecutorEvidenceKind.StaticProbe,
      },
      {
        capability: ExecutorCapability.CommandHookHandler,
        kind: ExecutorEvidenceKind.SmokeTest,
      },
      {
        capability: ExecutorCapability.NativeHookInput,
        kind: ExecutorEvidenceKind.SmokeTest,
      },
      {
        capability: ExecutorCapability.PreFileMutation,
        kind: ExecutorEvidenceKind.SmokeTest,
      },
      {
        capability: ExecutorCapability.PostFileMutation,
        kind: ExecutorEvidenceKind.SmokeTest,
      },
      {
        capability: ExecutorCapability.PreFileMutation,
        kind: ExecutorEvidenceKind.NegativeTest,
      },
      {
        capability: ExecutorCapability.DenyFileMutation,
        kind: ExecutorEvidenceKind.NegativeTest,
      },
    ],
    "unit-host-artifact.v1",
  );
}

function createContractProjection(
  hostProjection: ExecutorCompatibilityEvidenceProjection,
): CodexContractEvidenceProjection {
  return createProjectionWithEvidence(
    {
      schemaVersion: "unit-contract-artifact.v1",
      kind: "contract",
      hostArtifactDigest: hostProjection.artifactDigest,
      observationAnchor: OBSERVATION_ANCHOR,
    },
    [
      {
        capability: ExecutorCapability.CommandHookHandler,
        kind: ExecutorEvidenceKind.ContractTest,
      },
      {
        capability: ExecutorCapability.NativeHookInput,
        kind: ExecutorEvidenceKind.ContractTest,
      },
      {
        capability: ExecutorCapability.PreFileMutation,
        kind: ExecutorEvidenceKind.ContractTest,
      },
      {
        capability: ExecutorCapability.PostFileMutation,
        kind: ExecutorEvidenceKind.ContractTest,
      },
      {
        capability: ExecutorCapability.DenyFileMutation,
        kind: ExecutorEvidenceKind.ContractTest,
      },
    ],
    "unit-contract-artifact.v1",
  );
}

function createProjectionWithEvidence(
  artifact: Readonly<Record<string, unknown>>,
  definitions: readonly {
    readonly capability: ExecutorCapability;
    readonly kind: ExecutorEvidenceKind;
  }[],
  sourceSchemaVersion: string,
): ExecutorCompatibilityEvidenceProjection {
  const artifactDigest = calculateDigest(artifact);
  const scope = createScope();
  return {
    artifact,
    artifactDigest,
    evidence: definitions.map((definition) =>
      createEvidence(
        artifactDigest,
        scope,
        definition.capability,
        definition.kind,
        sourceSchemaVersion,
      ),
    ),
  };
}

function createEvidence(
  artifactDigest: ContentDigest,
  scope: ExecutorHostScope,
  capability: ExecutorCapability,
  kind: ExecutorEvidenceKind,
  sourceSchemaVersion: string,
): ExecutorCapabilityEvidence {
  const withoutDigest: Omit<ExecutorCapabilityEvidence, "evidenceDigest"> = {
    schemaVersion: EXECUTOR_CAPABILITY_EVIDENCE_SCHEMA_VERSION,
    scope,
    capability,
    kind,
    outcome: ExecutorEvidenceOutcome.Passed,
    qualifiers: [
      {
        kind: ExecutorCapabilityQualifierKind.CanonicalAction,
        value: "file_mutation",
      },
    ],
    source: {
      artifactDigest,
      locator: {
        kind: ExecutorEvidenceLocatorKind.RuntimeStore,
        value: `executorCompatibility/unit/${artifactDigest.slice("sha256:".length)}.json`,
      },
      schemaVersion: sourceSchemaVersion,
      checkIds: [`${capability}.${kind}`],
      observedAt: OBSERVATION_ANCHOR,
    },
  };
  return {
    ...withoutDigest,
    evidenceDigest: calculateDigest(createExecutorCapabilityEvidenceDigestInput(withoutDigest)),
  };
}

function replaceEvidence(
  projection: ExecutorCompatibilityEvidenceProjection,
  index: number,
  replacement: {
    readonly observedAt?: string;
    readonly outcome?: ExecutorEvidenceOutcome;
    readonly scope?: ExecutorHostScope;
  },
): ExecutorCompatibilityEvidenceProjection {
  const original = projection.evidence[index];
  if (original === undefined) throw new Error("测试 Projection Evidence 缺失。");
  const withoutDigest: Omit<ExecutorCapabilityEvidence, "evidenceDigest"> = {
    ...original,
    outcome: replacement.outcome ?? original.outcome,
    scope: replacement.scope ?? original.scope,
    source: {
      ...original.source,
      observedAt: replacement.observedAt ?? original.source.observedAt,
    },
  };
  const evidence = [...projection.evidence];
  evidence[index] = {
    ...withoutDigest,
    evidenceDigest: calculateDigest(createExecutorCapabilityEvidenceDigestInput(withoutDigest)),
  };
  return { ...projection, evidence };
}

function createScope(): ExecutorHostScope {
  return {
    adapterKind: ExecutorAdapterKind.Codex,
    distribution: ExecutorDistribution.CodexCli,
    adapterDigest: calculateDigest({ adapter: "codex" }),
    executorVersion: "0.144.0-alpha.4",
    surface: ExecutorHostSurface.InteractiveTui,
    operatingSystem: ExecutorOperatingSystem.Windows,
    architecture: ExecutorArchitecture.X64,
    configurationDigest: calculateDigest({ hooks: "managed-file-mutation" }),
  };
}

function createMatrixRecord(
  projection: ExecutorCompatibilityEvidenceProjection = createProjection(),
  policy: ExecutorCompatibilityPolicy = createManagedFileMutationHookPolicy(),
): ExecutorCompatibilityMatrixRecord {
  return createMatrixRecordFromProjections([projection], policy);
}

function createMatrixRecordFromProjections(
  projections: readonly ExecutorCompatibilityEvidenceProjection[],
  policy: ExecutorCompatibilityPolicy = createManagedFileMutationHookPolicy(),
): ExecutorCompatibilityMatrixRecord {
  const evidence = projections.flatMap((projection) => projection.evidence);
  const firstEvidence = evidence[0];
  if (firstEvidence === undefined) throw new Error("测试 Evidence 缺失。");
  const compiled = compileExecutorCompatibilityMatrix(
    { scope: firstEvidence.scope, policy, evidence },
    digestAdapter,
  );
  if (compiled.status === ResultStatus.Failure) throw compiled.error;
  return { matrix: compiled.value, policy };
}

function createAlternativePolicy(): ExecutorCompatibilityPolicy {
  const policy = createManagedFileMutationHookPolicy();
  return { ...policy, policyId: `${policy.policyId}.alternate` };
}

function recordEvidence(
  record: ExecutorCompatibilityMatrixRecord,
): readonly ExecutorCapabilityEvidence[] {
  const projection = createProjection();
  return projection.evidence.filter((item) =>
    record.matrix.evidenceDigests.includes(item.evidenceDigest),
  );
}

function createEvidenceWriteResult(
  projection: ExecutorCompatibilityEvidenceProjection,
): ExecutorCompatibilityEvidenceWriteResult {
  return {
    disposition: ExecutorCompatibilityWriteDisposition.Persisted,
    artifactDigest: projection.artifactDigest,
    evidenceDigests: projection.evidence.map((item) => item.evidenceDigest),
  };
}

function createMatrixWriteResult(
  matrixDigest: ContentDigest,
): ExecutorCompatibilityMatrixWriteResult {
  return {
    disposition: ExecutorCompatibilityWriteDisposition.Persisted,
    matrixDigest,
  };
}

function calculateDigest(input: unknown): ContentDigest {
  const result = digestAdapter.calculate(input);
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}
