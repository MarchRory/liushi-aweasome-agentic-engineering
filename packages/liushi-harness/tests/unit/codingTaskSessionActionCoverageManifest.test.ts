import { describe, expect, it } from "vitest";

import {
  calculateCodingTaskSessionActionCoverageManifestDigest,
  CodingTaskSessionActionCoverageService,
  HarnessErrorCode,
  ResultStatus,
  parseContentDigest,
  rebuildCodingTaskSessionActionCoverageManifest,
  verifyCodingTaskSessionActionCoverageManifest,
  type CodingTaskSessionActionCoverageManifest,
  type ContentDigest,
  type ContentDigestPort,
  type HarnessError,
  type Result,
} from "../../src/index.js";
import { createCoverageFixture } from "../support/codingTaskSessionActionCoverage/index.js";

describe("CodingTask Session Action/Trace Coverage Proof Manifest v2", () => {
  it("允许 v2 roundtrip，并拒绝 targets 未知、空值、排序和路径漂移", async () => {
    const fixture = createCoverageFixture({ multiTrace: true });
    const created = await new CodingTaskSessionActionCoverageService(fixture.dependencies).create(
      fixture.input,
    );
    expect(created.status).toBe(ResultStatus.Success);
    if (created.status === ResultStatus.Failure) return;

    const rebuilt = verifyCodingTaskSessionActionCoverageManifest(created.value, fixture.digest);
    expect(rebuilt.status).toBe(ResultStatus.Success);
    expect(rebuilt).toEqual(created);
    expect(created.value.schemaVersion).toBe("coding-task-session.action-coverage.v2");
    expect(created.value.actions.every((action) => action.targets.length > 0)).toBe(true);
    expect(Object.isFrozen(created.value.actions[0]?.targets)).toBe(true);

    const actionWithTraces = created.value.actions.find(
      (action) => action.traceObservationDigests.length > 1,
    );
    expect(actionWithTraces).toBeDefined();
    if (actionWithTraces === undefined) return;

    const unknownField = rebuild(created.value, fixture.digest, {
      extra: true,
    });
    const unknownNestedField = rebuild(created.value, fixture.digest, {
      actions: created.value.actions.map((action) => ({ ...action, extra: true })),
    });
    const reverseActions = rebuild(created.value, fixture.digest, {
      actions: [...created.value.actions].reverse(),
    });
    const reverseTraces = rebuild(created.value, fixture.digest, {
      actions: created.value.actions.map((action) =>
        action.actionId === actionWithTraces.actionId
          ? { ...action, traceObservationDigests: [...action.traceObservationDigests].reverse() }
          : action,
      ),
    });
    const duplicateTraces = rebuild(created.value, fixture.digest, {
      actions: created.value.actions.map((action) =>
        action.actionId === actionWithTraces.actionId
          ? {
              ...action,
              traceObservationDigests: [
                action.traceObservationDigests[0]!,
                action.traceObservationDigests[0]!,
              ],
            }
          : action,
      ),
    });
    const duplicateAction = rebuild(created.value, fixture.digest, {
      actions: [...created.value.actions, created.value.actions[0]!],
    });
    const emptyActions = rebuild(created.value, fixture.digest, { actions: [] });
    const oversizedWorktree = rebuild(created.value, fixture.digest, {
      worktreeId: "w".repeat(257),
    });
    const emptyTraces = rebuild(created.value, fixture.digest, {
      actions: created.value.actions.map((action) => ({
        ...action,
        traceObservationDigests: [],
      })),
    });
    const missingTargets = rebuild(created.value, fixture.digest, {
      actions: created.value.actions.map((action) => {
        const candidate = { ...action } as Record<string, unknown>;
        delete candidate["targets"];
        return candidate;
      }),
    });
    const emptyTargets = rebuild(created.value, fixture.digest, {
      actions: created.value.actions.map((action) => ({ ...action, targets: [] })),
    });
    const reverseTargets = rebuild(created.value, fixture.digest, {
      actions: created.value.actions.map((action, index) =>
        index === 0 ? { ...action, targets: ["src/b.ts", "src/a.ts"] } : action,
      ),
    });
    const duplicateTargets = rebuild(created.value, fixture.digest, {
      actions: created.value.actions.map((action, index) =>
        index === 0 ? { ...action, targets: ["src/a.ts", "src/a.ts"] } : action,
      ),
    });
    const invalidTargets = rebuild(created.value, fixture.digest, {
      actions: created.value.actions.map((action, index) =>
        index === 0 ? { ...action, targets: ["../outside.ts"] } : action,
      ),
    });
    const absoluteTargets = rebuild(created.value, fixture.digest, {
      actions: created.value.actions.map((action, index) =>
        index === 0 ? { ...action, targets: ["/absolute.ts"] } : action,
      ),
    });
    const windowsTargets = rebuild(created.value, fixture.digest, {
      actions: created.value.actions.map((action, index) =>
        index === 0 ? { ...action, targets: ["src\\windows.ts"] } : action,
      ),
    });
    const platformInvalidTargets = rebuild(created.value, fixture.digest, {
      actions: created.value.actions.map((action, index) =>
        index === 0 ? { ...action, targets: ["src/invalid?.ts"] } : action,
      ),
    });

    for (const result of [
      unknownField,
      unknownNestedField,
      reverseActions,
      reverseTraces,
      duplicateTraces,
      duplicateAction,
      emptyActions,
      oversizedWorktree,
      emptyTraces,
      missingTargets,
      emptyTargets,
      reverseTargets,
      duplicateTargets,
      invalidTargets,
      absoluteTargets,
      windowsTargets,
      platformInvalidTargets,
    ]) {
      expectFailure(result, HarnessErrorCode.PreconditionNotMet);
    }

    const changedActions = created.value.actions.map((action, index) =>
      index === 0 ? { ...action, targets: ["src/rehashed.ts"] } : action,
    );
    const recalculated = calculateCodingTaskSessionActionCoverageManifestDigest(
      { ...created.value, actions: changedActions },
      fixture.digest,
    );
    expect(recalculated.status).toBe(ResultStatus.Success);
    if (recalculated.status === ResultStatus.Failure) return;
    expect(
      rebuild(created.value, fixture.digest, {
        actions: changedActions,
        manifestDigest: recalculated.value,
      }).status,
    ).toBe(ResultStatus.Success);
  });

  it.each(["manifest", "journal", "trace", "targets"])("拒绝 %s digest 漂移", async (kind) => {
    const fixture = createCoverageFixture({ multiTrace: true });
    const created = await new CodingTaskSessionActionCoverageService(fixture.dependencies).create(
      fixture.input,
    );
    expect(created.status).toBe(ResultStatus.Success);
    if (created.status === ResultStatus.Failure) return;
    const drift = contentDigest("f");
    const changed =
      kind === "manifest"
        ? { manifestDigest: drift }
        : {
            actions: created.value.actions.map((action, index) =>
              index === 0
                ? {
                    ...action,
                    ...(kind === "journal"
                      ? { journalDigest: drift }
                      : kind === "trace"
                        ? {
                            traceObservationDigests: [
                              drift,
                              ...action.traceObservationDigests.slice(1),
                            ],
                          }
                        : kind === "targets"
                          ? { targets: ["src/target-drift.ts"] }
                          : {}),
                  }
                : action,
            ),
          };
    const result = rebuild(created.value, fixture.digest, changed);

    expectFailure(result, HarnessErrorCode.PreconditionNotMet);
  });
});

function rebuild(
  manifest: CodingTaskSessionActionCoverageManifest,
  digestPort: ContentDigestPort,
  changes: Record<string, unknown>,
): Result<CodingTaskSessionActionCoverageManifest, HarnessError> {
  return rebuildCodingTaskSessionActionCoverageManifest({ ...manifest, ...changes }, digestPort);
}

function contentDigest(value: string): ContentDigest {
  const result = parseContentDigest(`sha256:${value.repeat(64)}`.slice(0, 71));
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}

function expectFailure(result: Result<unknown, HarnessError>, code: HarnessErrorCode): void {
  expect(result.status).toBe(ResultStatus.Failure);
  if (result.status === ResultStatus.Failure) expect(result.error.code).toBe(code);
}
