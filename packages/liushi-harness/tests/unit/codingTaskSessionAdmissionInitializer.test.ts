import { describe, expect, it } from "vitest";

import {
  InitializeCodingTaskSessionAdmissionService,
  createSessionHookBinding,
  type SessionHookBinding,
  type HookBinding,
  type HookWorkspaceBinding,
  type HookBindingStore,
  type CodingTaskSessionAdmissionStateStore,
  type ContentDigestPort,
} from "#application/index.js";
import {
  CodingTaskSessionAdmissionStateCreateDisposition,
  type CodingTaskSessionAdmissionStateCreateResult,
} from "#application/ports/index.js";
import {
  HarnessErrorCode,
  ResultStatus,
  success,
  parseContentDigest,
  type ContentDigest,
  type HarnessError,
  type Result,
} from "#common/index.js";
import {
  CODING_TASK_SESSION_ACTIVATION_SCHEMA_VERSION,
  createCodingTaskSessionActivationRecord,
  createCodingTaskSessionAdmissionState,
  parseCodingTaskSessionId,
  type CodingTaskSessionActivationRecord,
  type CodingTaskSessionAdmissionState,
} from "#domain/codingTaskSession/index.js";
import { CodingTaskSessionAdmissionStatus } from "#domain/codingTaskSession/index.js";
import { Rfc8785Sha256DigestAdapter } from "#infrastructure/serialization/jsonDigest/index.js";
import { parseArtifactDigest, parseArtifactId } from "#domain/artifact/index.js";
import { parseCodingTaskId } from "#domain/codingTask/index.js";
import { parseTaskId } from "#domain/task/index.js";
import { parseRepositoryId, parseWorkspaceId } from "#domain/workspace/index.js";

const digest = new Rfc8785Sha256DigestAdapter();
const workspaceRoot = "C:\\worktrees\\session-1";
const workspaceId = required(parseWorkspaceId("workspace-1"));
const sessionId = required(parseCodingTaskSessionId("01ARZ3NDEKTSV4RRFFQ69G5FAV"));

