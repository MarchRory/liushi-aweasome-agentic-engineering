import { attest } from "sigstore";

import type { SigstoreAttestClient } from "../contracts/index.js";

/** 官方 Sigstore DSSE 签名入口；显式关闭旧 Bundle 兼容模式。 */
export const defaultSigstoreAttestClient: SigstoreAttestClient = (payload, payloadType) =>
  attest(payload, payloadType, { legacyCompatibility: false });
