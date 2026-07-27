import { vi } from "vitest";

import {
  CliCommand,
  CliOutputFormat,
  type CodingTaskSessionCloseoutRecoveryAssessCliCommand,
  type CodingTaskSessionCloseoutRecoverCliCommand,
  type CodingTaskSessionEffectiveCloseoutCliCommand,
  type RunCliDependencies,
} from "../../../../src/presentation/index.js";
import { success } from "../../../../src/index.js";
import type { CliApplication } from "../../../../src/presentation/cli/contracts/index.js";
import type { HarnessError, Result } from "../../../../src/index.js";

/** CLI runner 测试的最小依赖夹具。*/
type RunnerSetup = {
  readonly dependencies: RunCliDependencies;
  readonly stdout: ReturnType<typeof vi.fn>;
  readonly stderr: ReturnType<typeof vi.fn>;
  readonly read: ReturnType<typeof vi.fn>;
};

export function createAssessCommand(
  overrides: Partial<CodingTaskSessionCloseoutRecoveryAssessCliCommand> = {},
): CodingTaskSessionCloseoutRecoveryAssessCliCommand {
  return {
    command: CliCommand.CodingTaskSessionCloseoutRecoveryAssess,
    outputFormat: CliOutputFormat.Json,
    workspaceId: "workspace-1",
    sessionId: "session-1",
    repositoryId: "repository-1",
    repositoryRoot: "repository",
    ...overrides,
  };
}

export function createEffectiveCommand(
  overrides: Partial<CodingTaskSessionEffectiveCloseoutCliCommand> = {},
): CodingTaskSessionEffectiveCloseoutCliCommand {
  return {
    command: CliCommand.CodingTaskSessionEffectiveCloseout,
    outputFormat: CliOutputFormat.Json,
    workspaceId: "workspace-1",
    sessionId: "session-1",
    ...overrides,
  };
}

export function createRecoverCommand(
  overrides: Partial<CodingTaskSessionCloseoutRecoverCliCommand> = {},
): CodingTaskSessionCloseoutRecoverCliCommand {
  return {
    command: CliCommand.CodingTaskSessionCloseoutRecover,
    outputFormat: CliOutputFormat.Json,
    filePath: "human-command.json",
    workspaceId: "workspace-1",
    sessionId: "session-1",
    repositoryId: "repository-1",
    repositoryRoot: "repository",
    actorId: "human-1",
    ...overrides,
  };
}

export function createRunnerSetup(
  application: unknown,
  document: unknown = boundDocument(),
  documentResult: Result<unknown, HarnessError> = success(document),
): RunnerSetup {
  const stdout = vi.fn<(value: string) => void>();
  const stderr = vi.fn<(value: string) => void>();
  const read = vi.fn(() => Promise.resolve(documentResult));
  const dependencies: RunCliDependencies = {
    defaultStoreRoot: ".runtime",
    applicationFactory: { create: vi.fn(() => application as CliApplication) },
    writer: { stdout, stderr },
    jsonDocumentReader: { read },
  };
  return { dependencies, stdout, stderr, read };
}

export function boundDocument(): {
  actor: { actorId: string };
  payload: { workspaceId: string; sessionId: string };
} {
  return {
    actor: { actorId: "human-1" },
    payload: { workspaceId: "workspace-1", sessionId: "session-1" },
  };
}
