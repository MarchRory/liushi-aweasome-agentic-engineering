import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { RepositoryRootResolutionFailureCode } from "../../src/application/ports/index.js";
import { HarnessError, HarnessErrorCode, ResultStatus } from "../../src/common/index.js";
import { StaticRepositoryRootResolverAdapter } from "../../src/infrastructure/index.js";

describe("StaticRepositoryRootResolverAdapter", () => {
  it("按 Workspace 与 Repository 精确返回规范化的可信 Root", async () => {
    const configuredRoot = resolve("fixtures", "repository", "..");
    const adapter = new StaticRepositoryRootResolverAdapter([
      { workspaceId: "workspace-a", repositoryId: "repository-a", repositoryRoot: configuredRoot },
    ]);

    const result = await adapter.resolve({
      workspaceId: "workspace-a",
      repositoryId: "repository-a",
    });

    expect(result).toEqual({
      status: ResultStatus.Success,
      value: { repositoryRoot: resolve(configuredRoot) },
    });
  });

  it("未配置精确绑定时 fail closed", async () => {
    const adapter = new StaticRepositoryRootResolverAdapter([
      {
        workspaceId: "workspace-a",
        repositoryId: "repository-a",
        repositoryRoot: resolve("fixtures", "repository-a"),
      },
    ]);

    const result = await adapter.resolve({
      workspaceId: "workspace-b",
      repositoryId: "repository-a",
    });

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.code).toBe(HarnessErrorCode.OperationForbidden);
      expect(result.error.details["failureCode"]).toBe(
        RepositoryRootResolutionFailureCode.BindingNotFound,
      );
    }
  });

  it("允许同值重复绑定并拒绝同键冲突", async () => {
    const firstRoot = resolve("fixtures", "repository-a");
    const duplicate = new StaticRepositoryRootResolverAdapter([
      { workspaceId: "workspace-a", repositoryId: "repository-a", repositoryRoot: firstRoot },
      { workspaceId: "workspace-a", repositoryId: "repository-a", repositoryRoot: firstRoot },
    ]);

    await expect(
      duplicate.resolve({ workspaceId: "workspace-a", repositoryId: "repository-a" }),
    ).resolves.toMatchObject({ status: ResultStatus.Success });
    const conflict = captureHarnessError(
      () =>
        new StaticRepositoryRootResolverAdapter([
          {
            workspaceId: "workspace-a",
            repositoryId: "repository-a",
            repositoryRoot: firstRoot,
          },
          {
            workspaceId: "workspace-a",
            repositoryId: "repository-a",
            repositoryRoot: resolve("fixtures", "repository-b"),
          },
        ]),
    );
    expect(conflict.code).toBe(HarnessErrorCode.InvalidInput);
    expect(conflict.details["failureCode"]).toBe(
      RepositoryRootResolutionFailureCode.ConflictingBinding,
    );
  });

  it("拒绝相对 Root 与无效解析身份", async () => {
    const invalidBinding = captureHarnessError(
      () =>
        new StaticRepositoryRootResolverAdapter([
          {
            workspaceId: "workspace-a",
            repositoryId: "repository-a",
            repositoryRoot: "relative/repository",
          },
        ]),
    );
    expect(invalidBinding.details["failureCode"]).toBe(
      RepositoryRootResolutionFailureCode.InvalidBinding,
    );

    const result = await new StaticRepositoryRootResolverAdapter().resolve({
      workspaceId: "../workspace",
      repositoryId: "repository-a",
    });
    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.details["failureCode"]).toBe(
        RepositoryRootResolutionFailureCode.InvalidRequest,
      );
    }
  });
});

function captureHarnessError(operation: () => unknown): HarnessError {
  try {
    operation();
  } catch (error) {
    if (error instanceof HarnessError) return error;
    throw error;
  }
  throw new Error("测试预期捕获 HarnessError。");
}
