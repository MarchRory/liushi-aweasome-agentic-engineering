/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-return */
import { describe, expect, it, vi } from "vitest";

import {
  HarnessErrorCode,
  PilotMetricsClaimEligibility,
  PilotMetricsCreateDisposition,
  PilotMetricsReportStatus,
  ResultStatus,
  success,
} from "../../src/index.js";
import {
  CLI_EXIT_CODE_CONFLICT,
  CLI_EXIT_CODE_SUCCESS,
  CliCommand,
  CliResponseStatus,
  parseCliArguments,
  runCli,
  type CliApplication,
  type RunCliDependencies,
} from "../../src/presentation/index.js";

const WORKSPACE = "workspace-1";
const SESSION = "01J00000000000000000000000";

function dependencies(application: unknown, document: unknown = {}) {
  let stdout = "";
  let stderr = "";
  const deps: RunCliDependencies = {
    defaultStoreRoot: ".runtime",
    applicationFactory: { create: vi.fn(() => application as CliApplication) },
    writer: {
      stdout: (value) => {
        stdout += value;
      },
      stderr: (value) => {
        stderr += value;
      },
    },
    jsonDocumentReader: { read: vi.fn(async () => success(document)) },
  };
  return {
    deps,
    get stdout() {
      return stdout;
    },
    get stderr() {
      return stderr;
    },
  };
}

