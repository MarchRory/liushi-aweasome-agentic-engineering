import { describe, expect, it } from "vitest";

import {
  ProjectConfigDocumentFormat,
  ProjectConfigDocumentParseStatus,
} from "../../src/application/index.js";
import { StructuredProjectConfigParserAdapter } from "../../src/infrastructure/index.js";

const parser = new StructuredProjectConfigParserAdapter();

describe("StructuredProjectConfigParserAdapter", () => {
  it("parses JSONC comments and trailing commas without executing code", () => {
    const result = parser.parse({
      format: ProjectConfigDocumentFormat.Jsonc,
      content: `{
        // repository configuration
        "compilerOptions": { "strict": true, },
      }`,
    });

    expect(result).toEqual({
      status: ProjectConfigDocumentParseStatus.Parsed,
      value: { compilerOptions: { strict: true } },
    });
  });

  it("rejects dangerous object keys and malformed JSONC", () => {
    const dangerous = parser.parse({
      format: ProjectConfigDocumentFormat.Jsonc,
      content: '{"__proto__":{"polluted":true}}',
    });
    const malformed = parser.parse({
      format: ProjectConfigDocumentFormat.Jsonc,
      content: '{"strict":',
    });

    expect(dangerous.status).toBe(ProjectConfigDocumentParseStatus.Invalid);
    expect(malformed.status).toBe(ProjectConfigDocumentParseStatus.Invalid);
  });

  it("parses ordinary YAML and rejects aliases", () => {
    const ordinary = parser.parse({
      format: ProjectConfigDocumentFormat.Yaml,
      content: "packages:\n  - packages/*\n",
    });
    const aliased = parser.parse({
      format: ProjectConfigDocumentFormat.Yaml,
      content: "base: &base\n  strict: true\ncopy: *base\n",
    });

    expect(ordinary).toEqual({
      status: ProjectConfigDocumentParseStatus.Parsed,
      value: { packages: ["packages/*"] },
    });
    expect(aliased.status).toBe(ProjectConfigDocumentParseStatus.Invalid);
  });
});
