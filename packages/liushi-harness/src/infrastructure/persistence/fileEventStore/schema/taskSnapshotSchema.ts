import { z } from "zod";

import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  TASK_AGGREGATE_SNAPSHOT_SCHEMA_VERSION,
  TASK_SNAPSHOT_SCHEMA_VERSION,
  failure,
  success,
  type Result,
} from "#common/index.js";
import { parseApprovalRecord, parseDecisionRequest } from "#domain/approval/index.js";
import { parseSupportedArtifact } from "#domain/artifact/index.js";
import type { TaskSnapshot } from "#domain/task/index.js";
import {
  TaskCheckpoint,
  type PersistedTaskSnapshot,
  type TaskAggregate,
} from "#domain/taskRun/index.js";

import { createPersistenceSchemaError } from "./schemaError.js";
import { eventHashSchema, mapTaskState, taskStateSchema } from "./schemaPrimitives.js";

const legacyTaskSnapshotSchema = z
  .object({
    schemaVersion: z.literal(TASK_SNAPSHOT_SCHEMA_VERSION),
    task: taskStateSchema,
    lastSequence: z.number().int().positive(),
    lastEventHash: eventHashSchema,
  })
  .strict();
const taskAggregateSchema = z
  .object({
    task: taskStateSchema,
    checkpoint: z.enum(TaskCheckpoint),
    pendingDecision: z.unknown().optional(),
    artifacts: z.array(z.unknown()),
    approvals: z.array(z.unknown()),
  })
  .strict();
const aggregateSnapshotSchema = z
  .object({
    schemaVersion: z.literal(TASK_AGGREGATE_SNAPSHOT_SCHEMA_VERSION),
    aggregate: taskAggregateSchema,
    lastSequence: z.number().int().positive(),
    lastEventHash: eventHashSchema,
  })
  .strict();

/** 校验未知输入并返回旧版 Task-only Snapshot。 */
export function parseTaskSnapshot(input: unknown): Result<TaskSnapshot, HarnessError> {
  const parsed = legacyTaskSnapshotSchema.safeParse(input);
  if (!parsed.success) {
    return failure(createPersistenceSchemaError("Task snapshot", parsed.error));
  }
  return success({
    schemaVersion: parsed.data.schemaVersion,
    task: mapTaskState(parsed.data.task),
    lastSequence: parsed.data.lastSequence,
    lastEventHash: parsed.data.lastEventHash,
  });
}

/** 校验未知输入并返回旧版或 Aggregate Snapshot。 */
export function parsePersistedTaskSnapshot(
  input: unknown,
): Result<PersistedTaskSnapshot, HarnessError> {
  if (hasSchemaVersion(input, TASK_SNAPSHOT_SCHEMA_VERSION)) {
    return parseTaskSnapshot(input);
  }

  const parsed = aggregateSnapshotSchema.safeParse(input);
  if (!parsed.success) {
    return failure(createPersistenceSchemaError("Task aggregate snapshot", parsed.error));
  }
  const aggregate = parseTaskAggregate(parsed.data.aggregate);
  if (aggregate.status === ResultStatus.Failure) {
    return aggregate;
  }
  return success({
    schemaVersion: parsed.data.schemaVersion,
    aggregate: aggregate.value,
    lastSequence: parsed.data.lastSequence,
    lastEventHash: parsed.data.lastEventHash,
  });
}

function parseTaskAggregate(
  input: z.infer<typeof taskAggregateSchema>,
): Result<TaskAggregate, HarnessError> {
  const artifacts: TaskAggregate["artifacts"][number][] = [];
  for (const candidate of input.artifacts) {
    const parsed = parseSupportedArtifact(candidate);
    if (parsed.status === ResultStatus.Failure) {
      return nestedFailure("Task aggregate Artifact is invalid.", parsed.error);
    }
    artifacts.push(parsed.value);
  }

  const approvals: TaskAggregate["approvals"][number][] = [];
  for (const candidate of input.approvals) {
    const parsed = parseApprovalRecord(candidate);
    if (parsed.status === ResultStatus.Failure) {
      return nestedFailure("Task aggregate Approval is invalid.", parsed.error);
    }
    approvals.push(parsed.value);
  }

  const pending =
    input.pendingDecision === undefined ? undefined : parseDecisionRequest(input.pendingDecision);
  if (pending !== undefined && pending.status === ResultStatus.Failure) {
    return nestedFailure("Task aggregate DecisionRequest is invalid.", pending.error);
  }

  return success({
    task: mapTaskState(input.task),
    checkpoint: input.checkpoint,
    ...(pending === undefined ? {} : { pendingDecision: pending.value }),
    artifacts,
    approvals,
  });
}

function nestedFailure<T>(message: string, error: HarnessError): Result<T, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.CorruptStore, message, error.details, error));
}

function hasSchemaVersion(input: unknown, version: string): boolean {
  return (
    typeof input === "object" &&
    input !== null &&
    "schemaVersion" in input &&
    input.schemaVersion === version
  );
}
