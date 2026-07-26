import {
  createSessionHookBinding,
  SESSION_HOOK_BINDING_SCHEMA_VERSION,
} from "../../../src/application/executorHooks/index.js";
import {
  calculateCodingTaskSessionActionCoverageManifestDigest,
  type CodingTaskSessionActionCoverageManifest,
} from "../../../src/application/codingTaskSessionActionCoverage/index.js";
import {
  CODING_TASK_AGGREGATE_SCHEMA_VERSION,
  parseContentDigest,
} from "../../../src/common/index.js";
import {
  CodingTaskPhase,
  CodingTaskRunState,
  parseCodingTaskId,
  type CodingTaskAggregateRecord,
} from "../../../src/domain/codingTask/index.js";
import {
  createCodingTaskSessionActivationRecord,
  parseCodingTaskSessionId,
  type CodingTaskSessionActivationRecord,
} from "../../../src/domain/codingTaskSession/index.js";
import { CODING_TASK_SESSION_ACTIVATION_SCHEMA_VERSION } from "../../../src/domain/codingTaskSession/constants/index.js";
import { GateEvaluationResult, GateId } from "../../../src/domain/policy/index.js";
import { parseArtifactDigest, parseArtifactId } from "../../../src/domain/artifact/index.js";
import { parseApprovalId } from "../../../src/domain/approval/index.js";
import { parseTaskId } from "../../../src/domain/task/index.js";
import { parseRepositoryId, parseWorkspaceId } from "../../../src/domain/workspace/index.js";
import type { SessionHookBinding } from "../../../src/application/executorHooks/index.js";
import {
  coverageManifest,
  digest,
  digestOf,
  snapshot,
  unwrap,
} from "../codingTaskSessionCloseout/index.js";

/** Closeout Manager 测试使用的 Workspace 标识。 */
export const closeoutManagerWorkspaceId = unwrap(parseWorkspaceId("closeout-test"));
/** Closeout Manager 测试使用的 Session 标识。 */
export const closeoutManagerSessionId = unwrap(
  parseCodingTaskSessionId("01ARZ3NDEKTSV4RRFFQ69G5FAV"),
);
/** Closeout Manager 测试使用的 Source Task 标识。 */
export const closeoutManagerSourceTaskId = unwrap(parseTaskId("01ARZ3NDEKTSV4RRFFQ69G5FAW"));
/** Closeout Manager 测试使用的 CodingTask 标识。 */
export const closeoutManagerCodingTaskId = unwrap(parseCodingTaskId("coding-task-closeout"));
/** Closeout Manager 测试使用的 Repository 标识。 */
export const closeoutManagerRepositoryId = unwrap(parseRepositoryId("closeout-repository"));
/** Closeout Manager 测试使用的受管 Worktree Root。 */
export const closeoutManagerWorktreeRoot = "closeout";

/** Closeout Manager 测试所需的权威记录集合。 */
export interface CloseoutManagerAuthorityFixture {
  /** 不可变 Session Activation。 */
  readonly activation: CodingTaskSessionActivationRecord;
  /** 权威 CodingTask Aggregate Record。 */
  readonly codingTask: CodingTaskAggregateRecord;
  /** Session Hook Binding v2。 */
  readonly binding: SessionHookBinding;
}

/** 权威记录夹具的可控输入。 */
export interface CloseoutManagerAuthorityOptions {
  /** Activation 与 Binding 绑定的 Agent Actor。 */
  readonly agentActorId?: string;
  /** PlanRisk Gate 的闭合结果。 */
  readonly gateResult?: GateEvaluationResult;
  /** Aggregate 中声明的活动 Attempt 编号。 */
  readonly aggregateAttemptNumber?: number;
}

