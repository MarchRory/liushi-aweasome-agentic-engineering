import type { BundleWithDsseEnvelope } from "@sigstore/bundle";

import type { ExecutorCompatibilitySigstoreBundleJson } from "#application/executorCompatibilityAttestation/index.js";

/** 官方 Parser 已确认的 DSSE Bundle 与规范 JSON。 */
export interface ValidatedSigstoreAttestationBundle {
  /** 官方 protobuf 类型中的 DSSE Bundle。 */
  readonly bundle: BundleWithDsseEnvelope;
  /** 重新编码后的规范 Sigstore Bundle JSON。 */
  readonly serializedBundle: ExecutorCompatibilitySigstoreBundleJson;
}

/** 隔离官方 Sigstore 联网签名函数的窄客户端契约。 */
export type SigstoreAttestClient = (payload: Buffer, payloadType: string) => Promise<unknown>;
