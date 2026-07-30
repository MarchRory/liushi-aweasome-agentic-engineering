import type { HarnessError, Result } from "#common/index.js";
import type { PilotEnrollment, PilotSettlement } from "#domain/pilotMetrics/index.js";
import type { CodingTaskSessionId } from "#domain/codingTaskSession/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";

import type { PilotMetricsCreateDisposition } from "../enums/index.js";

/** 以 Workspace/Session 定位一组 Pilot Metrics 记录。 */
export interface PilotMetricsLocator {
  /** 记录所属的工作区标识。 */
  readonly workspaceId: WorkspaceId;
  /** 记录所属的编码任务会话标识。 */
  readonly sessionId: CodingTaskSessionId;
}

/** create-only 写入的统一结果。 */
export interface PilotMetricsCreateResult<T> {
  /** 写入结果的处置状态。 */
  readonly disposition: PilotMetricsCreateDisposition;
  /** 创建或复用后的不可变记录。 */
  readonly record: T;
}

/** Pilot Metrics 的不可变持久化 Port。 */
export interface PilotMetricsStore {
  /** 创建、复用或报告同一定位下的内容冲突。 */
  createEnrollment(
    enrollment: PilotEnrollment,
  ): Promise<Result<PilotMetricsCreateResult<PilotEnrollment>, HarnessError>>;
  /** 查找 Enrollment；记录不存在时返回 null。 */
  findEnrollment(
    locator: PilotMetricsLocator,
  ): Promise<Result<PilotEnrollment | null, HarnessError>>;
  /** 加载并严格重建 Enrollment；记录不存在时返回失败。 */
  loadEnrollment(locator: PilotMetricsLocator): Promise<Result<PilotEnrollment, HarnessError>>;
  /** 创建、复用或报告同一定位下的内容冲突。 */
  createSettlement(
    settlement: PilotSettlement,
  ): Promise<Result<PilotMetricsCreateResult<PilotSettlement>, HarnessError>>;
  /** 查找 Settlement；记录不存在时返回 null。 */
  findSettlement(
    locator: PilotMetricsLocator,
  ): Promise<Result<PilotSettlement | null, HarnessError>>;
  /** 加载并严格重建 Settlement；记录不存在时返回失败。 */
  loadSettlement(locator: PilotMetricsLocator): Promise<Result<PilotSettlement, HarnessError>>;
}