describe("Pilot Metrics CLI", () => {
  it("parser 分别识别 enroll、settle、report 三条命令", () => {
    const parsed = [
      parseCliArguments([
        "coding-task",
        "session",
        "metrics",
        "enroll",
        "--file",
        "enrollment.json",
        "--workspace",
        WORKSPACE,
        "--session",
        SESSION,
        "--actor-id",
        "human-1",
      ]),
      parseCliArguments([
        "coding-task",
        "session",
        "metrics",
        "settle",
        "--file",
        "settlement.json",
        "--workspace",
        WORKSPACE,
        "--session",
        SESSION,
        "--actor-id",
        "human-1",
      ]),
      parseCliArguments([
        "coding-task",
        "session",
        "metrics",
        "report",
        "--workspace",
        WORKSPACE,
        "--session",
        SESSION,
      ]),
    ];
    expect(parsed.every((result) => result.status === ResultStatus.Success)).toBe(true);
    if (parsed.some((result) => result.status === ResultStatus.Failure)) return;
    const commands = parsed.map((result) => {
      if (result.status === ResultStatus.Failure) throw result.error;
      return result.value.command;
    });
    expect(commands).toEqual([
      CliCommand.CodingTaskSessionMetricsEnroll,
      CliCommand.CodingTaskSessionMetricsSettle,
      CliCommand.CodingTaskSessionMetricsReport,
    ]);
  });

  it("CLI Document workspace/session/actor mismatch fail closed", async () => {
    const application = { pilotMetrics: { enroll: vi.fn(), settle: vi.fn(), report: vi.fn() } };
    const setup = dependencies(application, {
      workspaceId: "workspace-other",
      sessionId: SESSION,
      actor: { actorId: "human-other" },
    });
    const code = await runCli(
      [
        "coding-task",
        "session",
        "metrics",
        "enroll",
        "--file",
        "enrollment.json",
        "--workspace",
        WORKSPACE,
        "--session",
        SESSION,
        "--actor-id",
        "human-1",
        "--json",
      ],
      setup.deps,
    );
    expect(code).toBe(4);
    expect(application.pilotMetrics.enroll).not.toHaveBeenCalled();
    expect(JSON.parse(setup.stderr)).toMatchObject({
      status: CliResponseStatus.Failure,
      error: { code: HarnessErrorCode.PreconditionNotMet },
    });
  });

  it("mutation conflict、not_measured 与 blocked claim exit=4，描述性 report exit=0", async () => {
    const conflict = dependencies({
      pilotMetrics: {
        enroll: vi.fn(async () =>
          success({ disposition: PilotMetricsCreateDisposition.Conflict, record: {} as never }),
        ),
        settle: vi.fn(),
        report: vi.fn(),
      },
    });
    expect(
      await runCli(
        [
          "coding-task",
          "session",
          "metrics",
          "enroll",
          "--file",
          "enrollment.json",
          "--workspace",
          WORKSPACE,
          "--session",
          SESSION,
          "--actor-id",
          "human-1",
          "--json",
        ],
        conflict.deps,
      ),
    ).toBe(CLI_EXIT_CODE_CONFLICT);
    expect(JSON.parse(conflict.stdout)).toMatchObject({
      status: CliResponseStatus.Blocked,
      command: CliCommand.CodingTaskSessionMetricsEnroll,
    });

    const notMeasured = dependencies({
      pilotMetrics: {
        enroll: vi.fn(),
        settle: vi.fn(),
        report: vi.fn(async () =>
          success({
            status: PilotMetricsReportStatus.NotMeasured,
            claimEligibility: PilotMetricsClaimEligibility.Blocked,
            missingFacts: [],
            enrollment: null,
            settlement: null,
            evidence: null,
          }),
        ),
      },
    });
    expect(
      await runCli(
        [
          "coding-task",
          "session",
          "metrics",
          "report",
          "--workspace",
          WORKSPACE,
          "--session",
          SESSION,
          "--json",
        ],
        notMeasured.deps,
      ),
    ).toBe(CLI_EXIT_CODE_CONFLICT);
    expect(JSON.parse(notMeasured.stdout)).toMatchObject({ status: CliResponseStatus.Blocked });

    const blockedClaim = dependencies({
      pilotMetrics: {
        enroll: vi.fn(),
        settle: vi.fn(),
        report: vi.fn(async () =>
          success({
            status: PilotMetricsReportStatus.DescriptiveAvailable,
            claimEligibility: PilotMetricsClaimEligibility.Blocked,
            missingFacts: [],
            enrollment: {},
            settlement: {},
            evidence: {},
          } as never),
        ),
      },
    });
    expect(
      await runCli(
        [
          "coding-task",
          "session",
          "metrics",
          "report",
          "--workspace",
          WORKSPACE,
          "--session",
          SESSION,
          "--json",
        ],
        blockedClaim.deps,
      ),
    ).toBe(CLI_EXIT_CODE_CONFLICT);
    expect(JSON.parse(blockedClaim.stdout)).toMatchObject({
      status: CliResponseStatus.Blocked,
    });

    const complete = dependencies({
      pilotMetrics: {
        enroll: vi.fn(),
        settle: vi.fn(),
        report: vi.fn(async () =>
          success({
            status: PilotMetricsReportStatus.DescriptiveAvailable,
            claimEligibility: PilotMetricsClaimEligibility.DescriptiveOnly,
            missingFacts: [],
            enrollment: null,
            settlement: null,
            evidence: { machineDurationMs: 1 },
          } as never),
        ),
      },
    });
    expect(
      await runCli(
        [
          "coding-task",
          "session",
          "metrics",
          "report",
          "--workspace",
          WORKSPACE,
          "--session",
          SESSION,
        ],
        complete.deps,
      ),
    ).toBe(CLI_EXIT_CODE_SUCCESS);
    expect(complete.stdout).toContain("status=descriptive_available");
  });

  it("JSON 与 Human 输出不混淆", async () => {
    const report = {
      status: PilotMetricsReportStatus.DescriptiveAvailable,
      claimEligibility: PilotMetricsClaimEligibility.DescriptiveOnly,
      missingFacts: [],
      enrollment: null,
      settlement: null,
      evidence: { machineDurationMs: 42 },
    };
    const json = dependencies({
      pilotMetrics: {
        enroll: vi.fn(),
        settle: vi.fn(),
        report: vi.fn(async () => success(report as never)),
      },
    });
    await runCli(
      [
        "coding-task",
        "session",
        "metrics",
        "report",
        "--workspace",
        WORKSPACE,
        "--session",
        SESSION,
        "--json",
      ],
      json.deps,
    );
    expect(() => JSON.parse(json.stdout)).not.toThrow();
    expect(json.stderr).toBe("");

    const human = dependencies({
      pilotMetrics: {
        enroll: vi.fn(),
        settle: vi.fn(),
        report: vi.fn(async () => success(report as never)),
      },
    });
    await runCli(
      [
        "coding-task",
        "session",
        "metrics",
        "report",
        "--workspace",
        WORKSPACE,
        "--session",
        SESSION,
      ],
      human.deps,
    );
    expect(human.stdout).toContain("Pilot metrics report:");
    expect(() => JSON.parse(human.stdout)).toThrow();
    expect(human.stderr).toBe("");
  });
});
