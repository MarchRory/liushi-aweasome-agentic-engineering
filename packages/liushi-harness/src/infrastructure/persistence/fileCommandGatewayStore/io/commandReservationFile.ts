import { readFile } from "node:fs/promises";

import writeFileAtomic from "write-file-atomic";

import { HarnessError, HarnessErrorCode } from "#common/index.js";

import type { PersistedCommandReservation } from "../contracts/index.js";
import { parsePersistedCommandReservation } from "../schema/index.js";

/** 使用 fsync 和原子 Rename 写入 Command Reservation。 */
export async function writeCommandReservation(
  filePath: string,
  reservation: PersistedCommandReservation,
): Promise<void> {
  await writeFileAtomic(filePath, `${JSON.stringify(reservation)}\n`, {
    encoding: "utf8",
    fsync: true,
    mode: 0o600,
  });
}

/** 读取并严格校验 Command Reservation。 */
export async function readCommandReservation(
  filePath: string,
): Promise<PersistedCommandReservation> {
  try {
    return parsePersistedCommandReservation(
      JSON.parse(await readFile(filePath, "utf8")) as unknown,
    );
  } catch (error) {
    throw new HarnessError(
      HarnessErrorCode.CorruptStore,
      "Command Reservation 文件无效。",
      { recordFile: filePath },
      error,
    );
  }
}
