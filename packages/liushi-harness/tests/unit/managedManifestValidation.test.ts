import { describe, expect, it } from "vitest";

import { HarnessErrorCode } from "../../src/common/index.js";
import {
  MANAGED_FILE_MANIFEST_SCHEMA_VERSION,
  compareManagedFilePath,
  parseManagedManifest,
} from "../../src/domain/installation/index.js";

describe("Managed file manifest validation", () => {
  it("接受以点开头目录中的受限相对路径", () => {
    expect(
      parseManagedManifest({
        schemaVersion: MANAGED_FILE_MANIFEST_SCHEMA_VERSION,
        entries: [entry()],
      }),
    ).toMatchObject({ status: "success", value: { entries: [{ path: ".codex/hooks.json" }] } });
  });

  it("拒绝重复路径和未知字段", () => {
    const value = entry();
    expect(
      parseManagedManifest({
        schemaVersion: MANAGED_FILE_MANIFEST_SCHEMA_VERSION,
        entries: [value, value],
      }),
    ).toMatchObject({ status: "failure", error: { code: HarnessErrorCode.CorruptStore } });
    expect(
      parseManagedManifest({
        schemaVersion: MANAGED_FILE_MANIFEST_SCHEMA_VERSION,
        entries: [],
        unexpected: true,
      }),
    ).toMatchObject({ status: "failure", error: { code: HarnessErrorCode.CorruptStore } });
  });

  it.each(["../hooks.json", ".codex/../hooks.json", "/.codex/hooks.json", ".codex\\hooks.json"])(
    "拒绝不安全路径 %s",
    (path) => {
      expect(
        parseManagedManifest({
          schemaVersion: MANAGED_FILE_MANIFEST_SCHEMA_VERSION,
          entries: [{ ...entry(), path }],
        }),
      ).toMatchObject({ status: "failure", error: { code: HarnessErrorCode.CorruptStore } });
    },
  );

  it("使用与 Locale 无关的稳定路径顺序", () => {
    expect([".codex/a.json", ".codex/B.json"].sort(compareManagedFilePath)).toEqual([
      ".codex/B.json",
      ".codex/a.json",
    ]);
  });
});

function entry() {
  return {
    path: ".codex/hooks.json",
    lastAppliedDigest: `sha256:${"a".repeat(64)}`,
    repositoryId: "repository-1",
    installationRevisionId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    installPlanDigest: `sha256:${"c".repeat(64)}`,
    original: { kind: "missing" },
    metadata: {
      ownerPackage: "liushi-harness",
      profile: "codex",
      packageVersion: "test",
      template: ".codex/hooks.json",
      source: "codex.hooks",
      sourceDigest: `sha256:${"b".repeat(64)}`,
    },
  };
}
