import { WORKTREE_RELATIVE_PATH } from "../../constants/index.mjs";
import { calculateDigest } from "../../digest/index.mjs";

export function createSessionActivationPayloads(input) {
  return {
    createPayload: {
      workspaceId: input.workspaceId,
      sourceTaskId: input.taskId,
      repositoryId: input.repositoryId,
      baseRevision: input.repositoryRevision,
      worktreeBinding: {
        worktreeId: `codex-agent-pilot-${input.codingTaskId}`,
        relativePath: WORKTREE_RELATIVE_PATH,
        branchName: "codex/agent-pilot",
        managed: true,
      },
      writeSet: [...input.writeSet],
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
