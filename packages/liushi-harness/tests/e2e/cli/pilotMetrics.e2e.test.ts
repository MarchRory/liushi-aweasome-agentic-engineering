import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CLI_EXIT_CODE_CONFLICT,
  CLI_EXIT_CODE_SUCCESS,
  CliCommand,
  CliResponseStatus,
} from "../../../src/presentation/index.js";
import {
  PilotMetricsClaimEligibility,
  PilotMetricsCreateDisposition,
  PilotMetricsReportStatus,
} from "../../../src/application/index.js";
import { ResultStatus } from "../../../src/common/index.js";
import { parseCodingTaskSessionId } from "../../../src/domain/codingTaskSession/index.js";
import { parseWorkspaceId } from "../../../src/domain/workspace/index.js";
import { resolveFilePilotMetricsStorePaths } from "../../../src/infrastructure/index.js";
import { enrollmentDraft, pilotMetricsIds } from "../../support/pilotMetrics/index.js";
import { runCommand, singleOutput, withStore } from "./support/index.js";

/** CLI JSON 响应信封。 */
interface CliEnvelope<T> {
  readonly command: CliCommand;
  readonly data: T;
  readonly status: CliResponseStatus;
}

describe("Pilot Metrics CLI 真实 Runtime Store E2E", () => {
  it("空 Runtime Store 的 report 返回 not_measured/blocked", async () => {
    await withStore(async (parentStoreRoot) => {
      const storeRoot = resolve(parentStoreRoot, "absent-store");
      const report = await runCommand(
        [
          "coding-task",
          "session",
          "metrics",
          "report",
          "--workspace",
          pilotMetricsIds.workspaceId,
          "--session",
          pilotMetricsIds.sessionId,
          "--store",
          storeRoot,
          "--json",
        ],
        storeRoot,
      );

      expect(report.exitCode).toBe(CLI_EXIT_CODE_CONFLICT);
      expect(report.stderr).toHaveLength(0);
      expect(parseEnvelope<Record<string, unknown>>(report.stdout)).toMatchObject({
        command: CliCommand.CodingTaskSessionMetricsReport,
        status: CliResponseStatus.Blocked,
        data: {
          status: PilotMetricsReportStatus.NotMeasured,
          claimEligibility: PilotMetricsClaimEligibility.Blocked,
        },
      });
    });
  });

  it("metrics enroll 持久化 Enrollment，重建 Application 后 report 稳定返回 not_measured/blocked", async () => {
    await withStore(async (storeRoot) => {
      const inputFile = resolve(storeRoot, "enrollment.json");
      await writeFile(inputFile, `${JSON.stringify(enrollmentDraft())}\n`, "utf8");

      const enroll = await runCommand(
        [
          "coding-task",
          "session",
          "metrics",
          "enroll",
          "--file",
          inputFile,
          "--workspace",
          pilotMetricsIds.workspaceId,
          "--session",
          pilotMetricsIds.sessionId,
          "--actor-id",
          "human-1",
          "--store",
          storeRoot,
          "--json",
        ],
        storeRoot,
      );

      expect(enroll.exitCode).toBe(CLI_EXIT_CODE_SUCCESS);
      expect(enroll.stderr).toHaveLength(0);
      const enrollOutput = parseSuccess<{
        readonly disposition: PilotMetricsCreateDisposition;
        readonly record: Record<string, unknown>;
      }>(enroll.stdout);
      expect(enrollOutput).toMatchObject({
        command: CliCommand.CodingTaskSessionMetricsEnroll,
        status: CliResponseStatus.Success,
        data: { disposition: PilotMetricsCreateDisposition.Created },
      });

      const workspaceId = parseWorkspaceId(pilotMetricsIds.workspaceId);
      const sessionId = parseCodingTaskSessionId(pilotMetricsIds.sessionId);
      if (workspaceId.status === ResultStatus.Failure) throw workspaceId.error;
      if (sessionId.status === ResultStatus.Failure) throw sessionId.error;
      const paths = resolveFilePilotMetricsStorePaths(
        storeRoot,
        workspaceId.value,
        sessionId.value,
      );
      const persistedEnrollment = await readFile(paths.enrollmentFile, "utf8");
      const recordDigest = enrollOutput.data.record["recordDigest"];
      expect(recordDigest).toEqual(expect.any(String));
      expect(JSON.parse(persistedEnrollment)).toMatchObject({
        recordDigest,
      });

      const replay = await runCommand(
        [
          "coding-task",
          "session",
          "metrics",
          "enroll",
          "--file",
          inputFile,
          "--workspace",
          pilotMetricsIds.workspaceId,
          "--session",
          pilotMetricsIds.sessionId,
          "--actor-id",
          "human-1",
          "--store",
          storeRoot,
          "--json",
        ],
        storeRoot,
      );
      expect(replay.exitCode).toBe(CLI_EXIT_CODE_SUCCESS);
      expect(
        parseSuccess<{ readonly disposition: PilotMetricsCreateDisposition }>(replay.stdout).data,
      ).toEqual({
        disposition: PilotMetricsCreateDisposition.Reused,
        record: enrollOutput.data.record,
      });
      await expect(readFile(paths.enrollmentFile, "utf8")).resolves.toBe(persistedEnrollment);

      const report = await runCommand(
        [
          "coding-task",
          "session",
          "metrics",
          "report",
          "--workspace",
          pilotMetricsIds.workspaceId,
          "--session",
          pilotMetricsIds.sessionId,
          "--store",
          storeRoot,
          "--json",
        ],
        storeRoot,
      );

      expect(report.exitCode).toBe(CLI_EXIT_CODE_CONFLICT);
      expect(report.stderr).toHaveLength(0);
      const reportOutput = parseEnvelope<{
        readonly status: PilotMetricsReportStatus;
        readonly claimEligibility: PilotMetricsClaimEligibility;
        readonly enrollment: Record<string, unknown>;
        readonly settlement: null;
      }>(report.stdout);
      expect(reportOutput).toMatchObject({
        command: CliCommand.CodingTaskSessionMetricsReport,
        status: CliResponseStatus.Blocked,
        data: {
          status: PilotMetricsReportStatus.NotMeasured,
          claimEligibility: PilotMetricsClaimEligibility.Blocked,
          enrollment: { recordDigest },
          settlement: null,
        },
      });
    });
  });
});

function parseSuccess<T>(stdout: readonly string[]): CliEnvelope<T> {
  return parseEnvelope<T>(stdout);
}

function parseEnvelope<T>(stdout: readonly string[]): CliEnvelope<T> {
  return JSON.parse(singleOutput(stdout)) as CliEnvelope<T>;
}
