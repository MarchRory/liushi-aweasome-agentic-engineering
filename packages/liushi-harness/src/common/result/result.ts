/** Result 是否包含成功值或失败错误。 */
export enum ResultStatus {
  /** Use Case 或 Port 成功完成。 */
  Success = "success",
  /** Use Case 或 Port 返回可分类错误。 */
  Failure = "failure",
}

/** 携带成功值的 Result。 */
export interface SuccessResult<T> {
  /** Result 的成功判别字段。 */
  status: ResultStatus.Success;
  /** 成功产生的值。 */
  value: T;
}

/** 携带失败错误的 Result。 */
export interface FailureResult<E> {
  /** Result 的失败判别字段。 */
  status: ResultStatus.Failure;
  /** 失败产生的稳定错误。 */
  error: E;
}

/** 不依赖异常控制流的成功或失败结果。 */
export type Result<T, E> = SuccessResult<T> | FailureResult<E>;

/** 创建成功 Result。 */
export function success<T>(value: T): SuccessResult<T> {
  return { status: ResultStatus.Success, value };
}

/** 创建失败 Result。 */
export function failure<E>(error: E): FailureResult<E> {
  return { status: ResultStatus.Failure, error };
}
