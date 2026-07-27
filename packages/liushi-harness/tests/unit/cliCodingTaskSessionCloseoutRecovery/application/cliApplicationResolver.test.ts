import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { ResultStatus, success } from "../../../../src/common/index.js";
import {
  CliApplicationBindingScope,
  parseCliArguments,
  type CliApplication,
  type RunCliDependencies,
} from "../../../../src/presentation/index.js";
import { resolveCliApplication } from "../../../../src/presentation/cli/runner/application/index.js";

const repositoryRoot = resolve("repository");

describe("CodingTask Session Closeout Recovery CLI Application scope", () => {
  it.each([
    [
      "assess",
      [
        "--workspace",
        "workspace-1",
        "--session",
        "session-1",
        "--repository",
        "repository-1",
        "--root",
        repositoryRoot,
      ],
      CliApplicationBindingScope.Repository,
    ],
    [
      "recover",
      [
        "--file",
        "human-command.json",
        "--workspace",
        "workspace-1",
        "--session",
        "session-1",
        "--repository",
        "repository-1",
        "--root",
        repositoryRoot,
        "--actor-id",
        "human-1",
      ],
      CliApplicationBindingScope.Repository,
    ],
    ["effective", ["--workspace", "workspace-1", "--session", "session-1"], undefined],
  ])("%s 使用精确的启动作用域", (subcommand, options, scope) => {
    const createApplication = vi.fn(() => ({}) as CliApplication);
    const dependencies = {
      defaultStoreRoot: ".runtime",
      applicationFactory: { create: createApplication },
      writer: { stdout: () => undefined, stderr: () => undefined },
      jsonDocumentReader: { read: () => Promise.resolve(success({})) },
    } satisfies RunCliDependencies;
    const parsed = parseCliArguments([
      "coding-task",
      "session",
      "closeout",
      subcommand,
      ...options,
    ]);

    expect(parsed.status).toBe(ResultStatus.Success);
    if (parsed.status === ResultStatus.Failure) return;
    resolveCliApplication(parsed.value, dependencies);

    if (scope === undefined) {
      expect(createApplication).toHaveBeenCalledWith(".runtime");
      return;
    }
    expect(createApplication).toHaveBeenCalledWith(".runtime", {
      scope,
      repositoryBinding: {
        workspaceId: "workspace-1",
        repositoryId: "repository-1",
        repositoryRoot,
      },
    });
  });
});
