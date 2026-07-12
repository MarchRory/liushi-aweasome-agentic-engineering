import type { ArtifactDigest, ArtifactId, ArtifactType } from "#domain/artifact/index.js";

/** 当前 Workflow 可见的单个 Artifact 有效 Revision。 */
export interface EffectiveRevision {
  /** Artifact 的稳定标识。 */
  artifactId: ArtifactId;
  /** Artifact 的封闭类型。 */
  artifactType: ArtifactType;
  /** Artifact 的单调 Revision 编号。 */
  revision: number;
  /** 当前 Revision 的内容摘要。 */
  digest: ArtifactDigest;
}

/** Workflow 当前显式选择的全部有效 Revision。 */
export interface EffectiveRevisionSet {
  /** 按稳定输入顺序保存的有效 Revision。 */
  revisions: readonly EffectiveRevision[];
}
