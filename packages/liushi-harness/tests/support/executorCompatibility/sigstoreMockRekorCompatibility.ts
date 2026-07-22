import { createHash, sign as createSignature, X509Certificate, type KeyObject } from "node:crypto";

import { HashAlgorithm, type TransparencyLogEntry } from "@sigstore/protobuf-specs";
import { Entry, type CreateEntryRequest } from "@sigstore/protobuf-specs/rekor/v2";
import canonicalize from "canonicalize";

/** 官方 Mock 未公开的 Rekor v1 Inclusion Proof 最小契约。 */
interface SigstoreMockRekorV1InclusionProof {
  checkpoint: string;
  hashes: string[];
  logIndex: number;
  rootHash: string;
  treeSize: number;
}

/** 官方 Mock 未公开的 Rekor v1 Verification 最小契约。 */
interface SigstoreMockRekorV1Verification {
  inclusionProof?: SigstoreMockRekorV1InclusionProof;
  signedEntryTimestamp?: string;
}

/** 官方 Mock 未公开的 Rekor v1 Entry 最小契约。 */
interface SigstoreMockRekorV1Entry {
  body: string;
  integratedTime: number;
  logID: string;
  logIndex: number;
  verification?: SigstoreMockRekorV1Verification;
}

/** 官方 Mock 未公开的 Rekor v1 Log 响应最小契约。 */
type SigstoreMockRekorV1Log = Record<string, SigstoreMockRekorV1Entry>;

/** 测试兼容层实际消费的官方 Transparency Log 最小端口。 */
interface SigstoreMockTLog {
  publicKey: Buffer;
  log(proposedEntry: object): Promise<SigstoreMockRekorV1Log>;
  logV2(proposedEntry: CreateEntryRequest): Promise<TransparencyLogEntry>;
}

/** 修正官方 Mock 的单叶索引，并将 Rekor 请求规范化为真实持久化 Entry。 */
export function createSingleEntrySigstoreMockTLog(
  tlog: SigstoreMockTLog,
  privateKey: KeyObject,
): SigstoreMockTLog {
  return {
    publicKey: tlog.publicKey,
    log: async (request) => {
      const logged = await tlog.log(createCanonicalRekorV1Entry(request));
      return normalizeSingleEntryRekorV1Response(logged, privateKey);
    },
    logV2: async (request) => {
      const canonicalEntry = createCanonicalRekorV2Entry(request);
      const logged = await tlog.logV2(canonicalEntry as Parameters<typeof tlog.logV2>[0]);
      if (logged.inclusionProof === undefined) {
        throw new Error("Sigstore mock Rekor v2 缺少 Inclusion Proof。");
      }
      return {
        ...logged,
        logIndex: "0",
        inclusionProof: {
          ...logged.inclusionProof,
          logIndex: "0",
        },
      };
    },
  };
}

function createCanonicalRekorV1Entry(request: object): object {
  const spec = readRecord(request, "spec");
  const proposedContent = readRecord(spec, "proposedContent");
  const envelopeText = readString(proposedContent, "envelope");
  const verifiers = readStringArray(proposedContent, "verifiers");
  const envelope = parseJsonRecord(envelopeText);
  const payload = readString(envelope, "payload");
  const signatures = readRecordArray(envelope, "signatures");
  if (signatures.length !== 1 || verifiers.length !== 1) {
    throw new Error("测试 Rekor v1 只接受单一 DSSE 签名和 Verifier。");
  }
  const signature = signatures[0];
  const verifier = verifiers[0];
  if (signature === undefined || verifier === undefined) {
    throw new Error("测试 Rekor v1 缺少 DSSE 签名或 Verifier。");
  }
  const canonicalVerifier = new X509Certificate(Buffer.from(verifier, "base64")).raw.toString(
    "base64",
  );
  return {
    apiVersion: "0.0.1",
    kind: "dsse",
    spec: {
      signatures: [{ signature: readString(signature, "sig"), verifier: canonicalVerifier }],
      envelopeHash: {
        algorithm: "sha256",
        value: sha256Hex(Buffer.from(envelopeText, "utf8")),
      },
      payloadHash: {
        algorithm: "sha256",
        value: sha256Hex(Buffer.from(payload, "base64")),
      },
    },
  };
}

