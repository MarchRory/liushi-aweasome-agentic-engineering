declare const decisionRequestIdBrand: unique symbol;
declare const approvalIdBrand: unique symbol;

/** 经 ULID 格式校验的 Decision Request ID。 */
export type DecisionRequestId = string & { readonly [decisionRequestIdBrand]: true };

/** 经 ULID 格式校验的 Approval ID。 */
export type ApprovalId = string & { readonly [approvalIdBrand]: true };
