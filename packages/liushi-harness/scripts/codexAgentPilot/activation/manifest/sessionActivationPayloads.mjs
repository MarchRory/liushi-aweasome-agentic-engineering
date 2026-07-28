import {
  REPOSITORY_ID,
  REPOSITORY_REVISION,
  WORKTREE_RELATIVE_PATH,
  WRITE_SET,
} from "../../constants/index.mjs";
import { calculateDigest } from "../../digest/index.mjs";

export function createSessionActivationPayloads(input) {
  return {
    createPayload: {
      workspaceId: input.workspaceId,
      sourceTaskId: input.taskId,
      repositoryId: REPOSITORY_ID,
      baseRevision: REPOSITORY_REVISION,
      worktreeBinding: {
        worktreeId: `codex-agent-pilot-${input.codingTaskId}`,
        relativePath: WORKTREE_RELATIVE_PATH,
        branchName: "codex/agent-pilot",
        managed: true,
      },
      writeSet: [...WRITE_SET],
      inputBindingSet: { bindings: [] },
      executionAuthorization: input.executionAuthorization,
    },
    provisionPayload: {
      workspaceId: input.workspaceId,
      actionId: input.actionId,
      repositoryRootDigest: calculateDigest({
        repositoryRoot: input.repositoryRoot,
      }),
    },
    startPayload: {
      workspaceId: input.workspaceId,
      attemptNumber: 1,
    },
  };
}
