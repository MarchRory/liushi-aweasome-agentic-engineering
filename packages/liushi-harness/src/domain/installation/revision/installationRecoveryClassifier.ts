import type {
  FileInstallPlan,
  InstallationRevisionIntent,
  ManagedFileContentSnapshot,
  ManagedManifestSnapshot,
} from "../contracts/index.js";
import {
  FileInstallAction,
  InstallationRecoveryDisposition,
  ManagedFileActualKind,
  ManagedManifestState,
} from "../enums/index.js";

/** 根据持久化 Intent 与现场摘要确定唯一安全的恢复处置。 */
export function classifyInstallationRecovery(
  intent: InstallationRevisionIntent,
  observedFiles: readonly ManagedFileContentSnapshot[],
  observedManifest: ManagedManifestSnapshot,
): InstallationRecoveryDisposition {
  const writableFiles = intent.plan.files.filter(isWritableFile);
  const writablePaths = new Set(writableFiles.map((file) => file.path));
  if (writablePaths.size !== writableFiles.length)
    return InstallationRecoveryDisposition.HumanRequired;
  const preimages = indexSnapshots(intent.preimages, writablePaths);
  const observed = indexSnapshots(observedFiles, writablePaths);
  if (preimages === undefined || observed === undefined)
    return InstallationRecoveryDisposition.HumanRequired;

  const matches = writableFiles.map((file) => {
    const preimage = preimages.get(file.path);
    const current = observed.get(file.path);
    return {
      before: preimage !== undefined && current !== undefined && sameFileState(current, preimage),
      desired:
        current?.kind === ManagedFileActualKind.RegularFile &&
        current.digest === file.desired.digest,
    };
  });
  if (matches.some((match) => !match.before && !match.desired))
    return InstallationRecoveryDisposition.HumanRequired;

  const allBefore = matches.every((match) => match.before);
  const allDesired = matches.every((match) => match.desired);
  const manifestBefore = sameManifestState(observedManifest, intent.plan.manifest);
  const manifestAfter =
    observedManifest.state === ManagedManifestState.Present &&
    observedManifest.digest === intent.manifestAfter.digest;

  if (allBefore && manifestBefore) return InstallationRecoveryDisposition.RestartPermitted;
  if (allDesired && manifestAfter) return InstallationRecoveryDisposition.Complete;
  if (manifestAfter && !allDesired) return InstallationRecoveryDisposition.HumanRequired;
  if (manifestBefore) return InstallationRecoveryDisposition.RollbackPermitted;
  return InstallationRecoveryDisposition.HumanRequired;
}

function isWritableFile(file: FileInstallPlan): boolean {
  return file.action === FileInstallAction.Create || file.action === FileInstallAction.Update;
}

function indexSnapshots(
  snapshots: readonly ManagedFileContentSnapshot[],
  writablePaths: ReadonlySet<string>,
): ReadonlyMap<string, ManagedFileContentSnapshot> | undefined {
  const indexed = new Map<string, ManagedFileContentSnapshot>();
  for (const snapshot of snapshots) {
    if (!writablePaths.has(snapshot.path)) continue;
    if (indexed.has(snapshot.path)) return undefined;
    indexed.set(snapshot.path, snapshot);
  }
  return indexed;
}

function sameFileState(
  left: ManagedFileContentSnapshot,
  right: ManagedFileContentSnapshot,
): boolean {
  if (left.kind !== right.kind) return false;
  return (
    left.kind === ManagedFileActualKind.Missing ||
    (right.kind === ManagedFileActualKind.RegularFile && left.digest === right.digest)
  );
}

function sameManifestState(left: ManagedManifestSnapshot, right: ManagedManifestSnapshot): boolean {
  if (left.state !== right.state) return false;
  return (
    left.state === ManagedManifestState.Missing ||
    (right.state === ManagedManifestState.Present && left.digest === right.digest)
  );
}
