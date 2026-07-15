import {
  InstallationRevisionReservationDisposition,
  type ContentDigestPort,
  type InstallationRevisionStore,
  type ManagedFileMutationPort,
  type ManagedFileStateReader,
} from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Clock,
  type IdGenerator,
  type Result,
} from "#common/index.js";
import {
  InstallationApplyDisposition,
  InstallationRecoveryDisposition,
  ManagedFileGateId,
  classifyInstallationRecovery,
  parseInstallationRevisionId,
  type InstallPlan,
  type InstallationRevisionState,
} from "#domain/installation/index.js";

import type { ApplyInstallPlanOutput, ValidatedApplyInstallPlanInput } from "../contracts/index.js";
import { executeFreshInstallationRevision } from "../execution/index.js";
import { createInstallationApplyOutput } from "../factory/index.js";
import {
  completeInstallationRevision,
  isCommittedInstallationRevisionState,
  readInstallationRecoveryState,
  validateInstallationRestartPreflight,
} from "../recovery/index.js";
import { runInstallationPreflight } from "../preflight/index.js";
import { createManagedManifestProjection } from "../projection/index.js";

/** 编排已持锁的 InstallPlan 校验、Revision 预留和执行/恢复路径。 */
export class InstallationApplyService {
  public constructor(
    private readonly revisionStore: InstallationRevisionStore,
    private readonly reader: ManagedFileStateReader,
    private readonly mutation: ManagedFileMutationPort,
    private readonly digest: ContentDigestPort,
    private readonly clock: Clock,
    private readonly revisionIdGenerator: IdGenerator,
  ) {}

  /** 在外层 Repository Lock 已持有时执行 Apply。 */
  public async execute(
    plan: InstallPlan,
    approval: ValidatedApplyInstallPlanInput,
  ): Promise<Result<ApplyInstallPlanOutput, HarnessError>> {
    const existing = await this.revisionStore.findByApproval(approval);
    if (existing.status === ResultStatus.Failure) return existing;
    if (existing.value !== undefined) return this.handleExisting(existing.value, plan);

    const root = await this.reader.resolveRoot(plan.root);
    if (root.status === ResultStatus.Failure) return root;
    if (root.value !== plan.root)
      return failure(
        new HarnessError(
          HarnessErrorCode.PreconditionNotMet,
          "Repository root identity changed after InstallPlan creation.",
          { planId: plan.planId },
        ),
      );
    const preflight = await runInstallationPreflight(plan, this.reader);
    if (preflight.status === ResultStatus.Failure) return preflight;
    const revisionId = this.createRevisionId();
    if (revisionId.status === ResultStatus.Failure) return revisionId;
    const manifestAfter = createManagedManifestProjection(plan, revisionId.value, this.digest);
    if (manifestAfter.status === ResultStatus.Failure) return manifestAfter;
    const intent = {
      revisionId: revisionId.value,
      plan,
      approval: {
        gate: ManagedFileGateId.G0ManagedFiles,
        actorId: approval.actorId,
        idempotencyKey: approval.idempotencyKey,
        approvedAt: this.clock.now().toISOString(),
        planId: plan.planId,
        planDigest: plan.planDigest,
      },
      preimages: preflight.value.preimages,
      manifestAfter: manifestAfter.value,
      createdDirectories: preflight.value.createdDirectories,
    };
    const reservation = await this.revisionStore.reserveIntent({ intent });
    if (reservation.status === ResultStatus.Failure) return reservation;
    return reservation.value.disposition === InstallationRevisionReservationDisposition.Existing
      ? this.handleExisting(reservation.value.state, plan)
      : this.applyFreshRevision(reservation.value.state);
  }

  private async handleExisting(
    state: InstallationRevisionState,
    plan: InstallPlan,
  ): Promise<Result<ApplyInstallPlanOutput, HarnessError>> {
    if (
      state.record.intent.plan.planId !== plan.planId ||
      state.record.intent.plan.planDigest !== plan.planDigest
    )
      return failure(
        new HarnessError(
          HarnessErrorCode.VersionConflict,
          "Installation idempotency scope is bound to another InstallPlan.",
          { revisionId: state.record.revisionId },
        ),
      );
    if (isCommittedInstallationRevisionState(state))
      return success(
        createInstallationApplyOutput(state, InstallationApplyDisposition.Reused, false),
      );

    const observed = await readInstallationRecoveryState(state.record.intent, this.reader);
    if (observed.status === ResultStatus.Failure) return observed;
    const disposition = classifyInstallationRecovery(
      state.record.intent,
      observed.value.files,
      observed.value.manifest,
    );
    if (disposition === InstallationRecoveryDisposition.Complete) {
      const completed = await completeInstallationRevision(state, this.completionDependencies());
      return completed.status === ResultStatus.Failure
        ? completed
        : success(
            createInstallationApplyOutput(
              completed.value,
              InstallationApplyDisposition.Reused,
              false,
            ),
          );
    }
    if (
      disposition === InstallationRecoveryDisposition.RestartPermitted &&
      state.record.events.length === 0
    ) {
      const preflight = await runInstallationPreflight(plan, this.reader);
      if (preflight.status === ResultStatus.Failure) return preflight;
      const consistent = validateInstallationRestartPreflight(state.record.intent, preflight.value);
      if (consistent.status === ResultStatus.Failure) return consistent;
      return this.applyFreshRevision(state);
    }
    return failure(
      new HarnessError(
        HarnessErrorCode.InstallationRecoveryRequired,
        "Incomplete installation requires an explicit recovery decision.",
        { revisionId: state.record.revisionId, disposition },
      ),
    );
  }

  private async applyFreshRevision(
    initial: InstallationRevisionState,
  ): Promise<Result<ApplyInstallPlanOutput, HarnessError>> {
    const applied = await executeFreshInstallationRevision(initial, {
      ...this.completionDependencies(),
      mutation: this.mutation,
    });
    return applied.status === ResultStatus.Failure
      ? applied
      : success(
          createInstallationApplyOutput(applied.value, InstallationApplyDisposition.Applied, true),
        );
  }

  private completionDependencies() {
    return {
      revisionStore: this.revisionStore,
      reader: this.reader,
      clock: this.clock,
    };
  }

  private createRevisionId(): ReturnType<typeof parseInstallationRevisionId> {
    try {
      return parseInstallationRevisionId(this.revisionIdGenerator.next());
    } catch (error) {
      return failure(
        new HarnessError(
          HarnessErrorCode.IoFailure,
          "Installation Revision ID generator failed.",
          {},
          error,
        ),
      );
    }
  }
}
