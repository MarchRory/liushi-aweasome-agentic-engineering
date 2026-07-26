import {
  ChangeSetCheckpointService,
  InspectGitChangeSetUseCase,
  type ChangeSetCheckpointPort,
  type ChangeSetCheckpointRecoveryPort,
} from "#application/index.js";
import type {
  ContentDigestPort,
  GitCheckpointPort,
  WorktreeInspectorPort,
} from "#application/ports/index.js";
import {
  NodeGitCheckpointAdapter,
  NodeGitChangeSetInspectorAdapter,
  NodeGitCommittedChangeSetInspectorAdapter,
  type CommandRunner,
} from "#infrastructure/index.js";

/** ChangeSet 与 Git Checkpoint 应用子系统的装配输入。 */
export interface ChangeSetCheckpointApplicationFactoryInput {
  /** 使用参数数组且关闭 Shell 的命令执行器。 */
  readonly commandRunner: CommandRunner;
  /** 受管 Worktree 权威检查端口。 */
  readonly worktreeInspector: WorktreeInspectorPort;
  /** 规范内容摘要端口。 */
  readonly digest: ContentDigestPort;
}

/** ChangeSet 与 Git Checkpoint 应用子系统的装配结果。 */
export interface ChangeSetCheckpointApplicationFactoryOutput {
  /** 从受管 Worktree 生成提交前权威 ChangeSet Snapshot。 */
  readonly inspectGitChangeSet: InspectGitChangeSetUseCase;
  /** 创建或恢复与 ChangeSet 双向绑定的 Git Checkpoint。 */
  readonly changeSetCheckpoints: ChangeSetCheckpointPort;
  /** 只读评估 ChangeSet-bound Checkpoint 的恢复端口。 */
  readonly changeSetCheckpointRecovery: ChangeSetCheckpointRecoveryPort;
  /** 兼容既有 CodingTask 提交链的底层 Git Checkpoint 端口。 */
  readonly gitCheckpoint: GitCheckpointPort;
}

/** 在 Bootstrap 层集中装配提交前、提交后与 Checkpoint 绑定能力。 */
export function createChangeSetCheckpointApplication(
  input: ChangeSetCheckpointApplicationFactoryInput,
): ChangeSetCheckpointApplicationFactoryOutput {
  const changeSetInspector = new NodeGitChangeSetInspectorAdapter(
    input.worktreeInspector,
    input.digest,
  );
  const gitCheckpoint = new NodeGitCheckpointAdapter(
    input.commandRunner,
    input.worktreeInspector,
    input.digest,
  );
  const committedChangeSetInspector = new NodeGitCommittedChangeSetInspectorAdapter(
    input.commandRunner,
    input.worktreeInspector,
    input.digest,
  );
  const changeSetCheckpoints = new ChangeSetCheckpointService(
    changeSetInspector,
    committedChangeSetInspector,
    gitCheckpoint,
    input.digest,
  );
  return {
    inspectGitChangeSet: new InspectGitChangeSetUseCase(changeSetInspector),
    changeSetCheckpoints,
    changeSetCheckpointRecovery: changeSetCheckpoints,
    gitCheckpoint,
  };
}
