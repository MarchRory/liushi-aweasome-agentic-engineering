import { createHash, generateKeyPairSync } from "node:crypto";

import {
  fulcioHandler,
  initializeCA,
  initializeCTLog,
  initializeTLog,
  initializeTSA,
  rekorHandler,
  rekorV2Handler,
  tsaHandler,
  type HandlerFn,
} from "@sigstore/mock";
import { bundleToJSON } from "@sigstore/bundle";
import {
  HashAlgorithm,
  PublicKeyDetails,
  TrustedRoot,
  type TransparencyLogInstance,
} from "@sigstore/protobuf-specs";
import { DSSEBundleBuilder, FulcioSigner, RekorWitness, TSAWitness } from "@sigstore/sign";
import nock from "nock";
import { attest } from "sigstore";

import type { ExecutorCompatibilityTrustedRootJson } from "../../../src/application/index.js";
import type { SigstoreAttestClient } from "../../../src/infrastructure/executorCompatibilityAttestation/index.js";

import type { ExecutorCompatibilityAttestationFixture } from "./executorCompatibilityAttestationFixture.js";
import { createSingleEntrySigstoreMockTLog } from "./sigstoreMockRekorCompatibility.js";

const FULCIO_BASE_URL = "https://fulcio.liushi-harness.test";
const REKOR_BASE_URL = "https://rekor.liushi-harness.test";
const TSA_BASE_URL = "https://tsa.liushi-harness.test";
const SIGSTORE_OPERATOR = "liushi-harness.test";

/** 本地集成测试覆盖的 Sigstore 时间戳与 Rekor 协议模式。 */
export enum SigstoreAttestationTestMode {
  /** 与默认 `sigstore.attest` 一致的 Rekor v1 Inclusion Promise。 */
  DefaultRekorV1 = "default_rekor_v1",
  /** Rekor v2 Inclusion Proof 与独立 RFC 3161 TSA。 */
  RekorV2WithTsa = "rekor_v2_with_tsa",
}

/** 官方 Sigstore mock 驱动的本地签名与显式信任根测试环境。 */
export interface SigstoreAttestationTestEnvironment {
  /** 只访问本地 nock 端点的官方 sigstore-js Attest 客户端。 */
  readonly attestClient: SigstoreAttestClient;
  /** 与本地 CA、CT Log 和 Rekor 密钥严格对应的 Trusted Root v0.2。 */
  readonly trustedRoot: ExecutorCompatibilityTrustedRootJson;
  /** 确认签名请求均已消费并禁用全部网络连接。 */
  readonly disconnectSigningServices: () => void;
  /** 清理网络拦截并恢复测试进程的网络策略。 */
  readonly restore: () => void;
}

/** 创建不依赖真实 OIDC、Fulcio 或 Rekor 服务的密码学集成测试环境。 */
export async function createSigstoreAttestationTestEnvironment(
  fixture: ExecutorCompatibilityAttestationFixture,
  mode: SigstoreAttestationTestMode,
): Promise<SigstoreAttestationTestEnvironment> {
  nock.cleanAll();
  nock.enableNetConnect();

  const caKeyPair = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const tlogKeyPair = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const tsaKeyPair = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const signingTime = new Date(Date.now() + 60_000);
  const ctlog = await initializeCTLog(caKeyPair, signingTime);
  const ca = await initializeCA(caKeyPair, ctlog, signingTime);
  const tlog = await initializeTLog(REKOR_BASE_URL, tlogKeyPair, signingTime);
  const tsa = await initializeTSA(tsaKeyPair, signingTime);
  const singleEntryTlog = createSingleEntrySigstoreMockTLog(tlog, tlogKeyPair.privateKey);
  const fulcioScope = bindSigstoreHandler(FULCIO_BASE_URL, fulcioHandler(ca, { strict: true }));
  const rekorScope = bindSigstoreHandler(
    REKOR_BASE_URL,
    mode === SigstoreAttestationTestMode.DefaultRekorV1
      ? rekorHandler(singleEntryTlog, { strict: true })
      : rekorV2Handler(singleEntryTlog, { strict: true }),
  );
  const tsaScope =
    mode === SigstoreAttestationTestMode.RekorV2WithTsa
      ? bindSigstoreHandler(TSA_BASE_URL, tsaHandler(tsa, { strict: true }))
      : undefined;
  const identityToken = createUnsignedIdentityToken(fixture);
  const trustedRoot = createTrustedRootJson(
    ca.rootCertificate,
    ctlog,
    tlog.publicKey,
    tsa.intCertificate,
    tsa.rootCertificate,
  );
  const signingScopes =
    tsaScope === undefined ? [fulcioScope, rekorScope] : [fulcioScope, rekorScope, tsaScope];

  return {
    attestClient:
      mode === SigstoreAttestationTestMode.DefaultRekorV1
        ? (payload, payloadType) =>
            attest(payload, payloadType, {
              fulcioURL: FULCIO_BASE_URL,
              identityToken,
              legacyCompatibility: false,
              rekorURL: REKOR_BASE_URL,
              retry: { retries: 0 },
              timeout: 2_000,
            })
        : async (payload, payloadType) => {
            const builder = new DSSEBundleBuilder({
              certificateChain: false,
              signer: new FulcioSigner({
                fulcioBaseURL: FULCIO_BASE_URL,
                identityProvider: {
                  getToken: () => Promise.resolve(identityToken),
                },
                retry: { retries: 0 },
                timeout: 2_000,
              }),
              witnesses: [
                new RekorWitness({
                  entryType: "dsse",
                  majorApiVersion: 2,
                  rekorBaseURL: REKOR_BASE_URL,
                  retry: { retries: 0 },
                  timeout: 2_000,
                }),
                new TSAWitness({
                  retry: { retries: 0 },
                  timeout: 2_000,
                  tsaBaseURL: TSA_BASE_URL,
                }),
              ],
            });
            const bundle = await builder.create({ data: payload, type: payloadType });
            return bundleToJSON(bundle);
          },
    trustedRoot,
    disconnectSigningServices: () => {
      if (!signingScopes.every((scope) => scope.isDone())) {
        throw new Error(`Sigstore mock 请求未消费：${nock.pendingMocks().join(", ")}`);
      }
      nock.cleanAll();
      nock.disableNetConnect();
    },
    restore: () => {
      nock.cleanAll();
      nock.enableNetConnect();
    },
  };
}

