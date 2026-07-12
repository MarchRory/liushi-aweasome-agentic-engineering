import { describe, expect, it } from "vitest";

import {
  ActorKind,
  HarnessErrorCode,
  RecordTraceObservationUseCase,
  ResultStatus,
  TRACE_OBSERVATION_SCHEMA_VERSION,
  TraceDropReason,
  TraceOperationKind,
  TraceSpanKind,
  TraceStatusCode,
  TraceWriteDisposition,
  parseTraceSpanObservation,
  type TraceObservationStore,
  type TraceSpanObservation,
} from "../../src/index.js";

describe("Trace Observation", () => {
  it("严格解析 OTel 兼容的 Tool Span", () => {
    const result = parseTraceSpanObservation(toolSpan());

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Success) {
      expect(result.value.tool?.toolName).toBe("workspace.writeFile");
      expect(result.value.traceId).toHaveLength(32);
      expect(result.value.spanId).toHaveLength(16);
    }
  });

  it.each([
    ["全零 Trace ID", { traceId: "0".repeat(32) }],
    ["结束时间早于开始时间", { endedAt: "2026-07-12T00:00:00.000Z" }],
    ["Error 缺少错误类别", { status: TraceStatusCode.Error }],
    ["Tool Span 缺少 Tool 身份", { tool: undefined }],
  ])("拒绝%s", (_name, override) => {
    const input: Record<string, unknown> = { ...toolSpan(), ...override };
    if ("tool" in override && override.tool === undefined) delete input["tool"];
    const result = parseTraceSpanObservation(input);

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.code).toBe(HarnessErrorCode.InvalidInput);
    }
  });

  it("将 Adapter 异常降级为 Dropped，而不是语义失败", async () => {
    const store: TraceObservationStore = {
      record(): Promise<never> {
        return Promise.reject(new Error("telemetry unavailable"));
      },
      query: () => Promise.reject(new Error("not used")),
    };
    const result = await new RecordTraceObservationUseCase(store).execute({
      observation: toolSpan(),
    });

    expect(result).toEqual({
      status: ResultStatus.Success,
      value: {
        disposition: TraceWriteDisposition.Dropped,
        reason: TraceDropReason.IoFailure,
        recoveryPaths: [],
      },
    });
  });
});

function toolSpan(): TraceSpanObservation {
  return {
    schemaVersion: TRACE_OBSERVATION_SCHEMA_VERSION,
    traceId: "11111111111111111111111111111111" as TraceSpanObservation["traceId"],
    spanId: "2222222222222222" as TraceSpanObservation["spanId"],
    workspaceId: "workspace-workflow-migration" as TraceSpanObservation["workspaceId"],
    taskId: "01ARZ3NDEKTSV4RRFFQ69G5FAW" as TraceSpanObservation["taskId"],
    commandId: "command-trace",
    correlationId: "correlation-trace",
    actor: { kind: ActorKind.Agent, actorId: "executor-agent" },
    operationKind: TraceOperationKind.Tool,
    operationName: "workspace.writeFile",
    spanKind: TraceSpanKind.Client,
    status: TraceStatusCode.Ok,
    startedAt: "2026-07-12T00:00:01.000Z",
    endedAt: "2026-07-12T00:00:02.000Z",
    tool: { toolName: "workspace.writeFile", toolCallId: "call-1" },
  };
}
