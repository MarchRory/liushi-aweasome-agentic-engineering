import type {
  GitChangeSetInspectorPort,
  InspectGitChangeSetInput,
} from "#application/ports/index.js";
import type { HarnessError, Result } from "#common/index.js";
import type { CodingTaskSessionChangeSetSnapshot } from "#domain/codingTaskSessionChangeSet/index.js";

/** 通过权威 Git ChangeSet Inspector 执行提交前只读快照。 */
export class InspectGitChangeSetUseCase {
  public constructor(private readonly inspector: GitChangeSetInspectorPort) {}

  /** 从受管 Worktree 读取变化，不接受调用方自报 changed paths。 */
  public execute(
    input: InspectGitChangeSetInput,
  ): Promise<Result<CodingTaskSessionChangeSetSnapshot, HarnessError>> {
    return this.inspector.inspectPreSubmit(input);
  }
}
