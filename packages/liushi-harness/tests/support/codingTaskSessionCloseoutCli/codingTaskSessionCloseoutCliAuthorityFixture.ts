import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  CodingTaskSessionActivationStatus,
  ResultStatus,
  createHarnessApplication,
} from "../../../src/index.js";
import { StaticRepositoryRootResolverAdapter } from "../../../src/infrastructure/index.js";

import { createCloseoutCliApprovedAuthorization } from "./codingTaskSessionCloseoutCliArtifactFixture.js";
import {
  CLOSEOUT_CLI_AGENT_ACTOR_ID,
  CLOSEOUT_CLI_CODING_TASK_ID,
  CLOSEOUT_CLI_REPOSITORY_ID,
  CLOSEOUT_CLI_SESSION_ID,
  CLOSEOUT_CLI_SOURCE_TASK_ID,
  CLOSEOUT_CLI_WORKSPACE_ID,
} from "./codingTaskSessionCloseoutCliConstants.js";
import {
  createCloseoutCliCommand,
  createCloseoutCliSessionManifest,
} from "./codingTaskSessionCloseoutCliSessionFixture.js";
import { produceCloseoutCliHookEvidence } from "./codingTaskSessionCloseoutCliHookFixture.js";
import {
  createCloseoutCliTemporaryRoot,
  runCloseoutCliGit,
} from "./codingTaskSessionCloseoutCliGitFixture.js";
import type { CodingTaskSessionCloseoutCliSetup } from "./codingTaskSessionCloseoutCliContracts.js";

/** 创建真实 Git、审批状态、Session Activation、Hook Evidence 与 Closeout Command。 */
export async function createCodingTaskSessionCloseoutCliSetup(
  roots: string[],
): Promise<CodingTaskSessionCloseoutCliSetup> {
  const storeRoot = await createCloseoutCliTemporaryRoot(roots, "liushi-closeout-store-");
  const repositoryRoot = await createCloseoutCliTemporaryRoot(roots, "liushi-closeout-repo-");
  await initializeRepository(repositoryRoot);
  const baseRevision = await runCloseoutCliGit(repositoryRoot, ["rev-parse", "HEAD"]);
  const application = createPreparationApplication(storeRoot, repositoryRoot);
  const executionAuthorization = await createCloseoutCliApprovedAuthorization(application);
  const worktreeRoot = join(repositoryRoot, "worktrees", "session");
  const manifest = createCloseoutCliSessionManifest({
    repositoryRoot,
    baseRevision,
    executionAuthorization,
  });
  const activation = await application.activateCodingTaskSession.execute(manifest);
  if (activation.status !== ResultStatus.Success) throw activation.error;
  if (activation.value.status !== CodingTaskSessionActivationStatus.WaitingAgent) {
    throw new Error(`Session Activation 未进入 WaitingAgent：${activation.value.status}。`);
  }
  await produceCloseoutCliHookEvidence(application, storeRoot, worktreeRoot);
  const closeoutCommand = createCloseoutCliCommand();
  const closeoutCommandFile = join(storeRoot, "closeout-command.json");
  const closeoutStateFile = resolveCloseoutStateFile(storeRoot);
  await writeFile(closeoutCommandFile, JSON.stringify(closeoutCommand), "utf8");
  return {
    application,
    storeRoot,
    repositoryRoot,
    worktreeRoot,
    closeoutCommandFile,
    closeoutStateFile,
    closeoutCommand,
    baseRevision,
    workspaceId: CLOSEOUT_CLI_WORKSPACE_ID,
    repositoryId: CLOSEOUT_CLI_REPOSITORY_ID,
    sessionId: CLOSEOUT_CLI_SESSION_ID,
    agentActorId: CLOSEOUT_CLI_AGENT_ACTOR_ID,
    evidenceFiles: evidenceFiles(storeRoot, closeoutStateFile),
    executionAuthorization,
  };
}

async function initializeRepository(repositoryRoot: string): Promise<void> {
  await runCloseoutCliGit(repositoryRoot, ["init", "-b", "main"]);
  await runCloseoutCliGit(repositoryRoot, ["config", "core.autocrlf", "false"]);
  await runCloseoutCliGit(repositoryRoot, ["config", "user.name", "liushi-test"]);
  await runCloseoutCliGit(repositoryRoot, ["config", "user.email", "liushi-test@example.com"]);
  await mkdir(join(repositoryRoot, "src"));
  await writeFile(join(repositoryRoot, "src", "index.ts"), "export const value = 1;\n", "utf8");
  await runCloseoutCliGit(repositoryRoot, ["add", "."]);
  await runCloseoutCliGit(repositoryRoot, ["commit", "-m", "base"]);
}

function createPreparationApplication(storeRoot: string, repositoryRoot: string) {
  return createHarnessApplication({
    storeRoot,
    taskIdGenerator: { next: () => CLOSEOUT_CLI_SOURCE_TASK_ID },
    repositoryRootResolver: new StaticRepositoryRootResolverAdapter([
      {
        workspaceId: CLOSEOUT_CLI_WORKSPACE_ID,
        repositoryId: CLOSEOUT_CLI_REPOSITORY_ID,
        repositoryRoot,
      },
    ]),
    codingTaskSessionRuntimeBinding: {
      workspaceId: CLOSEOUT_CLI_WORKSPACE_ID,
      repositoryId: CLOSEOUT_CLI_REPOSITORY_ID,
      repositoryRoot,
      agentActorId: CLOSEOUT_CLI_AGENT_ACTOR_ID,
    },
  });
}

function evidenceFiles(storeRoot: string, closeoutStateFile: string): readonly string[] {
  const workspace = join(storeRoot, "workspaces", CLOSEOUT_CLI_WORKSPACE_ID);
  const session = join(workspace, "codingTaskSessions", CLOSEOUT_CLI_SESSION_ID);
  const sourceTask = join(workspace, "tasks", CLOSEOUT_CLI_SOURCE_TASK_ID);
  const codingTask = join(workspace, "codingTasks", CLOSEOUT_CLI_CODING_TASK_ID);
  return [
    join(storeRoot, "hookBindings", "bindings.json"),
    join(session, "activation.json"),
    join(session, "admission.json"),
    closeoutStateFile,
    join(sourceTask, "events.jsonl"),
    join(sourceTask, "actions.jsonl"),
    join(sourceTask, "traces.jsonl"),
    join(codingTask, "events.jsonl"),
  ];
}

function resolveCloseoutStateFile(storeRoot: string): string {
  return join(
    storeRoot,
    "workspaces",
    CLOSEOUT_CLI_WORKSPACE_ID,
    "codingTaskSessions",
    CLOSEOUT_CLI_SESSION_ID,
    "closeout.json",
  );
}
