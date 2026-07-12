import type { ArtifactDigest, ArtifactId, ArtifactType } from "#domain/artifact/index.js";

/** 一个 Workflow 输入与上游 Artifact Revision 的显式绑定。 */
export interface InputBinding {
  /** Workflow 输入的稳定键。 */
  inputKey: string;
  /** 被绑定 Artifact 的稳定标识。 */
  artifactId: ArtifactId;
  /** 被绑定 Artifact 的封闭类型。 */
  artifactType: ArtifactType;
  /** 被绑定的 Artifact Revision 编号。 */
  revision: number;
  /** 被绑定 Revision 的内容摘要。 */
  digest: ArtifactDigest;
}

/** Workflow 当前所有输入绑定的显式集合。 */
export interface InputBindingSet {
  /** 按输入键稳定排序前的声明顺序保存绑定。 */
  bindings: readonly InputBinding[];
}
