import { BUNDLE_V03_MEDIA_TYPE } from "@sigstore/bundle";

/** P3b 只接受可由官方 Verifier 关闭式验证的 Sigstore Bundle v0.3。 */
export const SIGSTORE_BUNDLE_V03_MEDIA_TYPE = BUNDLE_V03_MEDIA_TYPE;

/** P3b 只接受调用方通过受信通道提供的 Trusted Root v0.2。 */
export const SIGSTORE_TRUSTED_ROOT_V02_MEDIA_TYPE =
  "application/vnd.dev.sigstore.trustedroot.v0.2+json";
