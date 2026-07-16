import type {
  ExecutorCompatibilityEvidenceProjection,
  ExecutorCompatibilityEvidenceProjectionSetVerifierPort,
} from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import {
  executorHostScopeIdentity,
  type ExecutorHostScope,
} from "#domain/executorCompatibility/index.js";

import type {
  ExecutorCompatibilityProjectionBindingRule,
  ExecutorCompatibilityProjectionSchemaRegistration,
} from "../contracts/index.js";

/** 已经由 exact-schema 来源 verifier 完成复验的路由结果。 */
interface RoutedProjection {
  /** 参与 allowlist 路由的精确 Artifact Schema。 */
  readonly schemaVersion: string;
  /** 来源专属 verifier 返回的可信 Projection。 */
  readonly projection: ExecutorCompatibilityEvidenceProjection;
}

/** 仅按 Artifact Schema 精确路由，并在同一次调用中校验跨来源绑定。 */
export class SchemaRoutedExecutorCompatibilityProjectionSetVerifierAdapter implements ExecutorCompatibilityEvidenceProjectionSetVerifierPort {
  private readonly registrations: readonly ExecutorCompatibilityProjectionSchemaRegistration[];
  private readonly bindingRules: readonly ExecutorCompatibilityProjectionBindingRule[];

  /** 固化 exact-schema allowlist 与不可变集合绑定规则。 */
  public constructor(
    registrations: readonly ExecutorCompatibilityProjectionSchemaRegistration[],
    bindingRules: readonly ExecutorCompatibilityProjectionBindingRule[],
  ) {
    assertConfiguration(registrations, bindingRules);
    this.registrations = Object.freeze(
      registrations.map((registration) => Object.freeze({ ...registration })),
    );
    this.bindingRules = Object.freeze(
      bindingRules.map((rule) =>
        Object.freeze({
          ...rule,
          parentObservationKinds: Object.freeze([...rule.parentObservationKinds]),
        }),
      ),
    );
  }

  /** 拒绝缺失、非字符串、未知 Schema，以及任意集合级父子绑定漂移。 */
  public verifyPersistedProjectionSet(
    projections: readonly ExecutorCompatibilityEvidenceProjection[],
  ): Result<readonly ExecutorCompatibilityEvidenceProjection[], HarnessError> {
    const routed: RoutedProjection[] = [];
    for (const projection of projections) {
      const schemaVersion = readArtifactStringField(projection, "schemaVersion");
      if (schemaVersion.status === ResultStatus.Failure) return schemaVersion;
      const registration = this.registrations.find(
        (candidate) => candidate.schemaVersion === schemaVersion.value,
      );
      if (registration === undefined) {
        return corrupt("Executor Compatibility Projection Artifact Schema 不在精确允许列表中。", {
          schemaVersion: schemaVersion.value,
        });
      }

      const verified = registration.verifier.verifyPersistedProjection(projection);
      if (verified.status === ResultStatus.Failure) {
        return corrupt("Executor Compatibility Projection 来源复验失败。", {
          schemaVersion: schemaVersion.value,
          causeCode: verified.error.code,
        });
      }
      const verifiedSchemaVersion = readArtifactStringField(verified.value, "schemaVersion");
      if (verifiedSchemaVersion.status === ResultStatus.Failure) return verifiedSchemaVersion;
      if (verifiedSchemaVersion.value !== schemaVersion.value) {
        return corrupt("Executor Compatibility Projection 复验后 Artifact Schema 漂移。", {
          schemaVersion: schemaVersion.value,
        });
      }
      routed.push({ schemaVersion: schemaVersion.value, projection: verified.value });
    }

    for (const registration of this.registrations) {
      const count = routed.filter(
        (candidate) => candidate.schemaVersion === registration.schemaVersion,
      ).length;
      if (count !== registration.exactCount) {
        return corrupt("Executor Compatibility Projection Schema 来源数量不符合精确约束。", {
          schemaVersion: registration.schemaVersion,
          expectedCount: String(registration.exactCount),
          actualCount: String(count),
        });
      }
    }

    for (const rule of this.bindingRules) {
      const binding = validateBindingRule(routed, rule);
      if (binding.status === ResultStatus.Failure) return binding;
    }

    return success(
      this.registrations.flatMap((registration) =>
        routed
          .filter((candidate) => candidate.schemaVersion === registration.schemaVersion)
          .sort((left, right) =>
            left.projection.artifactDigest.localeCompare(right.projection.artifactDigest),
          )
          .map((candidate) => candidate.projection),
      ),
    );
  }
}

