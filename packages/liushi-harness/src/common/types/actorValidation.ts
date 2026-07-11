import { MAX_ACTOR_ID_LENGTH } from "../constants/index.js";
import { HarnessError, HarnessErrorCode } from "../errors/index.js";
import { failure, success, type Result } from "../result/index.js";
import { ActorKind, type ActorRef } from "./actor.js";

/** 校验并规范化未知外部 Actor 引用。 */
export function validateActorRef(input: unknown): Result<ActorRef, HarnessError> {
  if (typeof input !== "object" || input === null) {
    return failure(
      new HarnessError(HarnessErrorCode.InvalidInput, "Actor must be an object.", {
        field: "actor",
      }),
    );
  }

  const actor = input as Readonly<Record<string, unknown>>;
  if (!isActorKind(actor["kind"])) {
    return failure(
      new HarnessError(HarnessErrorCode.InvalidInput, "Actor kind is not supported.", {
        field: "actor.kind",
      }),
    );
  }
  const actorIdValue = actor["actorId"];
  if (typeof actorIdValue !== "string") {
    return failure(
      new HarnessError(HarnessErrorCode.InvalidInput, "Actor ID must be a string.", {
        field: "actor.actorId",
      }),
    );
  }

  const actorId = actorIdValue.trim();
  if (actorId.length === 0 || actorId.length > MAX_ACTOR_ID_LENGTH) {
    return failure(
      new HarnessError(
        HarnessErrorCode.InvalidInput,
        `Actor ID must contain 1-${MAX_ACTOR_ID_LENGTH} characters.`,
        { field: "actor.actorId" },
      ),
    );
  }
  return success({ kind: actor["kind"], actorId });
}

function isActorKind(value: unknown): value is ActorKind {
  switch (value) {
    case ActorKind.System:
    case ActorKind.Human:
    case ActorKind.Agent:
      return true;
  }
  return false;
}
