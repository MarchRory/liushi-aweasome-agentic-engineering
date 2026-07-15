import {
  ManagedFileActualKind,
  type ManagedFileContentSnapshot,
  type ManagedFileMetadata,
  type ManagedFileOriginalState,
  type PersistedManagedFileState,
} from "#domain/installation/index.js";

import { persistedEntrySchema } from "../schemas/index.js";

/** 将不可信 Manifest Claim 严格解析为可比较值；非法 Claim 不产生 Store 错误。 */
export function parseManagedOwnershipClaim(input: unknown): PersistedManagedFileState | undefined {
  const parsed = persistedEntrySchema.safeParse(input);
  return parsed.success ? (parsed.data as unknown as PersistedManagedFileState) : undefined;
}

/** 比较 ownership 授权要求的全部字段，provenance 仅表示验证结果而非身份。 */
export function hasSameManagedOwnershipFields(
  claim: PersistedManagedFileState,
  authoritative: PersistedManagedFileState,
): boolean {
  return (
    claim.repositoryId === authoritative.repositoryId &&
    claim.installationRevisionId === authoritative.installationRevisionId &&
    claim.installPlanDigest === authoritative.installPlanDigest &&
    claim.path === authoritative.path &&
    claim.lastAppliedDigest === authoritative.lastAppliedDigest &&
    hasSameOriginal(claim.original, authoritative.original) &&
    hasSameMetadata(claim.metadata, authoritative.metadata)
  );
}

/** 比较包含 provenance 的完整持久化 Manifest 条目。 */
export function hasSamePersistedEntry(
  left: PersistedManagedFileState,
  right: PersistedManagedFileState,
): boolean {
  return left.provenance === right.provenance && hasSameManagedOwnershipFields(left, right);
}

/** 将 preimage 快照转换为 Manifest 使用的 original 状态。 */
export function originalFromSnapshot(
  snapshot: ManagedFileContentSnapshot,
): ManagedFileOriginalState {
  return snapshot.kind === ManagedFileActualKind.Missing
    ? { kind: ManagedFileActualKind.Missing }
    : { kind: ManagedFileActualKind.RegularFile, digest: snapshot.digest };
}

/** 比较 original 状态的 kind 与可选摘要。 */
export function hasSameOriginal(
  left: ManagedFileOriginalState,
  right: ManagedFileOriginalState,
): boolean {
  return left.kind === right.kind && left.digest === right.digest;
}

/** 比较受管文件来源元数据的全部字段。 */
export function hasSameMetadata(left: ManagedFileMetadata, right: ManagedFileMetadata): boolean {
  return (
    left.ownerPackage === right.ownerPackage &&
    left.profile === right.profile &&
    left.packageVersion === right.packageVersion &&
    left.template === right.template &&
    left.source === right.source &&
    left.sourceDigest === right.sourceDigest
  );
}