function bindSigstoreHandler(baseUrl: string, handler: Readonly<{ path: string; fn: HandlerFn }>) {
  return nock(baseUrl)
    .post(handler.path)
    .reply(async (_uri, body) => {
      const result = await handler.fn(serializeRequestBody(body));
      const response =
        typeof result.response === "string"
          ? result.response
          : Buffer.from(
              result.response.buffer,
              result.response.byteOffset,
              result.response.byteLength,
            );
      return [
        result.statusCode,
        response,
        result.contentType === undefined ? {} : { "Content-Type": result.contentType },
      ];
    });
}

function serializeRequestBody(body: nock.Body): string {
  return typeof body === "string" ? body : JSON.stringify(body);
}

function createUnsignedIdentityToken(fixture: ExecutorCompatibilityAttestationFixture): string {
  const workflowIdentity = fixture.publisherIdentityPolicy.certificateIdentity.value;
  const workflowReferencePrefix = "https://github.com/";
  if (!workflowIdentity.startsWith(workflowReferencePrefix)) {
    throw new Error("测试 Workflow Identity 必须使用 GitHub URI。");
  }
  const repository = new URL(fixture.releaseSubject.repositoryUri).pathname.replace(/^\/+/u, "");
  const claims = {
    sub: workflowIdentity,
    iss: fixture.publisherIdentityPolicy.certificateIssuer,
    repository,
    sha: fixture.releaseSubject.sourceRevision,
    job_workflow_ref: workflowIdentity.slice(workflowReferencePrefix.length),
    runner_environment: "github-hosted",
  };
  return [encodeJwtSegment({ alg: "none", typ: "JWT" }), encodeJwtSegment(claims), ""].join(".");
}

function encodeJwtSegment(value: Readonly<Record<string, string>>): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function createTrustedRootJson(
  rootCertificate: ArrayBufferView<ArrayBuffer>,
  ctlog: Readonly<{ publicKey: Buffer; logID: ArrayBufferView<ArrayBuffer> }>,
  tlogPublicKey: Buffer,
  tsaIntermediateCertificate: ArrayBufferView<ArrayBuffer>,
  tsaRootCertificate: ArrayBufferView<ArrayBuffer>,
): ExecutorCompatibilityTrustedRootJson {
  const root = TrustedRoot.toJSON({
    mediaType: "application/vnd.dev.sigstore.trustedroot.v0.2+json",
    tlogs: [
      createTransparencyLogInstance(
        REKOR_BASE_URL,
        tlogPublicKey,
        createHash("sha256").update(tlogPublicKey).digest(),
      ),
    ],
    certificateAuthorities: [
      {
        subject: {
          organization: "sigstore",
          commonName: "sigstore.mock",
        },
        uri: FULCIO_BASE_URL,
        certChain: {
          certificates: [{ rawBytes: copyArrayBufferView(rootCertificate) }],
        },
        validFor: undefined,
        operator: SIGSTORE_OPERATOR,
      },
    ],
    ctlogs: [
      createTransparencyLogInstance(
        FULCIO_BASE_URL,
        ctlog.publicKey,
        copyArrayBufferView(ctlog.logID),
      ),
    ],
    timestampAuthorities: [
      {
        subject: {
          organization: "sigstore",
          commonName: "tsa.mock",
        },
        uri: TSA_BASE_URL,
        certChain: {
          certificates: [
            { rawBytes: copyArrayBufferView(tsaIntermediateCertificate) },
            { rawBytes: copyArrayBufferView(tsaRootCertificate) },
          ],
        },
        validFor: undefined,
        operator: SIGSTORE_OPERATOR,
      },
    ],
  });
  if (!isJsonObject(root) || typeof root["mediaType"] !== "string") {
    throw new Error("Sigstore Trusted Root 无法编码为 JSON 对象。");
  }
  return root as ExecutorCompatibilityTrustedRootJson;
}

function createTransparencyLogInstance(
  baseUrl: string,
  publicKey: Buffer,
  logId: Buffer,
): TransparencyLogInstance {
  return {
    baseUrl,
    hashAlgorithm: HashAlgorithm.SHA2_256,
    publicKey: {
      rawBytes: publicKey,
      keyDetails: PublicKeyDetails.PKIX_ECDSA_P256_SHA_256,
      validFor: undefined,
    },
    logId: { keyId: logId },
    checkpointKeyId: undefined,
    operator: SIGSTORE_OPERATOR,
  };
}

function copyArrayBufferView(value: ArrayBufferView<ArrayBuffer>): Buffer {
  return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
}

function isJsonObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
