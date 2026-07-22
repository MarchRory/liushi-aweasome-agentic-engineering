import { describe, expect, it } from "vitest";

import { createExecutorCompatibilityReleaseApprovalVerificationReceipt } from "../../src/application/executorCompatibilityReleaseApproval/index.js";
import {
  EXECUTOR_COMPATIBILITY_RELEASE_APPROVAL_VERIFICATION_RECEIPT_SCHEMA_VERSION,
  type ExecutorCompatibilityReleaseApprovalVerificationReceipt,
} from "../../src/application/ports/executorCompatibilityReleaseApprovalAuthority/index.js";
import { HarnessErrorCode, ResultStatus } from "../../src/common/index.js";
import { ExecutorCompatibilityReleaseApprovalSubject } from "../../src/domain/executorCompatibilityAttestation/index.js";
import { EnterpriseHttpsExecutorCompatibilityReleaseApprovalAuthorityAdapter } from "../../src/infrastructure/executorCompatibilityReleaseApprovalAuthority/index.js";
import {
  ENTERPRISE_HTTPS_EXECUTOR_COMPATIBILITY_RELEASE_APPROVAL_MAX_RESPONSE_BYTES,
  type EnterpriseHttpsFetch,
} from "../../src/infrastructure/executorCompatibilityReleaseApprovalAuthority/index.js";
import { canonicalizeJson } from "../../src/infrastructure/serialization/index.js";
import {
  createExecutorCompatibilityAttestationFixture,
  withApprovalRecordDigest,
  withDecisionRequestDigest,
} from "../support/executorCompatibility/executorCompatibilityAttestationFixture.js";

const ENDPOINT = "https://authority.example.test/api/release-approval";
const AUTHORITY_ID = "enterprise-release-authority";
const BEARER_TOKEN = "secret-release-token";

