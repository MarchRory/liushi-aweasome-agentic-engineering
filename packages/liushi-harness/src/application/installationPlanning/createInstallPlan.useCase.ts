import type { Clock, IdGenerator, Result } from "#common/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type HarnessError as HarnessErrorType,
} from "#common/index.js";
import {
  INSTALL_PLAN_SCHEMA_VERSION,
  calculateInstallPlanDigest,
  compareManagedFilePath,
  ManagedFileGateId,
  parseInstallPlanId,
  planManagedFile,
  type InstallPlan,
} from "#domain/installation/index.js";
import type {
  ContentDigestPort,
  InstallPlanStore,
  InstallProfileProjector,
  ManagedFileStateReader,
} from "#application/ports/index.js";
import type { CreateInstallPlanInput, CreateInstallPlanOutput } from "./contracts/index.js";
import { validateCreateInstallPlanInput } from "./validation/index.js";

/** 生成、摘要并持久化只读安装计划的 Application Use Case。 */
export class CreateInstallPlanUseCase {
  /** 构造安装规划所需的单职责 Ports。 */
  public constructor(
    private readonly reader: ManagedFileStateReader,
    private readonly projector: InstallProfileProjector,
    private readonly store: InstallPlanStore,
    private readonly digest: ContentDigestPort,
    private readonly clock: Clock,
    private readonly idGenerator: IdGenerator,
  ) {}

  /** 读取现场、规划文件并仅写 Runtime Store。 */
  public async execute(
    input: CreateInstallPlanInput,
  ): Promise<Result<CreateInstallPlanOutput, HarnessErrorType>> {
    const valid = validateCreateInstallPlanInput(input);
    if (valid.status === ResultStatus.Failure) return valid;
    const resolvedRoot = await this.reader.resolveRoot(valid.value.root);
    if (resolvedRoot.status === ResultStatus.Failure) return resolvedRoot;
    const isolated = await this.store.validateRepositoryIsolation(resolvedRoot.value);
    if (isolated.status === ResultStatus.Failure) return isolated;
    const desired = this.projector.project(valid.value.target);
    if (desired.status === ResultStatus.Failure) return desired;
    const manifest = await this.reader.readManifest(resolvedRoot.value);
    if (manifest.status === ResultStatus.Failure) return manifest;
    const desiredByIdentity = new Map<string, (typeof desired.value)[number]>();
    for (const file of desired.value) {
      const identity = this.reader.identifyPath(file.path);
      if (desiredByIdentity.has(identity))
        return failure(
          new HarnessError(
            HarnessErrorCode.InvalidInput,
            "Install profile contains duplicate managed path identities.",
            { path: file.path },
          ),
        );
      desiredByIdentity.set(identity, file);
    }
    const manifestByIdentity = new Map<string, (typeof manifest.value.entries)[number]>();
    for (const entry of manifest.value.entries) {
      const identity = this.reader.identifyPath(entry.path);
      if (manifestByIdentity.has(identity))
        return failure(
          new HarnessError(
            HarnessErrorCode.CorruptStore,
            "Managed file manifest contains duplicate platform path identities.",
            { path: entry.path },
          ),
        );
      manifestByIdentity.set(identity, entry);
    }
    const files = [];
    for (const file of [...desired.value].sort((left, right) =>
      compareManagedFilePath(left.path, right.path),
    )) {
      const actual = await this.reader.readActual(resolvedRoot.value, file.path);
      if (actual.status === ResultStatus.Failure) return actual;
      const persisted = manifestByIdentity.get(this.reader.identifyPath(file.path));
      if (persisted !== undefined && persisted.path !== file.path)
        return failure(
          new HarnessError(
            HarnessErrorCode.CorruptStore,
            "Managed file manifest path casing does not match the active profile.",
            { path: persisted.path },
          ),
        );
      const planned = planManagedFile(file, actual.value, persisted);
      if (planned.status === ResultStatus.Failure) return planned;
      files.push(planned.value);
    }
    let planId;
    try {
      planId = parseInstallPlanId(this.idGenerator.next());
    } catch (error) {
      return failure(
        new HarnessError(HarnessErrorCode.IoFailure, "InstallPlan ID generator failed.", {}, error),
      );
    }
    if (planId.status === ResultStatus.Failure) return planId;
    const base = {
      schemaVersion: INSTALL_PLAN_SCHEMA_VERSION,
      planId: planId.value,
      workspaceId: valid.value.workspaceId,
      repositoryId: valid.value.repositoryId,
      root: resolvedRoot.value,
      target: valid.value.target,
      createdAt: this.clock.now().toISOString(),
      createdBy: valid.value.actorId,
      requiredGate: ManagedFileGateId.G0ManagedFiles,
      files,
    } satisfies Omit<InstallPlan, "planDigest">;
    const planDigest = calculateInstallPlanDigest((value) => this.digest.calculate(value), base);
    if (planDigest.status === ResultStatus.Failure) return planDigest;
    const plan: InstallPlan = { ...base, planDigest: planDigest.value };
    const persisted = await this.store.save(plan);
    return persisted.status === ResultStatus.Failure
      ? persisted
      : success({ plan: persisted.value, repositoryMutated: false, planPersisted: true });
  }
}
