import { monotonicFactory } from "ulid";

import type { IdGenerator } from "#common/index.js";

/** 使用单进程单调 ULID 的 ID Generator Adapter。 */
export class UlidGenerator implements IdGenerator {
  private readonly generate = monotonicFactory();

  /** 生成大写单调 ULID。 */
  public next(): string {
    return this.generate();
  }
}
