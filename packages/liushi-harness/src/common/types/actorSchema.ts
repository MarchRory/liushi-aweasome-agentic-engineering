import { z } from "zod";

import { MAX_ACTOR_ID_LENGTH } from "../constants/index.js";
import { ActorKind } from "./actor.js";

/** ActorRef 的严格 Zod Schema。 */
export const actorRefSchema = z
  .object({
    kind: z.enum(ActorKind),
    actorId: z
      .string()
      .min(1)
      .max(MAX_ACTOR_ID_LENGTH)
      .refine((value) => value === value.trim()),
  })
  .strict();
