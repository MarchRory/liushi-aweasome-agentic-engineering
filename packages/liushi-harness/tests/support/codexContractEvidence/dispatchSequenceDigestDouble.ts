import type { ContentDigestPort } from "../../../src/application/ports/contentDigest/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  failure,
  type ContentDigest,
  type Result,
} from "../../../src/common/index.js";

/** 记录完整 Dispatch 序列摘要，并可在指定序列调用注入基础设施失败。 */
export class DispatchSequenceDigestDouble implements ContentDigestPort {
  public readonly dispatchSequences: Array<readonly unknown[]> = [];

  public constructor(
    private readonly delegate: ContentDigestPort,
    private readonly failOnSequenceCall?: number,
  ) {}

  public calculate(input: unknown): Result<ContentDigest, HarnessError> {
    if (!isDispatchSequence(input)) return this.delegate.calculate(input);
    this.dispatchSequences.push(structuredClone(input));
    if (this.dispatchSequences.length === this.failOnSequenceCall) {
      return failure(
        new HarnessError(HarnessErrorCode.IoFailure, "Dispatch 序列摘要基础设施失败。", {
          sequenceCall: String(this.dispatchSequences.length),
        }),
      );
    }
    return this.delegate.calculate(input);
  }
}

function isDispatchSequence(input: unknown): input is readonly unknown[] {
  return (
    Array.isArray(input) &&
    input.every((item) => isRecord(item) && "command" in item && "payload" in item)
  );
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