describe("CodingTask Session Admission Initializer", () => {
  it("从权威 Activation 与 Worktree Root 创建 Binding v2 和 waiting_agent State", async () => {
    const activation = createActivation();
    const fake = createFakes();
    const service = new InitializeCodingTaskSessionAdmissionService(fake);

    const result = await service.ensure({ activation, worktreeRoot: workspaceRoot });

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) return;
    expect(result.value.binding.schemaVersion).toBe("2.0.0");
    expect(result.value.binding.workspaceRoot).toBe(workspaceRoot);
    expect(result.value.binding.activationBindingDigest).toBe(activation.bindingDigest);
    expect(result.value.state.status).toBe("waiting_agent");
    expect(result.value.state.sessionBindingDigest).toBe(result.value.binding.sessionBindingDigest);
    expect(fake.boundBinding?.sessionBindingDigest).toBe(result.value.binding.sessionBindingDigest);
    expect(fake.createdState?.sessionBindingDigest).toBe(result.value.binding.sessionBindingDigest);
  });

  it("拒绝 Worktree Root Digest 漂移，且不创建 Binding 或 State", async () => {
    const activation = createActivation();
    const fake = createFakes();
    const service = new InitializeCodingTaskSessionAdmissionService(fake);

    const result = await service.ensure({
      activation,
      worktreeRoot: "C:\\worktrees\\different",
    });

    expectFailure(result, HarnessErrorCode.PreconditionNotMet);
    expect(fake.bindCalls).toBe(0);
    expect(fake.createCalls).toBe(0);
  });

  it("拒绝 Binding 冲突，不把冲突身份写入 Admission State", async () => {
    const activation = createActivation();
    const fake = createFakes({
      bindResult: {
        status: ResultStatus.Success,
        value: {
          ...createBindingCandidate(activation),
          sessionBindingDigest: contentDigest("f"),
        },
      },
    });
    const service = new InitializeCodingTaskSessionAdmissionService(fake);

    const result = await service.ensure({ activation, worktreeRoot: workspaceRoot });

    expectFailure(result, HarnessErrorCode.VersionConflict);
    expect(fake.createCalls).toBe(0);
  });

  it("复用已推进但仍 waiting_agent 的同身份 State", async () => {
    const activation = createActivation();
    const fake = createFakes();
    const sessionBindingDigest = createBindingCandidate(activation).sessionBindingDigest;
    const initial = unwrap(
      createCodingTaskSessionAdmissionState({
        workspaceId,
        sessionId,
        activationBindingDigest: activation.bindingDigest,
        sessionBindingDigest,
        updatedAt: activation.activatedAt,
      }),
    );
    fake.createResult = success({
      disposition: CodingTaskSessionAdmissionStateCreateDisposition.Reused,
      state: { ...initial, version: 4, updatedAt: "2026-07-23T00:00:04.000Z" },
    });
    const service = new InitializeCodingTaskSessionAdmissionService(fake);

    const result = await service.ensure({ activation, worktreeRoot: workspaceRoot });

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Failure) return;
    expect(result.value.state.version).toBe(4);
    expect(result.value.state.status).toBe("waiting_agent");
  });

  it.each([
    [CodingTaskSessionAdmissionStatus.Closing, "closing"],
    [CodingTaskSessionAdmissionStatus.OutcomeUnknown, "outcome_unknown"],
  ] as const)("%s State 不得重新报告为可用", async (...[status]) => {
    const activation = createActivation();
    const fake = createFakes();
    const sessionBindingDigest = createBindingCandidate(activation).sessionBindingDigest;
    const initial = unwrap(
      createCodingTaskSessionAdmissionState({
        workspaceId,
        sessionId,
        activationBindingDigest: activation.bindingDigest,
        sessionBindingDigest,
        updatedAt: activation.activatedAt,
      }),
    );
    fake.createResult = success({
      disposition: CodingTaskSessionAdmissionStateCreateDisposition.Reused,
      state: { ...initial, status, version: 5 },
    });
    const service = new InitializeCodingTaskSessionAdmissionService(fake);

    const result = await service.ensure({ activation, worktreeRoot: workspaceRoot });

    expectFailure(result, HarnessErrorCode.InvalidStateTransition);
  });
});

/** Initializer 的 Binding/State Fake，记录 create-only 边界。 */
interface InitializerFakes {
  readonly digest: ContentDigestPort;
  readonly bindingStore: HookBindingStore;
  readonly stateStore: CodingTaskSessionAdmissionStateStore;
  readonly bindCalls: number;
  readonly createCalls: number;
  readonly boundBinding: SessionHookBinding | undefined;
  readonly createdState: CodingTaskSessionAdmissionState | undefined;
  bindResult?: Result<SessionHookBinding, HarnessError>;
  createResult?: Result<CodingTaskSessionAdmissionStateCreateResult, HarnessError>;
}

