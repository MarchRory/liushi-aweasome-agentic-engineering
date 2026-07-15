import type { HarnessError, Result } from "#common/index.js";
import type { PersistedManagedFileState } from "#domain/installation/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";

/** Runtime Revision 对 Repository Manifest Claim 的权威验证输入。 */
export interface VerifyManagedOwnershipInput {
  /** Claim 所属 Workspace，用于定位隔离 Runtime Store。 */
  readonly workspaceId: WorkspaceId;
  /** 仍被视为不可信外部输入的 Manifest Claim。 */
  readonly claim: PersistedManagedFileState;
}

/** 仅由已提交 Installation Revision 提供所有权证明。 */
export interface ManagedOwnershipVerifier {
  /** 返回 false 表示 Claim 未获权威证明，而不是自动取得所有权。 */
  verify(input: VerifyManagedOwnershipInput): Promise<Result<boolean, HarnessError>>;
}
