import {
  CodingTaskSessionCloseoutManager,
  type CodingTaskSessionCloseoutManagerDependencies,
} from "../../../src/application/codingTaskSessionCloseout/index.js";
import {
  CodingTaskSessionActivationDisposition,
  CodingTaskSessionCloseoutStateCreateDisposition,
} from "../../../src/application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  failure,
  parseContentDigest,
  success,
} from "../../../src/common/index.js";
import { ActionOutcome } from "../../../src/domain/actionJournal/index.js";
import { createCodingTaskSessionAdmissionState } from "../../../src/domain/codingTaskSession/index.js";
import { checkpoint, snapshot, unwrap } from "../codingTaskSessionCloseout/index.js";
import {
  closeoutManagerRepositoryId,
  closeoutManagerSessionId,
  closeoutManagerWorkspaceId,
  closeoutManagerWorktreeRoot,
  createCloseoutManagerAuthority,
} from "./codingTaskSessionCloseoutManagerAuthorityFixture.js";
import {
  createCloseoutManagerClock,
  createCloseoutManagerCoverageResult,
  createCloseoutManagerDigest,
} from "./codingTaskSessionCloseoutManagerFaultFixture.js";
import type {
  CloseoutManagerHarness,
  CloseoutManagerHarnessCalls,
  CloseoutManagerHarnessOptions,
} from "./codingTaskSessionCloseoutManagerHarness.contracts.js";

