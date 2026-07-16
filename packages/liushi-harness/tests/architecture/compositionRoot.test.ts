import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import type { RepositoryRootResolverPort } from "../../src/application/ports/index.js";
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
      "ExclusiveFileLockManager",
      "FileActionExecutionLockAdapter",
      "FileActionJournalRepository",
      "FileCodingTaskRepository",
      "FileCommandReservationStore",
      "FileEvidenceBundleStore",
      "FileExecutorCompatibilityEvidenceStore",
      "FileExecutorCompatibilityMatrixStore",
      "FileHookBindingStore",
      "FileInstallPlanStore",
      "FileInstallationRevisionStore",
      "FileParentDirectoryDurability",
      "FileRuntimeHealthAdapter",
      "FileSnapshotStore",
      "FileTaskRepository",
      "FileTraceObservationStore",
      "FileWorkflowRepository",
      "MockVerificationExecutorAdapter",
      "NodeCodingTaskCellRuntimePathAdapter",
      "NodeCommandRunnerAdapter",
      "NodeFileMutationExecutorAdapter",
      "NodeGitCheckpointAdapter",
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

  it("Compile 与 Query 共享同一个 Projection Set Verifier 实例", () => {
    const application = createHarnessApplication({
      storeRoot: resolve(".tmp", "executor-compatibility-verifier-store"),
    });

    expect(Reflect.get(application.compileCodexExecutorCompatibility, "verifier")).toBe(
      Reflect.get(application.queryExecutorCompatibility, "verifier"),
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
});