function normalizeSingleEntryRekorV1Response(
  response: Awaited<ReturnType<SigstoreMockTLog["log"]>>,
  privateKey: KeyObject,
): Awaited<ReturnType<SigstoreMockTLog["log"]>> {
  const entryIds = Object.keys(response);
  if (entryIds.length !== 1) {
    throw new Error("Sigstore mock Rekor v1 必须返回单一 Entry。");
  }
  const entryId = entryIds[0];
  const entry = entryId === undefined ? undefined : response[entryId];
  if (
    entry === undefined ||
    entry.verification?.inclusionProof === undefined ||
    entry.verification.signedEntryTimestamp === undefined
  ) {
    throw new Error("Sigstore mock Rekor v1 缺少 SET 或 Inclusion Proof。");
  }
  entry.logIndex = 0;
  entry.verification.inclusionProof.logIndex = 0;
  const payload = canonicalize({
    body: entry.body,
    integratedTime: entry.integratedTime,
    logIndex: entry.logIndex,
    logID: entry.logID,
  });
  if (payload === undefined) {
    throw new Error("Sigstore mock Rekor v1 无法规范化 SET Payload。");
  }
  entry.verification.signedEntryTimestamp = createSignature(
    "sha256",
    Buffer.from(payload, "utf8"),
    privateKey,
  ).toString("base64");
  return response;
}

function createCanonicalRekorV2Entry(request: CreateEntryRequest): unknown {
  if (request.spec?.$case !== "dsseRequestV002") {
    throw new Error("测试 Rekor v2 只接受 DSSE v0.0.2 创建请求。");
  }
  const { envelope, verifiers } = request.spec.dsseRequestV002;
  if (envelope === undefined || envelope.signatures.length !== verifiers.length) {
    throw new Error("测试 Rekor v2 DSSE 签名与 Verifier 数量不一致。");
  }
  const signatures = envelope.signatures.map((signature, index) => {
    const verifier = verifiers[index];
    if (verifier === undefined) {
      throw new Error("测试 Rekor v2 DSSE 缺少签名 Verifier。");
    }
    return {
      content: signature.sig,
      verifier,
    };
  });
  return Entry.toJSON({
    kind: "dsse",
    apiVersion: "0.0.2",
    spec: {
      spec: {
        $case: "dsseV002",
        dsseV002: {
          payloadHash: {
            algorithm: HashAlgorithm.SHA2_256,
            digest: createHash("sha256").update(envelope.payload).digest(),
          },
          signatures,
        },
      },
    },
  });
}

function parseJsonRecord(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("测试 Rekor DSSE Envelope 不是 JSON 对象。");
  }
  return parsed as Record<string, unknown>;
}

function readRecord(parent: object, key: string): Record<string, unknown> {
  const value = Reflect.get(parent, key) as unknown;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`测试 Rekor 字段 ${key} 不是对象。`);
  }
  return value as Record<string, unknown>;
}

function readRecordArray(parent: object, key: string): readonly Record<string, unknown>[] {
  const value = Reflect.get(parent, key) as unknown;
  if (
    !Array.isArray(value) ||
    value.some((entry) => entry === null || typeof entry !== "object" || Array.isArray(entry))
  ) {
    throw new Error(`测试 Rekor 字段 ${key} 不是对象数组。`);
  }
  return value as readonly Record<string, unknown>[];
}

function readString(parent: object, key: string): string {
  const value = Reflect.get(parent, key) as unknown;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`测试 Rekor 字段 ${key} 不是非空字符串。`);
  }
  return value;
}

function readStringArray(parent: object, key: string): readonly string[] {
  const value = Reflect.get(parent, key) as unknown;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`测试 Rekor 字段 ${key} 不是字符串数组。`);
  }
  return value as readonly string[];
}

function sha256Hex(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
