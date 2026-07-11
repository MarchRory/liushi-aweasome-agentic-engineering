import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { HarnessErrorCode, ResultStatus } from "../../src/index.js";
import {
  MAX_CLI_JSON_DOCUMENT_BYTES,
  NodeJsonDocumentReaderAdapter,
} from "../../src/presentation/index.js";
import { TemporaryRuntimeStore } from "../support/runtime/index.js";

const runtimeStores = new TemporaryRuntimeStore();

afterEach(async () => runtimeStores.cleanup());

describe("NodeJsonDocumentReaderAdapter", () => {
  it("解析合法 JSON 文档", async () => {
    const storeRoot = await runtimeStores.create("liushi-json-reader-valid-");
    const inputFile = resolve(storeRoot, "proposal.json");
    await writeFile(inputFile, '{"artifactType":"requirement_contract"}', "utf8");

    const result = await new NodeJsonDocumentReaderAdapter().read(inputFile);

    expect(result).toEqual({
      status: ResultStatus.Success,
      value: { artifactType: "requirement_contract" },
    });
  });

  it("非法 JSON 返回 InvalidInput", async () => {
    const storeRoot = await runtimeStores.create("liushi-json-reader-invalid-");
    const inputFile = resolve(storeRoot, "proposal.json");
    await writeFile(inputFile, "{invalid", "utf8");

    const result = await new NodeJsonDocumentReaderAdapter().read(inputFile);

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.code).toBe(HarnessErrorCode.InvalidInput);
    }
  });

  it("超过大小上限的 JSON 在解析前返回 InvalidInput", async () => {
    const storeRoot = await runtimeStores.create("liushi-json-reader-oversized-");
    const inputFile = resolve(storeRoot, "proposal.json");
    await writeFile(inputFile, Buffer.alloc(MAX_CLI_JSON_DOCUMENT_BYTES + 1, 0x20));

    const result = await new NodeJsonDocumentReaderAdapter().read(inputFile);

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.code).toBe(HarnessErrorCode.InvalidInput);
      expect(result.error.details["maxBytes"]).toBe(String(MAX_CLI_JSON_DOCUMENT_BYTES));
    }
  });
});
