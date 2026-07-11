import { z } from "zod";

import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  TASK_EVENT_SCHEMA_VERSION,
  actorRefSchema,
  failure,
  success,
  type Result,
} from "#common/index.js";
import {
  APPROVAL_ULID_PATTERN,
  parseApprovalRecord,
  parseDecisionRequest,
  type ApprovalId,
} from "#domain/approval/index.js";
import {
  ARTIFACT_ID_PATTERN,
  parseArtifactDigest,
  parseSupportedArtifact,
  type ArtifactDigest,
  type ArtifactId,
} from "#domain/artifact/index.js";
import { GateReason, type GateEvaluation } from "#domain/gate/index.js";
import { GateEvaluationResult, GateId, RiskLevel } from "#domain/policy/index.js";
import { TaskEventType } from "#domain/task/index.js";
import {
  TaskRunEventType,
  type ApprovalRecordedEventRecord,
  type ArtifactCommittedEventRecord,
  type TaskRunEventRecord,
} from "#domain/taskRun/index.js";

import { createPersistenceSchemaError } from "./schemaError.js";
import {
  eventHashSchema,
  eventIdSchema,
  taskIdSchema,
  workspaceIdSchema,
} from "./schemaPrimitives.js";
import { parseTaskEventRecord } from "./taskCreatedSchema.js";

const artifactIdSchema = z
  .string()
  .regex(ARTIFACT_ID_PATTERN)
  .transform((value) => value as ArtifactId);
const artifactDigestSchema = z
  .string()
  .refine((value) => parseArtifactDigest(value).status === ResultStatus.Success)
  .transform((value) => value as ArtifactDigest);
const approvalIdSchema = z
  .string()
  .regex(APPROVAL_ULID_PATTERN)
  .transform((value) => value as ApprovalId);
const gateEvaluationSchema = z
  .object({
    result: z.enum(GateEvaluationResult),
    riskLevel: z.enum(RiskLevel),
    artifactId: artifactIdSchema,
    artifactDigest: artifactDigestSchema,
    requiredGates: z.array(z.enum(GateId)),
    satisfiedApprovals: z.array(approvalIdSchema),
    reasons: z.array(z.enum(GateReason)),
    evidenceIds: z.array(z.string().min(1)),
    evaluatedAt: z.string().datetime(),
  })
  .strict();
const commonEventFields = {
  schemaVersion: z.literal(TASK_EVENT_SCHEMA_VERSION),
  eventId: eventIdSchema,
  taskId: taskIdSchema,
  workspaceId: workspaceIdSchema,
  sequence: z.number().int().positive(),
  occurredAt: z.string().datetime(),
  actor: actorRefSchema,
  previousHash: eventHashSchema,
  hash: eventHashSchema,
};
const artifactCommittedEventSchema = z
  .object({
    ...commonEventFields,
    type: z.literal(TaskRunEventType.ArtifactCommitted),
    payload: z
      .object({
        artifact: z.unknown(),
        gateEvaluation: gateEvaluationSchema,
        decisionRequest: z.unknown().optional(),
      })
      .strict(),
  })
  .strict();
const approvalRecordedEventSchema = z
  .object({
    ...commonEventFields,
    type: z.literal(TaskRunEventType.ApprovalRecorded),
    payload: z
      .object({
        approval: z.unknown(),
        gateEvaluation: gateEvaluationSchema,
      })
      .strict(),
  })
  .strict();
const taskRunEventSchema = z.discriminatedUnion("type", [
  artifactCommittedEventSchema,
  approvalRecordedEventSchema,
]);

/** 校验未知输入并返回完整 Task Run Event union。 */
export function parseTaskRunEventRecord(input: unknown): Result<TaskRunEventRecord, HarnessError> {
  if (isTaskCreatedInput(input)) {
    return parseTaskEventRecord(input);
  }

  const parsed = taskRunEventSchema.safeParse(input);
  if (!parsed.success) {
    return failure(createPersistenceSchemaError("Task run event", parsed.error));
  }
  switch (parsed.data.type) {
    case TaskRunEventType.ArtifactCommitted:
      return parseArtifactCommittedEvent(parsed.data);
    case TaskRunEventType.ApprovalRecorded:
      return parseApprovalRecordedEvent(parsed.data);
  }
}

function parseArtifactCommittedEvent(
  event: z.infer<typeof artifactCommittedEventSchema>,
): Result<ArtifactCommittedEventRecord, HarnessError> {
  const artifact = parseSupportedArtifact(event.payload.artifact);
  if (artifact.status === ResultStatus.Failure) {
    return nestedFailure("ArtifactCommitted artifact is invalid.", artifact.error);
  }
  const decision =
    event.payload.decisionRequest === undefined
      ? undefined
      : parseDecisionRequest(event.payload.decisionRequest);
  if (decision !== undefined && decision.status === ResultStatus.Failure) {
    return nestedFailure("ArtifactCommitted DecisionRequest is invalid.", decision.error);
  }

  return success({
    ...mapCommonEvent(event),
    type: TaskRunEventType.ArtifactCommitted,
    payload: {
      artifact: artifact.value,
      gateEvaluation: mapGateEvaluation(event.payload.gateEvaluation),
      ...(decision === undefined ? {} : { decisionRequest: decision.value }),
    },
  });
}

function parseApprovalRecordedEvent(
  event: z.infer<typeof approvalRecordedEventSchema>,
): Result<ApprovalRecordedEventRecord, HarnessError> {
  const approval = parseApprovalRecord(event.payload.approval);
  if (approval.status === ResultStatus.Failure) {
    return nestedFailure("ApprovalRecorded approval is invalid.", approval.error);
  }
  return success({
    ...mapCommonEvent(event),
    type: TaskRunEventType.ApprovalRecorded,
    payload: {
      approval: approval.value,
      gateEvaluation: mapGateEvaluation(event.payload.gateEvaluation),
    },
  });
}

function mapCommonEvent(
  event: z.infer<typeof artifactCommittedEventSchema> | z.infer<typeof approvalRecordedEventSchema>,
) {
  return {
    schemaVersion: event.schemaVersion,
    eventId: event.eventId,
    taskId: event.taskId,
    workspaceId: event.workspaceId,
    sequence: event.sequence,
    occurredAt: event.occurredAt,
    actor: event.actor,
    previousHash: event.previousHash,
    hash: event.hash,
  };
}

function mapGateEvaluation(input: z.infer<typeof gateEvaluationSchema>): GateEvaluation {
  return {
    result: input.result,
    riskLevel: input.riskLevel,
    artifactId: input.artifactId,
    artifactDigest: input.artifactDigest,
    requiredGates: input.requiredGates,
    satisfiedApprovals: input.satisfiedApprovals,
    reasons: input.reasons,
    evidenceIds: input.evidenceIds,
    evaluatedAt: input.evaluatedAt,
  };
}

function nestedFailure<T>(message: string, error: HarnessError): Result<T, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.CorruptStore, message, error.details, error));
}

function isTaskCreatedInput(input: unknown): boolean {
  return (
    typeof input === "object" &&
    input !== null &&
    "type" in input &&
    input.type === TaskEventType.TaskCreated
  );
}
