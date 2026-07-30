import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import type {
  ExecutorCompatibilityAttestationVerifierPort,
  RepositoryRootResolverPort,
} from "../../src/application/ports/index.js";
import { createHarnessApplication } from "../../src/bootstrap/index.js";
import { HarnessErrorCode, ResultStatus, success } from "../../src/common/index.js";

import {
  ArchitectureLayer,
  collectExportedConcreteAdapterClassNames,
  collectNewExpressionNames,
  createSourceGraph,
  formatRelative,
  getLayer,
} from "./support/index.js";

describe("composition root", () => {
  it("constructs concrete adapters only from bootstrap", () => {
    const graph = createSourceGraph();
    const concreteAdapterClassNames = collectExportedConcreteAdapterClassNames(graph);
    const violations = graph.sourceFiles.flatMap((sourceFile) => {
      if (getLayer(graph, sourceFile.fileName) === ArchitectureLayer.Bootstrap) {
        return [];
      }

      return collectNewExpressionNames(sourceFile)
        .filter((expression) => concreteAdapterClassNames.has(expression.className))
        .map(
          (expression) =>
            `${formatRelative(graph, sourceFile.fileName)} constructs ${expression.className} at ${expression.location}`,
        );
    });

    expect([...concreteAdapterClassNames].sort()).toEqual([
      "CodexCapabilityProbeAdapter",
      "CodexHookAdapter",
      "CodexInstallProfileProjectorAdapter",
      "EnterpriseHttpsExecutorCompatibilityReleaseApprovalAuthorityAdapter",
      "ExclusiveFileLockManager",
      "FileActionExecutionLockAdapter",
      "FileActionJournalRepository",
      "FileAgentSessionProcessEvidenceStore",
      "FileCodingTaskRepository",
      "FileCodingTaskSessionActivationLease",
      "FileCodingTaskSessionActivationRepository",
      "FileCodingTaskSessionAdmissionLease",
      "FileCodingTaskSessionAdmissionStateStore",
      "FileCodingTaskSessionCloseoutRecoveryStore",
      "FileCodingTaskSessionCloseoutStore",
      "FileCommandReservationStore",
      "FileEvidenceBundleStore",
      "FileExecutorCompatibilityEvidenceStore",
      "FileExecutorCompatibilityMatrixStore",
      "FileHookBindingStore",
      "FileInstallPlanStore",
      "FileInstallationRevisionStore",
      "FileParentDirectoryDurability",
      "FilePilotMetricsStore",
      "FileRuntimeHealthAdapter",
      "FileSnapshotStore",
      "FileTaskRepository",
      "FileTraceObservationStore",
      "FileWorkflowRepository",
      "MockVerificationExecutorAdapter",
      "NodeCodingTaskCellRuntimePathAdapter",
      "NodeCommandRunnerAdapter",
      "NodeExecutorCompatibilityPublicationWriterAdapter",
      "NodeExecutorCompatibilityReleaseDraftReaderAdapter",
      "NodeExecutorCompatibilitySignedAttestationArtifactReaderAdapter",
      "NodeExecutorCompatibilitySignedAttestationArtifactWriterAdapter",
      "NodeExecutorCompatibilitySignedManifestArtifactReaderAdapter",
      "NodeExecutorCompatibilitySignedManifestArtifactWriterAdapter",
      "NodeFileMutationExecutorAdapter",
      "NodeGitChangeSetInspectorAdapter",
      "NodeGitCheckpointAdapter",
      "NodeGitCommittedChangeSetInspectorAdapter",
      "NodeHookInputReaderAdapter",
      "NodeJsonDocumentReaderAdapter",
      "NodeManagedFileMutationAdapter",
      "NodeManagedFileStateReaderAdapter",
      "NodeProjectFileSystemAdapter",
      "NodeRepositoryLockAdapter",
      "NodeVerificationExecutorAdapter",
      "NodeWorktreeInspectorAdapter",
      "NodeWorktreeProvisionRecoveryInspectorAdapter",
      "NodeWorktreeProvisionerAdapter",
      "Rfc8785Sha256DigestAdapter",
      "SchemaRoutedExecutorCompatibilityProjectionSetVerifierAdapter",
      "SigstoreExecutorCompatibilityAttestationSignerAdapter",
      "SigstoreExecutorCompatibilityAttestationVerifierAdapter",
      "StaticRepositoryRootResolverAdapter",
      "StructuredProjectConfigParserAdapter",
      "SystemClock",
      "SystemDelayAdapter",
      "UlidGenerator",
    ]);
    expect(violations).toEqual([]);
  });

  it("仅由 composition root 装配 Project Profile 编译 Use Case", () => {
    const graph = createSourceGraph();
    const owners = graph.sourceFiles.flatMap((sourceFile) =>
      collectNewExpressionNames(sourceFile)
        .filter((expression) => expression.className === "CompileProjectProfileUseCase")
        .map(() => formatRelative(graph, sourceFile.fileName).replaceAll("\\", "/")),
    );

    expect(owners).toEqual(["src/bootstrap/compositionRoot/compositionRoot.ts"]);
  });

  it("默认装配无绑定的 fail-closed Repository Root Resolver", async () => {
    const application = createHarnessApplication({ storeRoot: resolve(".tmp", "store") });

    const result = await application.repositoryRootResolver.resolve({
      workspaceId: "workspace-a",
      repositoryId: "repository-a",
    });

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.code).toBe(HarnessErrorCode.OperationForbidden);
    }
  });

  it("Compile、Query、Bundle 创建与原子发布共享同一条受信重建链", () => {
    const application = createHarnessApplication({
      storeRoot: resolve(".tmp", "executor-compatibility-verifier-store"),
    });

    expect(Reflect.get(application.compileCodexExecutorCompatibility, "verifier")).toBe(
      Reflect.get(application.queryExecutorCompatibility, "verifier"),
    );
    expect(Reflect.get(application.compileCodexExecutorCompatibility, "verifier")).toBe(
      Reflect.get(application.createExecutorCompatibilityPublicationBundle, "verifier"),
    );
    expect(
      Reflect.get(application.publishExecutorCompatibilityPublicationBundle, "bundleCreator"),
    ).toBe(application.createExecutorCompatibilityPublicationBundle);
  });

  it("公开 Closeout Recovery Assessment 并复用 Closeout State Store", () => {
    const application = createHarnessApplication({
      storeRoot: resolve(".tmp", "closeout-recovery-assessment-store"),
    });
    const assessmentService = requireObject(
      readHiddenProperty(application.assessCodingTaskSessionCloseoutRecovery, "service"),
    );
    const assessmentDependencies = requireObject(
      readHiddenProperty(assessmentService, "dependencies"),
    );
    const closeoutDependencies = requireObject(
      readHiddenProperty(application.closeoutCodingTaskSession, "dependencies"),
    );
    const recoveryHandler = requireObject(
      readHiddenProperty(application.recoverCodingTaskSessionCloseout, "handler"),
    );
    const recoveryHandlerDependencies = requireObject(
      readHiddenProperty(recoveryHandler, "dependencies"),
    );
    const effectiveCloseoutDependencies = requireObject(
      readHiddenProperty(application.resolveCodingTaskSessionEffectiveCloseout, "dependencies"),
    );

    expect(application.assessCodingTaskSessionCloseoutRecovery).toBeDefined();
    expect(application.recoverCodingTaskSessionCloseout).toBeDefined();
    expect(application.resolveCodingTaskSessionEffectiveCloseout).toBeDefined();
    expect(readHiddenProperty(closeoutDependencies, "checkpointPort")).toBe(
      application.changeSetCheckpoints,
    );
    expect(readHiddenProperty(assessmentDependencies, "stateStore")).toBe(
      readHiddenProperty(closeoutDependencies, "stateStore"),
    );
    expect(readHiddenProperty(effectiveCloseoutDependencies, "closeoutStateStore")).toBe(
      readHiddenProperty(closeoutDependencies, "stateStore"),
    );
    expect(readHiddenProperty(recoveryHandlerDependencies, "recoveryStateStore")).toBe(
      readHiddenProperty(effectiveCloseoutDependencies, "recoveryStateStore"),
    );
    expect(readHiddenProperty(application.recoverCodingTaskSessionCloseout, "gateway")).toBe(
      application.applicationCommandGateway,
    );
    expect(readHiddenProperty(recoveryHandlerDependencies, "assessmentService")).toBe(
      assessmentService,
    );
  });

  it("Session Delivery 复用 Effective Resolver、Checkpoint Port 与 Command Gateway", () => {
    const application = createHarnessApplication({
      storeRoot: resolve(".tmp", "session-delivery-composition-store"),
    });
    const service = requireObject(application.submitCodingTaskSessionDelivery);
    const handler = requireObject(readHiddenProperty(service, "handler"));
    const dependencies = requireObject(readHiddenProperty(handler, "dependencies"));

    expect(readHiddenProperty(service, "gateway")).toBe(application.applicationCommandGateway);
    expect(readHiddenProperty(dependencies, "effectiveCloseoutResolver")).toBe(
      application.resolveCodingTaskSessionEffectiveCloseout,
    );
    expect(readHiddenProperty(dependencies, "checkpointInspector")).toBe(
      application.changeSetCheckpoints,
    );
    const implementationHandler = requireObject(
      readHiddenProperty(application.implementationSubmissions, "handler"),
    );
    expect(readHiddenProperty(dependencies, "unresolvedProvisionGuard")).toBe(
      readHiddenProperty(implementationHandler, "unresolvedProvisionGuard"),
    );
  });

  it("保留调用方注入的 Repository Root Resolver", () => {
    const repositoryRootResolver: RepositoryRootResolverPort = {
      resolve: () => Promise.resolve(success({ repositoryRoot: resolve("repository") })),
    };

    const application = createHarnessApplication({
      storeRoot: resolve(".tmp", "store"),
      repositoryRootResolver,
    });

    expect(application.repositoryRootResolver).toBe(repositoryRootResolver);
  });

  it("公共 Application 只保留调用方注入的离线 Verifier", () => {
    const verifier: ExecutorCompatibilityAttestationVerifierPort = {
      verify: () => {
        throw new Error("测试不应调用 Attestation Verifier。");
      },
    };
    const application = createHarnessApplication({
      storeRoot: resolve(".tmp", "attestation-composition-root"),
      executorCompatibilityAttestationVerifier: verifier,
    });

    expect(Reflect.get(application.verifyExecutorCompatibilityReleaseAttestation, "verifier")).toBe(
      verifier,
    );
    expect(Reflect.get(application.verifyExecutorCompatibilityReleaseManifest, "verifier")).toBe(
      verifier,
    );
    expect("signExecutorCompatibilityReleaseAttestation" in application).toBe(false);
    expect("signExecutorCompatibilityReleaseManifest" in application).toBe(false);
  });
});

function readHiddenProperty(target: object, property: string): unknown {
  return Reflect.get(target, property) as unknown;
}

function requireObject(value: unknown): object {
  if (typeof value !== "object" || value === null) {
    throw new Error("Composition Root 私有依赖必须是对象。");
  }
  return value;
}
