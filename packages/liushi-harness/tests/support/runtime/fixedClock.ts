import type { Clock } from "../../../src/index.js";

export class FixedClock implements Clock {
  private readonly instant: Date;

  public constructor(isoInstant: string) {
    this.instant = new Date(isoInstant);
  }

  public now(): Date {
    return new Date(this.instant);
  }
}
