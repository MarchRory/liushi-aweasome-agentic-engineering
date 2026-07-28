import type { ARTIFACT_SCHEMA_VERSION, ActorRef } from "#common/index.js";
import type { TaskId } from "#domain/task/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";

import type { ArtifactDigest } from "../digest/index.js";
import type { ArtifactStatus, ArtifactType } from "../enums/index.js";
import type { ArtifactId } from "../identity/index.js";

/** Artifact Envelope 瀵?Payload 鍙婂叾韬唤銆佺増鏈€佹潵婧愬拰鎽樿鐨勭粦瀹氥€?*/
export interface ArtifactEnvelope<TType extends ArtifactType, TPayload> {
  /** Artifact Envelope Schema Version銆?*/
  schemaVersion: typeof ARTIFACT_SCHEMA_VERSION;
  /** Artifact 鐨勭ǔ瀹?ULID銆?*/
  artifactId: ArtifactId;
  /** Artifact Payload 鐨勫皝闂被鍨嬨€?*/
  artifactType: TType;
  /** Artifact 鎵€灞?Workspace銆?*/
  workspaceId: WorkspaceId;
  /** Artifact 鎵€灞?Task銆?*/
  taskId: TaskId;
  /** 鍚屼竴 Artifact 鍐呬弗鏍奸€掑鐨?Revision銆?*/
  revision: number;
  /** 涓婁竴涓?Revision 鐨?Digest锛涢涓?Revision 涓嶅瓨鍦ㄣ€?*/
  parentDigest?: ArtifactDigest;
  /** Artifact 褰撳墠鐢熷懡鍛ㄦ湡鐘舵€併€?*/
  status: ArtifactStatus;
  /** Artifact Revision 鍒涘缓鏃堕棿鐨?ISO 8601 UTC 瀛楃涓层€?*/
  createdAt: string;
  /** 鍒涘缓璇?Artifact Revision 鐨?Human銆丄gent 鎴?System Actor銆?*/
  createdBy: ActorRef;
  /** 创建该 Artifact Proposal 时由调用方提供的稳定幂等键。 */
  proposalIdempotencyKey?: string;
  /** Artifact 瑙勮寖鍖栧唴瀹圭殑 SHA-256 Digest銆?*/
  digest: ArtifactDigest;
  /** Artifact 鎵胯浇鐨勪弗鏍?Payload銆?*/
  payload: TPayload;
}

/** 璺?Artifact 寮曠敤鎵€闇€鐨勬渶灏忕ǔ瀹氫俊鎭€?*/
export interface ArtifactReference {
  /** 琚紩鐢?Artifact 鐨勭ǔ瀹?ULID銆?*/
  artifactId: ArtifactId;
  /** 琚紩鐢?Artifact 鐨勫皝闂被鍨嬨€?*/
  artifactType: ArtifactType;
  /** 琚紩鐢?Artifact 鐨?Revision銆?*/
  revision: number;
  /** 琚紩鐢?Artifact 鐨勭敓鍛藉懆鏈熺姸鎬併€?*/
  status: ArtifactStatus;
  /** 琚紩鐢?Artifact 鐨?SHA-256 Digest銆?*/
  digest: ArtifactDigest;
}