/** 创建带 Repository Lock 断言与可控失败序列的 Manager 夹具。 */
export function createCloseoutManagerHarness(
  options: CloseoutManagerHarnessOptions = {},
): CloseoutManagerHarness {
  const authority = createCloseoutManagerAuthority(options);
  const events: string[] = [];
  const calls: CloseoutManagerHarnessCalls = {
    activationLoad: 0,
    lockAcquire: 0,
    admission: 0,
    coverage: 0,
    snapshot: 0,
    checkpointExecute: 0,
    stateReplace: 0,
  };
  const checkpointFailures = [...(options.checkpointFailures ?? [])];
  const coverageFailures = [...(options.coverageFailures ?? [])];
  const snapshotFailures = [...(options.snapshotFailures ?? [])];
  const admissionFailures = [...(options.admissionFailures ?? [])];
  const replaceFailures = new Map<number, HarnessError[]>();
  for (const [version, errors] of Object.entries(options.replaceFailures ?? {})) {
    replaceFailures.set(Number(version), [...errors]);
  }
  let held = false;
  let currentState = options.existingState ?? null;

  const activationRepository: CodingTaskSessionCloseoutManagerDependencies["activationRepository"] =
    {
      create: (record) =>
        Promise.resolve(
          success({
            disposition: CodingTaskSessionActivationDisposition.Created,
            record,
          }),
        ),
      load: () => {
        calls.activationLoad += 1;
        if (calls.activationLoad === 1 && options.preLockActivationThrow !== undefined) {
          throw options.preLockActivationThrow;
        }
        events.push(held ? "activation:locked" : "activation:locate");
        return Promise.resolve(success(authority.activation));
      },
    };

  const dependencies: CodingTaskSessionCloseoutManagerDependencies = {
    stateStore: {
      find: () => {
        assertHeld(held, "state find");
        events.push("state:find");
        return Promise.resolve(success(currentState));
      },
      load: () =>
        Promise.resolve(
          currentState === null
            ? failure(new HarnessError(HarnessErrorCode.PreconditionNotMet, "not found"))
            : success(currentState),
        ),
      create: (state) => {
        assertHeld(held, "state create");
        events.push("state:create");
        if (currentState !== null) {
          return Promise.resolve(
            success({
              disposition: CodingTaskSessionCloseoutStateCreateDisposition.Conflict,
              state: currentState,
            }),
          );
        }
        currentState = state;
        return Promise.resolve(
          success({
            disposition: CodingTaskSessionCloseoutStateCreateDisposition.Created,
            state,
          }),
        );
      },
      replace: (input) => {
        if (!held && !options.releaseFailure) {
          throw new Error("state replace outside lock");
        }
        calls.stateReplace += 1;
        events.push(`state:replace:${input.expectedVersion}`);
        const failures = replaceFailures.get(input.expectedVersion);
        const injected = failures?.shift();
        if (injected !== undefined) {
          if (failures?.length === 0) replaceFailures.delete(input.expectedVersion);
          return Promise.resolve(failure(injected));
        }
        if (currentState?.version !== input.expectedVersion) {
          return Promise.resolve(
            failure(new HarnessError(HarnessErrorCode.VersionConflict, "version")),
          );
        }
        currentState = input.state;
        return Promise.resolve(success(input.state));
      },
    },
    activationRepository,
    codingTaskRepository: {
      load: () => {
        assertHeld(held, "coding task");
        events.push("codingTask");
        return Promise.resolve(success(authority.codingTask));
      },
      append: () => {
        throw new Error("测试不应追加 CodingTask Event。");
      },
    },
    bindingStore: {
      bind: () => {
        throw new Error("测试不应写入 Hook Binding。");
      },
      find: () => {
        throw new Error("测试不应按 cwd 读取 Hook Binding。");
      },
      findSession: () => {
        assertHeld(held, "binding");
        events.push("binding");
        return Promise.resolve(success(authority.binding));
      },
    },
    repositoryRootResolver: {
      resolve: () => {
        assertHeld(held, "root");
        events.push("root");
        return Promise.resolve(success({ repositoryRoot: "D:/repository" }));
      },
    },
    managedWorktreePath: {
      resolveManagedWorktreeRoot: () => {
        assertHeld(held, "worktree");
        events.push("worktree");
        return success(options.resolvedWorktreeRoot ?? closeoutManagerWorktreeRoot);
      },
    },
    repositoryLock: {
      acquire: () => {
        calls.lockAcquire += 1;
        events.push("lock:acquire");
        if (options.lockAcquireFailure !== undefined) {
          return Promise.resolve(failure(options.lockAcquireFailure));
        }
        held = true;
        return Promise.resolve(
          success({
            lockId: "lock",
            workspaceId: closeoutManagerWorkspaceId,
            repositoryId: closeoutManagerRepositoryId,
            acquiredAt: "2026-07-26T00:00:00.000Z",
            release: () => {
              held = false;
              events.push("lock:release");
              return Promise.resolve(
                options.releaseFailure
                  ? failure(new HarnessError(HarnessErrorCode.IoFailure, "release"))
                  : success(undefined),
              );
            },
          }),
        );
      },
    },
    admissionCloser: {
      beginClosing: () => {
        assertHeld(held, "admission");
        calls.admission += 1;
        events.push("admission");
        const injected = admissionFailures.shift();
        return Promise.resolve(
          injected === undefined
            ? success({
                state: unwrap(
                  createCodingTaskSessionAdmissionState({
                    workspaceId: closeoutManagerWorkspaceId,
                    sessionId: closeoutManagerSessionId,
                    activationBindingDigest: authority.activation.bindingDigest,
                    sessionBindingDigest: unwrap(
                      parseContentDigest(authority.binding.sessionBindingDigest),
                    ),
                    updatedAt: "2026-07-26T00:00:01.000Z",
                  }),
                ),
              })
            : failure(injected),
        );
      },
    },
    coverageBuilder: {
      create: () => {
        assertHeld(held, "coverage");
        calls.coverage += 1;
        events.push("coverage");
        const injected = coverageFailures.shift();
        if (injected !== undefined) return Promise.resolve(failure(injected));
        return Promise.resolve(
          createCloseoutManagerCoverageResult(authority, options.coverageTargetMismatch === true),
        );
      },
    },
    snapshotInspector: {
      execute: () => {
        assertHeld(held, "snapshot");
        calls.snapshot += 1;
        events.push("snapshot");
        const injected = snapshotFailures.shift();
        return Promise.resolve(injected === undefined ? success(snapshot()) : failure(injected));
      },
    },
    checkpointPort: {
      execute: () => {
        assertHeld(held, "checkpoint execute");
        calls.checkpointExecute += 1;
        events.push("checkpoint:execute");
        if (options.checkpointExecuteThrow !== undefined) {
          throw options.checkpointExecuteThrow;
        }
        const injected = checkpointFailures.shift();
        return Promise.resolve(
          injected === undefined
            ? success({
                outcome: options.checkpointOutcome ?? ActionOutcome.Succeeded,
                evidenceIds: [],
              })
            : failure(injected),
        );
      },
      inspect: () => {
        assertHeld(held, "checkpoint inspect");
        events.push("checkpoint:inspect");
        return Promise.resolve(
          options.checkpointInspectFailure === undefined
            ? success(checkpoint(snapshot()))
            : failure(options.checkpointInspectFailure),
        );
      },
    },
    digest: createCloseoutManagerDigest(options.checkpointBindingDigestThrow === true),
    clock: createCloseoutManagerClock(options.clockNowFailureAt),
  };

  return {
    manager: new CodingTaskSessionCloseoutManager(dependencies),
    events,
    calls,
    get state() {
      return currentState;
    },
  };
}

function assertHeld(held: boolean, operation: string): void {
  if (!held) throw new Error(`${operation} outside Repository Lock`);
}