/** 创建身份、Gate、Attempt 与 Worktree 完整一致的权威记录。 */
export function createCloseoutManagerAuthority(
  options: CloseoutManagerAuthorityOptions = {},
): CloseoutManagerAuthorityFixture {
  const agentActorId = options.agentActorId ?? "closeout-agent";
  const planRiskArtifactId = unwrap(parseArtifactId("01ARZ3NDEKTSV4RRFFQ69G5FCZ"));
  const planRiskArtifactDigest = unwrap(parseArtifactDigest(contentDigest("c")));
  const activation = unwrap(
    createCodingTaskSessionActivationRecord(
      {
        schemaVersion: CODING_TASK_SESSION_ACTIVATION_SCHEMA_VERSION,
        sessionId: closeoutManagerSessionId,
        workspaceId: closeoutManagerWorkspaceId,
        codingTaskId: closeoutManagerCodingTaskId,
        sourceTaskId: closeoutManagerSourceTaskId,
        repositoryId: closeoutManagerRepositoryId,
        attemptNumber: 1,
        attemptStartedAt: "2026-07-26T00:00:00.000Z",
        worktreeId: "closeout-worktree",
        worktreeRootDigest: digestOf({ worktreeRoot: closeoutManagerWorktreeRoot }),
        planRiskArtifactId,
        planRiskArtifactDigest,
        agentActorId,
        activatedAt: "2026-07-26T00:00:00.000Z",
      },
      digest,
    ),
  );
  const binding = unwrap(
    createSessionHookBinding(
      {
        schemaVersion: SESSION_HOOK_BINDING_SCHEMA_VERSION,
        workspaceRoot: closeoutManagerWorktreeRoot,
        workspaceId: closeoutManagerWorkspaceId,
        taskId: closeoutManagerSourceTaskId,
        planRiskArtifactId,
        planRiskArtifactDigest,
        actorId: agentActorId,
        boundAt: activation.activatedAt,
        sessionId: closeoutManagerSessionId,
        codingTaskId: closeoutManagerCodingTaskId,
        attemptNumber: 1,
        worktreeId: "closeout-worktree",
        worktreeRootDigest: activation.worktreeRootDigest,
        activationBindingDigest: activation.bindingDigest,
      },
      digest,
    ),
  );
  const approvalId = unwrap(parseApprovalId("01ARZ3NDEKTSV4RRFFQ69G5FAX"));
  const aggregate = {
    schemaVersion: CODING_TASK_AGGREGATE_SCHEMA_VERSION,
    codingTaskId: closeoutManagerCodingTaskId,
    workspaceId: closeoutManagerWorkspaceId,
    sourceTaskId: closeoutManagerSourceTaskId,
    repositoryId: closeoutManagerRepositoryId,
    baseRevision: "a".repeat(40),
    worktreeBinding: {
      worktreeId: "closeout-worktree",
      relativePath: "worktrees/closeout",
      branchName: "task/closeout",
      managed: true,
    },
    writeSet: snapshot().writeSet,
    inputBindingSet: { bindings: [] },
    executionAuthorization: {
      planRisk: {
        artifactId: planRiskArtifactId,
        artifactDigest: planRiskArtifactDigest,
        result: options.gateResult ?? GateEvaluationResult.Allow,
        requiredGates: [GateId.G1Requirement],
        satisfiedApprovalIds: [approvalId],
      },
      historicalLogicChange: false,
    },
    phase: CodingTaskPhase.Implementation,
    runState: CodingTaskRunState.Active,
    attempts: [
      {
        number: options.aggregateAttemptNumber ?? 1,
        startedAt: "2026-07-26T00:00:00.000Z",
      },
    ],
    version: 1,
    createdAt: "2026-07-26T00:00:00.000Z",
    updatedAt: "2026-07-26T00:00:00.000Z",
  } satisfies CodingTaskAggregateRecord["aggregate"];
  return {
    activation,
    binding,
    codingTask: { aggregate, lastSequence: 1, lastEventHash: "hash" },
  };
}

/** 创建与权威 Activation、Binding 精确匹配的 Coverage Manifest。 */
export function createCloseoutManagerCoverage(
  authority: CloseoutManagerAuthorityFixture,
): CodingTaskSessionActionCoverageManifest {
  const base = coverageManifest();
  const input = {
    ...base,
    activationBindingDigest: authority.activation.bindingDigest,
    sessionBindingDigest: unwrap(parseContentDigest(authority.binding.sessionBindingDigest)),
  };
  return {
    ...input,
    manifestDigest: unwrap(calculateCodingTaskSessionActionCoverageManifestDigest(input, digest)),
  };
}

function contentDigest(value: string) {
  return unwrap(parseContentDigest(`sha256:${value.repeat(64)}`));
}
