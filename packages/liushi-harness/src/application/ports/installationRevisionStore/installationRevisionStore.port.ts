import type { HarnessError, Result } from "#common/index.js";
import type { InstallationRevisionState } from "#domain/installation/index.js";

import type {
  AppendInstallationRevisionEventInput,
  FindInstallationRevisionByApprovalInput,
  InstallationRevisionLocator,
  InstallationRevisionReservation,
  ReserveInstallationRevisionIntentInput,
} from "./contracts/index.js";

/** Installation rollback journal 与阶段 checkpoint 的强一致持久化边界。 */
export interface InstallationRevisionStore {
  /** 在重新读取旧计划前按批准幂等域查找既有 Revision。 */
  findByApproval(
    input: FindInstallationRevisionByApprovalInput,
  ): Promise<Result<InstallationRevisionState | undefined, HarnessError>>;
  /** 在任何 Repository 写入前幂等持久化完整 Intent。 */
  reserveIntent(
    input: ReserveInstallationRevisionIntentInput,
  ): Promise<Result<InstallationRevisionReservation, HarnessError>>;
  /** 以当前 Record 摘要为 CAS 前置条件追加一个阶段 checkpoint。 */
  appendEvent(
    input: AppendInstallationRevisionEventInput,
  ): Promise<Result<InstallationRevisionState, HarnessError>>;
  /** 加载并完整校验指定 Revision；不存在时返回稳定 NotFound。 */
  load(
    locator: InstallationRevisionLocator,
  ): Promise<Result<InstallationRevisionState, HarnessError>>;
}
