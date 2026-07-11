import { describe, expect, it } from "vitest";

import { ResultStatus } from "../../src/common/index.js";
import { Rfc8785Sha256DigestAdapter, canonicalizeJson } from "../../src/infrastructure/index.js";

describe("RFC 8785 Artifact Digest", () => {
  it("对不同属性插入顺序产生相同 Digest", () => {
    const adapter = new Rfc8785Sha256DigestAdapter();

    const first = adapter.calculate({ z: 1, nested: { b: true, a: "value" } });
    const second = adapter.calculate({ nested: { a: "value", b: true }, z: 1 });

    expect(first.status).toBe(ResultStatus.Success);
    expect(second.status).toBe(ResultStatus.Success);
    if (first.status === ResultStatus.Success && second.status === ResultStatus.Success) {
      expect(first.value).toBe(second.value);
      expect(first.value).toMatch(/^sha256:[a-f0-9]{64}$/);
    }
  });

  it("生成 RFC 8785 示例的规范 JSON", () => {
    const canonical = canonicalizeJson({
      numbers: [333333333.33333329, 1e30, 4.5, 2e-3, 1e-27],
      string: '€$\u000f\nA\'B"\\"/',
      literals: [null, true, false],
    });

    expect(canonical).toBe(
      '{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":"€$\\u000f\\nA\'B\\"\\\\\\"/"}',
    );
  });

  it.each([undefined, 1n, () => undefined])("拒绝不能表示为 JSON 的输入 %#", (input) => {
    const result = new Rfc8785Sha256DigestAdapter().calculate(input);

    expect(result.status).toBe(ResultStatus.Failure);
  });

  it("拒绝循环引用", () => {
    const input: Record<string, unknown> = {};
    input["self"] = input;

    const result = new Rfc8785Sha256DigestAdapter().calculate(input);

    expect(result.status).toBe(ResultStatus.Failure);
  });
});