function createFakes(
  options: {
    readonly bindResult?: Result<SessionHookBinding, HarnessError>;
  } = {},
): InitializerFakes {
  let bindCalls = 0;
  let createCalls = 0;
  let boundBinding: SessionHookBinding | undefined;
  let createdState: CodingTaskSessionAdmissionState | undefined;
  const fake: InitializerFakes = {
    digest,
    bindingStore: createBindingStore(),
    stateStore: createStateStore(),
    get bindCalls() {
      return bindCalls;
    },
    get createCalls() {
      return createCalls;
    },
    get boundBinding() {
      return boundBinding;
    },
    get createdState() {
      return createdState;
    },
  };
  function createBindingStore(): HookBindingStore {
    class FakeBindingStore implements HookBindingStore {
      public bind(
        binding: HookWorkspaceBinding,
      ): Promise<Result<HookWorkspaceBinding, HarnessError>>;
      public bind(binding: SessionHookBinding): Promise<Result<SessionHookBinding, HarnessError>>;
      public bind(binding: HookBinding): Promise<Result<HookBinding, HarnessError>> {
        bindCalls += 1;
        if ("sessionBindingDigest" in binding) {
          boundBinding = binding;
          return Promise.resolve(options.bindResult ?? success(binding));
        }
        return Promise.resolve(success(binding));
      }

      public find(): Promise<Result<HookBinding, HarnessError>> {
        return Promise.resolve(success(createBindingCandidate(createActivation())));
      }

      public findSession(): Promise<Result<SessionHookBinding, HarnessError>> {
        return Promise.resolve(success(createBindingCandidate(createActivation())));
      }
    }
    return new FakeBindingStore();
  }

  function createStateStore(): CodingTaskSessionAdmissionStateStore {
    return {
      create: (state) => {
        createCalls += 1;
        createdState = state;
        return Promise.resolve(
          fake.createResult ??
            success({
              disposition: CodingTaskSessionAdmissionStateCreateDisposition.Created,
              state,
            }),
        );
      },
      load: () =>
        Promise.resolve(
          success(
            createdState ??
              unwrap(
                createCodingTaskSessionAdmissionState({
                  workspaceId,
                  sessionId,
                  activationBindingDigest: contentDigest("a"),
                  sessionBindingDigest: contentDigest("b"),
                  updatedAt: "2026-07-23T00:00:00.000Z",
                }),
              ),
          ),
        ),
      replace: ({ state }) => Promise.resolve(success(state)),
    };
  }
  return fake;
}

function createActivation(): CodingTaskSessionActivationRecord {
  return unwrap(
    createCodingTaskSessionActivationRecord(
      {
        schemaVersion: CODING_TASK_SESSION_ACTIVATION_SCHEMA_VERSION,
        sessionId,
        workspaceId,
        codingTaskId: required(parseCodingTaskId("coding-task-1")),
        sourceTaskId: required(parseTaskId("01ARZ3NDEKTSV4RRFFQ69G5FCX")),
        repositoryId: required(parseRepositoryId("repository-1")),
        attemptNumber: 1,
        attemptStartedAt: "2026-07-23T00:00:00.000Z",
        worktreeId: "worktree-1",
        worktreeRootDigest: required(digest.calculate({ worktreeRoot: workspaceRoot })),
        planRiskArtifactId: required(parseArtifactId("01ARZ3NDEKTSV4RRFFQ69G5FCZ")),
        planRiskArtifactDigest: required(parseArtifactDigest(contentDigest("c"))),
        agentActorId: "agent:codex",
        activatedAt: "2026-07-23T00:00:00.000Z",
      },
      digest,
    ),
  );
}

function createBindingCandidate(activation: CodingTaskSessionActivationRecord) {
  return unwrap(
    createSessionHookBinding(
      {
        schemaVersion: "2.0.0",
        workspaceRoot,
        workspaceId: activation.workspaceId,
        taskId: activation.sourceTaskId,
        planRiskArtifactId: activation.planRiskArtifactId,
        planRiskArtifactDigest: activation.planRiskArtifactDigest,
        actorId: activation.agentActorId,
        boundAt: activation.activatedAt,
        sessionId: activation.sessionId,
        codingTaskId: activation.codingTaskId,
        attemptNumber: activation.attemptNumber,
        worktreeId: activation.worktreeId,
        worktreeRootDigest: activation.worktreeRootDigest,
        activationBindingDigest: activation.bindingDigest,
      },
      digest,
    ),
  );
}

function required<T>(result: Result<T, HarnessError>): T {
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}

function unwrap<T>(result: Result<T, HarnessError>): T {
  return required(result);
}

function contentDigest(hexCharacter: string): ContentDigest {
  return required(parseContentDigest(`sha256:${hexCharacter.repeat(64)}`));
}

function expectFailure<T>(result: Result<T, HarnessError>, code: HarnessErrorCode): void {
  expect(result.status).toBe(ResultStatus.Failure);
  if (result.status === ResultStatus.Failure) expect(result.error.code).toBe(code);
}
