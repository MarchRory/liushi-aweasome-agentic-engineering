import type { ContentDigest } from "#common/index.js";
import type {
  InstallationRevisionEvent,
  InstallationRevisionId,
  InstallationRevisionIntent,
  InstallationRevisionState,
} from "#domain/installation/index.js";
import type { RepositoryId, WorkspaceId } from "#domain/workspace/index.js";

import type { InstallationRevisionReservationDisposition } from "../enums/index.js";

/** 定位单仓 Installation Revision 的稳定身份。 */
export interface InstallationRevisionLocator {
  /** Revision 所属 Workspace。 */
  readonly workspaceId: WorkspaceId;
  /** Revision 唯一写入的 Repository。 */
  readonly repositoryId: RepositoryId;
  /** Revision 的 uppercase ULID。 */
  readonly revisionId: InstallationRevisionId;
}

/** Intent 保留成功后的当前权威状态。 */
export interface InstallationRevisionReservation {
  /** 本次调用首次取得还是复用幂等 Intent。 */
  readonly disposition: InstallationRevisionReservationDisposition;
  /** 已持久化并通过完整性重放的 Revision。 */
  readonly state: InstallationRevisionState;
}

/** 以乐观版本前置条件追加一个不可变阶段事件。 */
export interface AppendInstallationRevisionEventInput extends InstallationRevisionLocator {
  /** 调用方读取到的 Revision Record 摘要。 */
  readonly expectedRecordDigest: ContentDigest;
  /** 待追加并重新进行状态机重放的事件。 */
  readonly event: InstallationRevisionEvent;
}

/** 首次持久化 rollback journal 所需的完整 Intent。 */
export interface ReserveInstallationRevisionIntentInput {
  /** 尚未写 Repository 的完整 Intent。 */
  readonly intent: InstallationRevisionIntent;
}
