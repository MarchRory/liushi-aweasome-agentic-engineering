import { describe, expect, it } from "vitest";

import { IN_TOTO_STATEMENT_V1_TYPE } from "../../src/domain/executorCompatibilityAttestation/index.js";
import { serializeExecutorCompatibilityInTotoStatement } from "../../src/infrastructure/executorCompatibilityAttestation/serialization/index.js";

describe("通用 in-toto Statement 序列化边界", () => {
  it("接受通用 Predicate 并按 RFC 8785 规范序列化", () => {
    const statement = {
      _type: IN_TOTO_STATEMENT_V1_TYPE,
      subject: [
        {
          name: "artifact.tgz",
          digest: { sha256: "a".repeat(64) },
        },
      ],
      predicateType: "https://example.com/predicate/v1",
      predicate: { z: 1, a: "value" },
    } as const;

    expect(serializeExecutorCompatibilityInTotoStatement(statement).toString("utf8")).toBe(
      '{"_type":"https://in-toto.io/Statement/v1","predicate":{"a":"value","z":1},"predicateType":"https://example.com/predicate/v1","subject":[{"digest":{"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},"name":"artifact.tgz"}]}',
    );
  });
});
