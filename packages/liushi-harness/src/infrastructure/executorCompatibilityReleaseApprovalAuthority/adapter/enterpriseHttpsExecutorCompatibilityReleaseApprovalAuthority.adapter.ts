import type {
  ExecutorCompatibilityReleaseApprovalAuthorityInput,
  ExecutorCompatibilityReleaseApprovalAuthorityPort,
  ExecutorCompatibilityReleaseApprovalVerificationReceipt,
} from "#application/ports/executorCompatibilityReleaseApprovalAuthority/index.js";
import { executorCompatibilityReleaseApprovalVerificationReceiptSchema } from "#application/ports/executorCompatibilityReleaseApprovalAuthority/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import {
  StrictJsonCanonicalPolicy,
  parseStrictUtf8Json,
} from "#infrastructure/strictJsonFileReader/index.js";
import { canonicalizeJson } from "#infrastructure/serialization/index.js";

import { ENTERPRISE_HTTPS_EXECUTOR_COMPATIBILITY_RELEASE_APPROVAL_JSON_MEDIA_TYPE } from "../constants/index.js";
import type { EnterpriseHttpsFetch } from "../contracts/index.js";
import {
  cancelEnterpriseHttpsAuthorityResponseBodyBestEffort,
  readEnterpriseHttpsAuthorityResponseBody,
} from "../responseReader/index.js";
import {
  validateEnterpriseHttpsExecutorCompatibilityReleaseApprovalAuthorityConfiguration,
  validateEnterpriseHttpsExecutorCompatibilityReleaseApprovalAuthorityInput,
} from "../validation/index.js";

/** 通过固定 HTTPS endpoint 查询企业 Release Approval Authority 的 Adapter。 */
export class EnterpriseHttpsExecutorCompatibilityReleaseApprovalAuthorityAdapter implements ExecutorCompatibilityReleaseApprovalAuthorityPort {
  private readonly endpoint: string;
  private readonly authorityId: string;
  private readonly bearerToken: string;
  private readonly timeoutMs: number;

  public constructor(
    endpoint: string,
    authorityId: string,
    bearerToken: string,
    timeoutMs: number,
    private readonly fetchImplementation: EnterpriseHttpsFetch = globalThis.fetch,
  ) {
    const validated =
      validateEnterpriseHttpsExecutorCompatibilityReleaseApprovalAuthorityConfiguration({
        endpoint,
        authorityId,
        bearerToken,
        timeoutMs,
      });
    if (validated.status === ResultStatus.Failure) throw validated.error;
    this.endpoint = validated.value.endpoint.toString();
    this.authorityId = validated.value.authorityId;
    this.bearerToken = bearerToken;
    this.timeoutMs = timeoutMs;
  }

  /** 在联网前校验输入，发送最小 canonical JSON，并严格绑定 Authority 回执。 */
  public async verifyTrustedApproval(
    input: ExecutorCompatibilityReleaseApprovalAuthorityInput,
  ): Promise<Result<ExecutorCompatibilityReleaseApprovalVerificationReceipt, HarnessError>> {
    const validatedInput =
      validateEnterpriseHttpsExecutorCompatibilityReleaseApprovalAuthorityInput(input);
    if (validatedInput.status === ResultStatus.Failure) return validatedInput;

    const requestBody = canonicalizeJson({
      approvalSubject: validatedInput.value.approvalSubject,
      artifactDigest: validatedInput.value.artifactDigest,
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImplementation(this.endpoint, {
        method: "POST",
        headers: {
          Accept: ENTERPRISE_HTTPS_EXECUTOR_COMPATIBILITY_RELEASE_APPROVAL_JSON_MEDIA_TYPE,
          "Content-Type": ENTERPRISE_HTTPS_EXECUTOR_COMPATIBILITY_RELEASE_APPROVAL_JSON_MEDIA_TYPE,
          Authorization: `Bearer ${this.bearerToken}`,
        },
        body: requestBody,
        redirect: "error",
        signal: controller.signal,
      });
    } catch {
      clearTimeout(timeout);
      return failure(new HarnessError(HarnessErrorCode.IoFailure, "Authority 请求失败。"));
    }

    try {
      if (response.redirected || response.type === "opaqueredirect") {
        await cancelEnterpriseHttpsAuthorityResponseBodyBestEffort(response);
        return failure(new HarnessError(HarnessErrorCode.IoFailure, "Authority 请求发生重定向。"));
      }
      if (response.status !== 200) {
        await cancelEnterpriseHttpsAuthorityResponseBodyBestEffort(response);
        return failure(
          new HarnessError(
            response.status >= 500
              ? HarnessErrorCode.IoFailure
              : HarnessErrorCode.PreconditionNotMet,
            "Authority 返回了不接受的 HTTP 状态。",
          ),
        );
      }
      if (!isJsonMediaType(response.headers.get("content-type"))) {
        await cancelEnterpriseHttpsAuthorityResponseBodyBestEffort(response);
        return failure(
          new HarnessError(HarnessErrorCode.PreconditionNotMet, "Authority 回执媒体类型无效。"),
        );
      }

      const body = await readEnterpriseHttpsAuthorityResponseBody(response, controller.signal);
      if (body.status === ResultStatus.Failure) return body;
      const parsed = parseStrictUtf8Json(body.value, StrictJsonCanonicalPolicy.NotRequired);
      if (parsed.status === ResultStatus.Failure) return parsed;
      const receipt = executorCompatibilityReleaseApprovalVerificationReceiptSchema.safeParse(
        parsed.value,
      );
      if (!receipt.success) {
        return failure(
          new HarnessError(HarnessErrorCode.InvalidInput, "Authority 回执 Schema 无效。"),
        );
      }
      if (receipt.data.authorityId !== this.authorityId) {
        return failure(
          new HarnessError(HarnessErrorCode.PreconditionNotMet, "Authority 回执标识不匹配。"),
        );
      }
      if (
        receipt.data.approvalSubject !== validatedInput.value.approvalSubject ||
        receipt.data.artifactDigest !== validatedInput.value.artifactDigest
      ) {
        return failure(
          new HarnessError(HarnessErrorCode.PreconditionNotMet, "Authority 回执绑定请求不匹配。"),
        );
      }
      return success(receipt.data as ExecutorCompatibilityReleaseApprovalVerificationReceipt);
    } catch {
      return failure(new HarnessError(HarnessErrorCode.IoFailure, "Authority 响应处理失败。"));
    } finally {
      clearTimeout(timeout);
    }
  }
}

function isJsonMediaType(value: string | null): boolean {
  if (value === null) return false;
  const mediaType = value.split(";", 1)[0]?.trim().toLowerCase();
  return (
    mediaType === "application/json" ||
    (mediaType?.includes("/") === true && mediaType.endsWith("+json"))
  );
}
