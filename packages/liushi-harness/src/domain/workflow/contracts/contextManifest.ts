import type { ContentDigest } from "#common/index.js";

import type { ContextSource, TrustChannel } from "../enums/index.js";

/** Context Manifest 中的一条可追溯来源记录。 */
export interface ContextManifestEntry {
  /** 来源类别。 */
  source: ContextSource;
  /** 来源的稳定定位符。 */
  locator: string;
  /** 来源对应的外部或内部 Revision。 */
  revision: string;
  /** 实际来源内容的 SHA-256 摘要。 */
  digest: ContentDigest;
  /** 来源在 Workflow 中适用的范围。 */
  scope: string;
  /** 来源所属的信任通道。 */
  trustLevel: TrustChannel;
  /** 将来源纳入 Context 的确定性选择原因。 */
  selectionReason: string;
  /** 来源被截断时记录的确定性原因。 */
  truncationReason?: string;
}

/** 可重建 Context 的来源清单，不承载运行时 Context 正文。 */
export interface ContextManifest {
  /** 按确定性顺序保存的 Context 来源。 */
  sources: readonly ContextManifestEntry[];
}