describe("Enterprise HTTPS Executor Compatibility Release Approval Authority Adapter", () => {
  it("发送精确的 POST、headers 和 canonical JSON body，并返回绑定回执", async () => {
    const context = await createContext();
    const calls: Array<{ readonly input: string; readonly init: RequestInit | undefined }> = [];
    const fetchImplementation: EnterpriseHttpsFetch = (input, init) => {
      calls.push({ input, init });
      return Promise.resolve(createJsonResponse(context.receipt));
    };
    const adapter = createAdapter(fetchImplementation);

    const result = await adapter.verifyTrustedApproval(context.input);

    expect(result.status).toBe(ResultStatus.Success);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      input: ENDPOINT,
      init: {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${BEARER_TOKEN}`,
        },
        body: canonicalizeJson(context.input),
        redirect: "error",
      },
    });
  });

  it.each([
    ["http endpoint", "http://authority.example.test/approval"],
    ["endpoint credentials", "https://user:password@authority.example.test/approval"],
    ["endpoint query", "https://authority.example.test/approval?mode=release"],
    ["endpoint hash", "https://authority.example.test/approval#release"],
  ])("拒绝 %s 构造参数", (_name, endpoint) => {
    expect(() => createAdapter(undefined, endpoint)).toThrowError(
      expect.objectContaining({ code: HarnessErrorCode.InvalidInput }),
    );
  });

  it.each([
    ["invalid authority", AUTHORITY_ID + " ", BEARER_TOKEN, 1000],
    ["empty token", AUTHORITY_ID, "", 1000],
    ["token whitespace", AUTHORITY_ID, "token with space", 1000],
    ["token control", AUTHORITY_ID, "token\u0000value", 1000],
    ["zero timeout", AUTHORITY_ID, BEARER_TOKEN, 0],
    ["fractional timeout", AUTHORITY_ID, BEARER_TOKEN, 1.5],
  ])("拒绝 %s 构造参数", (_name, authorityId, bearerToken, timeoutMs) => {
    expect(
      () =>
        new EnterpriseHttpsExecutorCompatibilityReleaseApprovalAuthorityAdapter(
          ENDPOINT,
          authorityId,
          bearerToken,
          timeoutMs,
        ),
    ).toThrowError(expect.objectContaining({ code: HarnessErrorCode.InvalidInput }));
  });

  it("在联网前校验 Authority 输入 Schema", async () => {
    let callCount = 0;
    const adapter = createAdapter(() => {
      callCount += 1;
      return Promise.resolve(createJsonResponse({}));
    });

    const result = await adapter.verifyTrustedApproval({
      approvalSubject: "unknown_subject",
      artifactDigest: "not-a-digest",
      unexpected: true,
    } as never);

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.InvalidInput },
    });
    expect(callCount).toBe(0);
  });

  it("使用 URL 校验后的规范 endpoint 发起请求", async () => {
    const context = await createContext();
    let requestedEndpoint = "";
    const adapter = createAdapter((input) => {
      requestedEndpoint = input;
      return Promise.resolve(createJsonResponse(context.receipt));
    }, "https://authority.example.test:443/api/release-approval");

    const result = await adapter.verifyTrustedApproval(context.input);

    expect(result.status).toBe(ResultStatus.Success);
    expect(requestedEndpoint).toBe(ENDPOINT);
  });

  it("超时和响应提前拒绝都会关闭网络资源", async () => {
    const context = await createContext();
    const timeoutAdapter = createAdapter(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("timed out")), {
            once: true,
          });
        }),
      ENDPOINT,
      5,
    );
    const timeoutResult = await timeoutAdapter.verifyTrustedApproval(context.input);
    expect(timeoutResult).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.IoFailure },
    });

    for (const responseCase of [
      createTrackedResponse(200, "application/json", undefined, true),
      createTrackedResponse(200, "application/json", undefined, false, "opaqueredirect"),
      createTrackedResponse(503, "application/json"),
      createTrackedResponse(200, "text/plain"),
      createTrackedResponse(
        200,
        "application/json",
        String(ENTERPRISE_HTTPS_EXECUTOR_COMPATIBILITY_RELEASE_APPROVAL_MAX_RESPONSE_BYTES + 1),
      ),
    ]) {
      const adapter = createAdapter(() => Promise.resolve(responseCase.response));
      const result = await adapter.verifyTrustedApproval(context.input);
      expect(result.status).toBe(ResultStatus.Failure);
      expect(responseCase.wasCancelled()).toBe(true);
    }
  });

  it.each([
    ["redirect", () => Promise.reject(new Error("redirect")), HarnessErrorCode.IoFailure],
    ["5xx", () => Promise.resolve(new Response(null, { status: 503 })), HarnessErrorCode.IoFailure],
    [
      "non-200",
      () => Promise.resolve(createJsonResponse({}, 400)),
      HarnessErrorCode.PreconditionNotMet,
    ],
    [
      "content type",
      () =>
        Promise.resolve(
          new Response("{}", { status: 200, headers: { "content-type": "text/plain" } }),
        ),
      HarnessErrorCode.PreconditionNotMet,
    ],
  ])("拒绝 %s 响应", async (_name, fetchImplementation, expectedCode) => {
    const adapter = createAdapter(fetchImplementation);
    const context = await createContext();

    const result = await adapter.verifyTrustedApproval(context.input);

    expect(result).toMatchObject({ status: ResultStatus.Failure, error: { code: expectedCode } });
  });

  it.each([
    ["empty body", () => new Response(new Uint8Array(), { status: 200, headers: jsonHeaders() })],
    [
      "oversized body",
      () =>
        new Response(
          new Uint8Array(
            ENTERPRISE_HTTPS_EXECUTOR_COMPATIBILITY_RELEASE_APPROVAL_MAX_RESPONSE_BYTES + 1,
          ),
          {
            status: 200,
            headers: jsonHeaders(),
          },
        ),
    ],
    [
      "duplicate key",
      () =>
        new Response('{"authorityId":"a","authorityId":"b"}', {
          status: 200,
          headers: jsonHeaders(),
        }),
    ],
    [
      "BOM",
      () =>
        new Response(new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d]), {
          status: 200,
          headers: jsonHeaders(),
        }),
    ],
    ["invalid schema", () => createJsonResponse({})],
  ])("拒绝 %s 回执", async (_name, responseFactory) => {
    const context = await createContext();
    const adapter = createAdapter(() => Promise.resolve(responseFactory()));

    const result = await adapter.verifyTrustedApproval(context.input);

    expect(result.status).toBe(ResultStatus.Failure);
    expect([HarnessErrorCode.InvalidInput, HarnessErrorCode.PreconditionNotMet]).toContain(
      result.status === ResultStatus.Failure ? result.error.code : undefined,
    );
  });

  it.each([
    [
      "fixed authority mismatch",
      (receipt: ExecutorCompatibilityReleaseApprovalVerificationReceipt) => ({
        ...receipt,
        authorityId: "another-authority",
      }),
    ],
    [
      "subject mismatch",
      (receipt: ExecutorCompatibilityReleaseApprovalVerificationReceipt) => ({
        ...receipt,
        approvalSubject: ExecutorCompatibilityReleaseApprovalSubject.ReleaseManifest,
      }),
    ],
    [
      "digest mismatch",
      (receipt: ExecutorCompatibilityReleaseApprovalVerificationReceipt) => ({
        ...receipt,
        artifactDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      }),
    ],
  ])("拒绝 %s", async (_name, mutate) => {
    const context = await createContext();
    const adapter = createAdapter(() =>
      Promise.resolve(createJsonResponse(mutate(context.receipt))),
    );

    const result = await adapter.verifyTrustedApproval(context.input);

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.PreconditionNotMet },
    });
  });

  it("fetch 抛出含凭据的错误时不泄漏凭据", async () => {
    const context = await createContext();
    const adapter = createAdapter(() => {
      throw new Error(`upstream failed with ${BEARER_TOKEN}`);
    });

    const result = await adapter.verifyTrustedApproval(context.input);

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.IoFailure },
    });
    expect(JSON.stringify(result)).not.toContain(BEARER_TOKEN);
  });
});

async function createContext() {
  const fixture = await createExecutorCompatibilityAttestationFixture();
  const input = {
    approvalSubject: ExecutorCompatibilityReleaseApprovalSubject.ReleaseCandidate,
    artifactDigest: fixture.releaseCandidate.candidateDigest,
  } as const;
  const decisionRequest = withDecisionRequestDigest(fixture.decisionRequest, fixture);
  const approvalRecord = withApprovalRecordDigest(fixture.approvalRecord, fixture);
  const authorityEvidenceDigest = fixture.digest.calculate({
    approvalSubject: input.approvalSubject,
    artifactDigest: input.artifactDigest,
    decisionRequest,
    approvalRecord,
  });
  if (authorityEvidenceDigest.status === ResultStatus.Failure) throw authorityEvidenceDigest.error;
  const receipt = createExecutorCompatibilityReleaseApprovalVerificationReceipt(
    {
      schemaVersion: EXECUTOR_COMPATIBILITY_RELEASE_APPROVAL_VERIFICATION_RECEIPT_SCHEMA_VERSION,
      authorityId: AUTHORITY_ID,
      authorityEvidenceId: "enterprise-evidence-001",
      authorityEvidenceDigest: authorityEvidenceDigest.value,
      approvalSubject: input.approvalSubject,
      artifactDigest: input.artifactDigest,
      decisionRequestDigest: decisionRequest.digest,
      approvalRecordDigest: approvalRecord.digest,
      decisionRequest,
      approvalRecord,
    },
    fixture.digest,
  );
  if (receipt.status === ResultStatus.Failure) throw receipt.error;
  return { fixture, input, receipt: receipt.value };
}

function createAdapter(
  fetchImplementation: EnterpriseHttpsFetch | undefined,
  endpoint = ENDPOINT,
  timeoutMs = 1000,
): EnterpriseHttpsExecutorCompatibilityReleaseApprovalAuthorityAdapter {
  return new EnterpriseHttpsExecutorCompatibilityReleaseApprovalAuthorityAdapter(
    endpoint,
    AUTHORITY_ID,
    BEARER_TOKEN,
    timeoutMs,
    fetchImplementation,
  );
}

function createJsonResponse(value: unknown, status = 200): Response {
  return new Response(canonicalizeJson(value), { status, headers: jsonHeaders() });
}

function jsonHeaders(): Record<string, string> {
  return { "content-type": "application/json" };
}

function createTrackedResponse(
  status: number,
  contentType: string,
  contentLength?: string,
  redirected = false,
  responseType: Response["type"] = "basic",
): { readonly response: Response; readonly wasCancelled: () => boolean } {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([0x7b]));
    },
    cancel() {
      cancelled = true;
    },
  });
  const headers = new Headers({ "content-type": contentType });
  if (contentLength !== undefined) headers.set("content-length", contentLength);
  return {
    response: {
      body,
      headers,
      redirected,
      status,
      type: responseType,
    } as Response,
    wasCancelled: () => cancelled,
  };
}
