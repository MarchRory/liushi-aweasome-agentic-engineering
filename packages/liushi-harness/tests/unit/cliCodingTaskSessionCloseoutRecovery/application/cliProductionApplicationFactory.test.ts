import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import type { RepositoryRootResolverPort } from "../../../../src/application/index.js";
import { createProductionCliApplicationFactory } from "../../../../src/bootstrap/cli/index.js";
import { ResultStatus } from "../../../../src/common/index.js";
import {
  CliApplicationBindingScope,
  CliVerificationMode,
  type CliApplication,
  type CliRepositoryBinding,
} from "../../../../src/presentation/index.js";

const repositoryBinding: CliRepositoryBinding = {
  workspaceId: "workspace-1",
  repositoryId: "repository-1",
  repositoryRoot: resolve("repository"),
};

describe("Production CLI Application Factory", () => {
  it("Repository scope 只安装 Root Resolver", async () => {
    const application = createProductionCliApplicationFactory().create(resolve(".tmp", "store"), {
      scope: CliApplicationBindingScope.Repository,
      repositoryBinding,
    });

    await expectRepositoryBinding(application);
    expect(readHiddenProperty(application.runCodingTaskCell, "runtimeBinding")).toBeUndefined();
    expect(
      readHiddenProperty(application.activateCodingTaskSession, "runtimeBinding"),
    ).toBeUndefined();
  });

  it("CodingTask Cell scope 只安装 Cell Runtime Binding", async () => {
    const application = createProductionCliApplicationFactory().create(resolve(".tmp", "store"), {
      scope: CliApplicationBindingScope.CodingTaskCell,
      repositoryBinding,
      verificationMode: CliVerificationMode.FailClosedMock,
    });

    await expectRepositoryBinding(application);
    expect(readHiddenProperty(application.runCodingTaskCell, "runtimeBinding")).toEqual(
      repositoryBinding,
    );
    expect(
      readHiddenProperty(application.activateCodingTaskSession, "runtimeBinding"),
    ).toBeUndefined();
  });

  it("CodingTask Session scope 只安装 Session Runtime Binding", async () => {
    const application = createProductionCliApplicationFactory().create(resolve(".tmp", "store"), {
      scope: CliApplicationBindingScope.CodingTaskSession,
      repositoryBinding,
      sessionActorId: "agent-1",
    });

    await expectRepositoryBinding(application);
    expect(readHiddenProperty(application.runCodingTaskCell, "runtimeBinding")).toBeUndefined();
    expect(readHiddenProperty(application.activateCodingTaskSession, "runtimeBinding")).toEqual({
      ...repositoryBinding,
      agentActorId: "agent-1",
    });
  });
});

async function expectRepositoryBinding(application: CliApplication): Promise<void> {
  const resolver = readHiddenProperty(
    application,
    "repositoryRootResolver",
  ) as RepositoryRootResolverPort;
  const result = await resolver.resolve({
    workspaceId: repositoryBinding.workspaceId,
    repositoryId: repositoryBinding.repositoryId,
  });

  expect(result.status).toBe(ResultStatus.Success);
  if (result.status === ResultStatus.Success) {
    expect(result.value).toEqual({ repositoryRoot: repositoryBinding.repositoryRoot });
  }
}

function readHiddenProperty(target: object, property: string): unknown {
  return Reflect.get(target, property);
}
