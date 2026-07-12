import type {
  InspectWorktreeInput,
  WorktreeInspectionReport,
  WorktreeInspectorPort,
} from "#application/ports/index.js";
import type { HarnessError, Result } from "#common/index.js";

/** 通过 Worktree Inspector Port 执行无副作用的工作树检查。 */
export class InspectWorktreeUseCase {
  public constructor(private readonly inspector: WorktreeInspectorPort) {}

  /** 检查工作树、基线和声明 Write Set。 */
  public async execute(
    input: InspectWorktreeInput,
  ): Promise<Result<WorktreeInspectionReport, HarnessError>> {
    return this.inspector.inspect(input);
  }
}
