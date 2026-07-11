import type { IdGenerator } from "../../../src/index.js";

export class FixedSequenceIdGenerator implements IdGenerator {
  private index = 0;

  public constructor(private readonly ids: readonly string[]) {}

  public next(): string {
    const id = this.ids[this.index];
    if (id === undefined) {
      throw new Error("FixedSequenceIdGenerator exhausted.");
    }
    this.index += 1;
    return id;
  }
}
