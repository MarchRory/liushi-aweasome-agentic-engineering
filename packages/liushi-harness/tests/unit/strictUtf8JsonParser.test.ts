import { describe, expect, it } from "vitest";

import { HarnessErrorCode, ResultStatus } from "../../src/common/index.js";
import {
  StrictJsonCanonicalPolicy,
  parseStrictUtf8Json,
} from "../../src/infrastructure/strictJsonFileReader/index.js";

describe("strict UTF-8 JSON parser", () => {
  it.each([
    ["重复 object key", Buffer.from('{"a":1,"a":2}', "utf8")],
    ["comments", Buffer.from('{/* comment */"a":1}', "utf8")],
    ["trailing comma", Buffer.from('{"a":1,}', "utf8")],
    ["invalid UTF-8", Buffer.from([0x7b, 0x22, 0x61, 0x22, 0x3a, 0xc3, 0x28, 0x7d])],
  ])("拒绝%s", (_name, content) => {
    const result = parseStrictUtf8Json(content, StrictJsonCanonicalPolicy.NotRequired);
    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.InvalidInput },
    });
  });

  it.each([StrictJsonCanonicalPolicy.NotRequired, StrictJsonCanonicalPolicy.Required])(
    "%s 策略拒绝 UTF-8 BOM",
    (canonicalPolicy) => {
      const result = parseStrictUtf8Json(
        Buffer.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d, 0x0a]),
        canonicalPolicy,
      );
      expect(result).toMatchObject({
        status: ResultStatus.Failure,
        error: { code: HarnessErrorCode.InvalidInput },
      });
    },
  );

  it("canonical 模式要求规范 JSON 加单一末尾换行", () => {
    expect(
      parseStrictUtf8Json(
        Buffer.from('{"b":2,"a":1}\n', "utf8"),
        StrictJsonCanonicalPolicy.Required,
      ).status,
    ).toBe(ResultStatus.Failure);
    expect(
      parseStrictUtf8Json(Buffer.from('{"a":1}\n', "utf8"), StrictJsonCanonicalPolicy.Required)
        .status,
    ).toBe(ResultStatus.Success);
  });
});
