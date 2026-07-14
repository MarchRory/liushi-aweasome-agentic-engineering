import { describe, expect, it } from "vitest";

import { includesExactTextWithNormalizedLineEndings } from "../../scripts/codexHostSmoke/verification/textEvidence/index.mjs";

describe("Codex Host Smoke Text Evidence", () => {
  it("仅忽略 LF、CRLF 与 CR 行尾差异", () => {
    const expected = '[projects."C:\\\\repo"]\ntrust_level = "trusted"';

    expect(
      includesExactTextWithNormalizedLineEndings(
        `prefix\r\n${expected.replaceAll("\n", "\r\n")}\r\nsuffix`,
        expected,
      ),
    ).toBe(true);
    expect(
      includesExactTextWithNormalizedLineEndings(
        `prefix\r${expected.replaceAll("\n", "\r")}\rsuffix`,
        expected,
      ),
    ).toBe(true);
  });

  it("不忽略行尾之外的空白或内容漂移", () => {
    const expected = '[projects."C:\\\\repo"]\ntrust_level = "trusted"';

    expect(
      includesExactTextWithNormalizedLineEndings(
        '[projects."C:\\\\repo"]\r\ntrust_level  = "trusted"',
        expected,
      ),
    ).toBe(false);
  });
});
