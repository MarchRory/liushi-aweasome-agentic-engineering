/** 企业 HTTPS Authority 构造参数。 */
export interface EnterpriseHttpsExecutorCompatibilityReleaseApprovalAuthorityConfiguration {
  /** 固定的 HTTPS Authority endpoint。 */
  readonly endpoint: string;
  /** 固定的 Authority 标识。 */
  readonly authorityId: string;
  /** 固定的 Bearer 凭据。 */
  readonly bearerToken: string;
  /** 单次 Authority 请求的超时毫秒数。 */
  readonly timeoutMs: number;
}

/** 企业 HTTPS Authority 使用的 fetch 依赖边界。 */
export type EnterpriseHttpsFetch = (input: string, init?: RequestInit) => Promise<Response>;
