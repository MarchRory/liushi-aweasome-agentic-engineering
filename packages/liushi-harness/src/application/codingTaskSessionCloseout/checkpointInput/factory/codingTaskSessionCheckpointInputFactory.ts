import type { ChangeSetCheckpointInput } from "#application/changeSetCheckpoint/index.js";

import { CODING_TASK_SESSION_CLOSEOUT_COMMIT_MESSAGE_PREFIX } from "../../constants/index.js";
import type { CodingTaskSessionCheckpointInputFactoryInput } from "../contracts/index.js";

/** 以相同规则为 Closeout 和后续 Delivery 重建 ChangeSet Checkpoint 输入。 */
export function createCodingTaskSessionCheckpointInput(
  input: CodingTaskSessionCheckpointInputFactoryInput,
): ChangeSetCheckpointInput {
  return {
    checkpointInput: {
      repositoryId: input.aggregate.repositoryId,
      repositoryRoot: input.repositoryRoot,
      worktreeBinding: input.aggregate.worktreeBinding,
      baseRevision: input.aggregate.baseRevision,
      writeSet: input.aggregate.writeSet,
      commitMessage: `${CODING_TASK_SESSION_CLOSEOUT_COMMIT_MESSAGE_PREFIX} ${input.aggregate.codingTaskId}`,
    },
    preSubmitSnapshot: input.snapshot,
  };
}
