import { createHash } from "node:crypto";
import { resolve } from "node:path";

import type { CommandEnvelope } from "#application/index.js";

import {
  COMMAND_GATEWAY_DIRECTORY_NAME,
  COMMAND_RESERVATION_FILE_NAME,
  COMMAND_RESERVATION_LOCK_FILE_NAME,
} from "../constants/index.js";
import type { CommandReservationPaths } from "../contracts/index.js";

/** 按完整幂等作用域哈希分区，避免外部标识进入文件路径。 */
export function resolveCommandReservationPaths(
  storeRoot: string,
  command: CommandEnvelope,
): CommandReservationPaths {
  const scopeHash = createHash("sha256")
    .update(
      JSON.stringify([
        command.aggregateType,
        command.aggregateId,
        command.commandType,
        command.idempotencyKey,
      ]),
      "utf8",
    )
    .digest("hex");
  const directory = resolve(
    storeRoot,
    COMMAND_GATEWAY_DIRECTORY_NAME,
    scopeHash.slice(0, 2),
    scopeHash,
  );
  return {
    directory,
    recordFile: resolve(directory, COMMAND_RESERVATION_FILE_NAME),
    lockFile: resolve(directory, COMMAND_RESERVATION_LOCK_FILE_NAME),
  };
}
