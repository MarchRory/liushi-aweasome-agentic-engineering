import { calculateCodingTaskSessionActionCoverageManifestDigest } from "../../../src/application/codingTaskSessionActionCoverage/index.js";
import type { ContentDigestPort } from "../../../src/application/ports/index.js";
import {
  ResultStatus,
  failure,
  success,
  type Clock,
  type HarnessError,
  type Result,
} from "../../../src/common/index.js";
import { digest } from "../codingTaskSessionCloseout/index.js";
import {
  createCloseoutManagerCoverage,
  type CloseoutManagerAuthorityFixture,
} from "./codingTaskSessionCloseoutManagerAuthorityFixture.js";

/** 构造正常或 target 越界的 Coverage 返回值。 */
export function createCloseoutManagerCoverageResult(
  authority: CloseoutManagerAuthorityFixture,
  targetMismatch: boolean,
): Result<ReturnType<typeof createCloseoutManagerCoverage>, HarnessError> {
  const coverage = createCloseoutManagerCoverage(authority);
  if (!targetMismatch) return success(coverage);
  const mismatched = {
    ...coverage,
    actions: coverage.actions.map((action, index) =>
      index === 0 ? { ...action, targets: ["src/not-in-write-set.ts"] } : action,
    ),
  };
  const manifestDigest = calculateCodingTaskSessionActionCoverageManifestDigest(mismatched, digest);
  return manifestDigest.status === ResultStatus.Failure
    ? failure(manifestDigest.error)
    : success({ ...mismatched, manifestDigest: manifestDigest.value });
}

/** 构造只在 Checkpoint binding digest 阶段抛错的摘要端口。 */
export function createCloseoutManagerDigest(throwOnCheckpointBinding: boolean): ContentDigestPort {
  if (!throwOnCheckpointBinding) return digest;
  return {
    calculate(input: unknown) {
      if (isCheckpointBindingDigestInput(input)) {
        throw new Error("injected checkpoint binding digest failure");
      }
      return digest.calculate(input);
    },
  };
}

/** 构造可在精确调用序号抛错的确定性 Clock。 */
export function createCloseoutManagerClock(failureAt: number | undefined): Clock {
  let calls = 0;
  return {
    now() {
      calls += 1;
      if (failureAt === calls) throw new Error("injected clock failure");
      return new Date("2026-07-26T00:00:03.000Z");
    },
  };
}

function isCheckpointBindingDigestInput(input: unknown): input is Record<string, unknown> {
  return (
    typeof input === "object" &&
    input !== null &&
    !Array.isArray(input) &&
    "checkpointDigest" in input &&
    "changeSetDigest" in input &&
    "preSubmitSnapshotDigest" in input
  );
}