function validateBindingRule(
  routed: readonly RoutedProjection[],
  rule: ExecutorCompatibilityProjectionBindingRule,
): Result<void, HarnessError> {
  const parent = routed.find((candidate) => candidate.schemaVersion === rule.parentSchemaVersion);
  const dependent = routed.find(
    (candidate) => candidate.schemaVersion === rule.dependentSchemaVersion,
  );
  if (parent === undefined || dependent === undefined) {
    return corrupt("Executor Compatibility Projection 集合缺少绑定规则要求的来源。", {
      parentSchemaVersion: rule.parentSchemaVersion,
      dependentSchemaVersion: rule.dependentSchemaVersion,
    });
  }

  const parentDigest = readArtifactStringField(
    dependent.projection,
    rule.dependentArtifactDigestField,
  );
  if (parentDigest.status === ResultStatus.Failure) return parentDigest;
  if (parentDigest.value !== parent.projection.artifactDigest) {
    return corrupt("Executor Compatibility Projection 父 Artifact Digest 绑定漂移。", {
      parentSchemaVersion: rule.parentSchemaVersion,
      dependentSchemaVersion: rule.dependentSchemaVersion,
    });
  }

  const parentScope = readProjectionScope(parent.projection);
  if (parentScope.status === ResultStatus.Failure) return parentScope;
  const dependentScope = readProjectionScope(dependent.projection);
  if (dependentScope.status === ResultStatus.Failure) return dependentScope;
  if (
    executorHostScopeIdentity(parentScope.value) !== executorHostScopeIdentity(dependentScope.value)
  ) {
    return corrupt("Executor Compatibility Projection 跨来源精确 Scope 漂移。", {
      parentSchemaVersion: rule.parentSchemaVersion,
      dependentSchemaVersion: rule.dependentSchemaVersion,
    });
  }

  const observationAnchor = readArtifactStringField(
    dependent.projection,
    rule.dependentObservationAnchorField,
  );
  if (observationAnchor.status === ResultStatus.Failure) return observationAnchor;
  const dynamicEvidence = parent.projection.evidence.filter((evidence) =>
    rule.parentObservationKinds.includes(evidence.kind),
  );
  if (
    dynamicEvidence.length === 0 ||
    rule.parentObservationKinds.some(
      (kind) => !dynamicEvidence.some((evidence) => evidence.kind === kind),
    )
  ) {
    return corrupt("Executor Compatibility 父 Projection 缺少完整动态观察 Evidence。", {
      parentSchemaVersion: rule.parentSchemaVersion,
    });
  }
  const observedAtValues = new Set(dynamicEvidence.map((evidence) => evidence.source.observedAt));
  if (observedAtValues.size !== 1 || !observedAtValues.has(observationAnchor.value)) {
    return corrupt("Executor Compatibility Projection 动态观察锚点绑定漂移。", {
      parentSchemaVersion: rule.parentSchemaVersion,
      dependentSchemaVersion: rule.dependentSchemaVersion,
    });
  }
  if (
    dependent.projection.evidence.some(
      (evidence) => evidence.source.observedAt !== observationAnchor.value,
    )
  ) {
    return corrupt("Executor Compatibility dependent Evidence 观察锚点不一致。", {
      dependentSchemaVersion: rule.dependentSchemaVersion,
    });
  }
  return success(undefined);
}

function readProjectionScope(
  projection: ExecutorCompatibilityEvidenceProjection,
): Result<ExecutorHostScope, HarnessError> {
  const firstEvidence = projection.evidence[0];
  if (firstEvidence === undefined) {
    return corrupt("Executor Compatibility Projection 未包含可确定 Scope 的 Evidence。");
  }
  const identity = executorHostScopeIdentity(firstEvidence.scope);
  if (
    projection.evidence.some((evidence) => executorHostScopeIdentity(evidence.scope) !== identity)
  ) {
    return corrupt("Executor Compatibility Projection 内部 Scope 漂移。");
  }
  return success(firstEvidence.scope);
}

function readArtifactStringField(
  projection: ExecutorCompatibilityEvidenceProjection,
  field: string,
): Result<string, HarnessError> {
  if (!isRecord(projection.artifact)) {
    return corrupt("Executor Compatibility Projection Artifact 不是对象。", { field });
  }
  const value = projection.artifact[field];
  if (typeof value !== "string" || value.length === 0) {
    return corrupt("Executor Compatibility Projection Artifact 字段缺失或不是字符串。", {
      field,
    });
  }
  return success(value);
}

function assertConfiguration(
  registrations: readonly ExecutorCompatibilityProjectionSchemaRegistration[],
  bindingRules: readonly ExecutorCompatibilityProjectionBindingRule[],
): void {
  const schemaVersions = registrations.map((registration) => registration.schemaVersion);
  if (
    registrations.length === 0 ||
    new Set(schemaVersions).size !== schemaVersions.length ||
    registrations.some(
      (registration) =>
        registration.schemaVersion.length === 0 ||
        !Number.isSafeInteger(registration.exactCount) ||
        registration.exactCount < 1,
    )
  ) {
    throw new HarnessError(
      HarnessErrorCode.InvalidInput,
      "Executor Compatibility Projection Schema 注册配置无效。",
    );
  }
  if (
    bindingRules.some(
      (rule) =>
        !schemaVersions.includes(rule.parentSchemaVersion) ||
        !schemaVersions.includes(rule.dependentSchemaVersion) ||
        rule.parentSchemaVersion === rule.dependentSchemaVersion ||
        rule.dependentArtifactDigestField.length === 0 ||
        rule.dependentObservationAnchorField.length === 0 ||
        rule.parentObservationKinds.length === 0,
    )
  ) {
    throw new HarnessError(
      HarnessErrorCode.InvalidInput,
      "Executor Compatibility Projection 集合绑定配置无效。",
    );
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function corrupt(
  message: string,
  details: Readonly<Record<string, string>> = {},
): Result<never, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.CorruptStore, message, details));
}
