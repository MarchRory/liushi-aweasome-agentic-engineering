import { describe, expect, it } from "vitest";

import { HarnessErrorCode, ResultStatus, parseContentDigest } from "../../src/common/index.js";
import {
  MANAGED_FILE_MANIFEST_SCHEMA_VERSION,
  bindManagedManifestSnapshot,
  compareManagedFilePath,
  createMissingManagedManifest,
  parseManagedManifest,
  serializeManagedManifest,
} from "../../src/domain/installation/index.js";

describe("受管文件清单校验", () => {
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

  it("把已解析条目与同一次现场读取的原文和摘要绑定", () => {
    const parsed = parseManagedManifest({
      schemaVersion: MANAGED_FILE_MANIFEST_SCHEMA_VERSION,
      entries: [entry()],
    });
    const digest = parseContentDigest(`sha256:${"d".repeat(64)}`);
    if (parsed.status === ResultStatus.Failure || digest.status === ResultStatus.Failure)
      throw new Error("测试数据无效");

    expect(bindManagedManifestSnapshot(parsed.value, "现场原文\n", digest.value)).toMatchObject({
      state: "present",
      content: "现场原文\n",
      digest: digest.value,
      entries: [{ path: ".codex/hooks.json" }],
    });
    expect(createMissingManagedManifest()).toEqual({ state: "missing", entries: [] });
  });

  it("序列化时稳定排序并删除运行时及未知字段", () => {
    const parsed = parseManagedManifest({
      schemaVersion: MANAGED_FILE_MANIFEST_SCHEMA_VERSION,
      entries: [entry(".codex/z.json"), entry(".codex/a.json")],
    });
    if (parsed.status === ResultStatus.Failure) throw parsed.error;
    const polluted = parsed.value.entries.map((value) => ({
      ...value,
      unexpected: true,
      metadata: { ...value.metadata, hidden: true },
    }));

    const serialized = serializeManagedManifest(polluted);
    expect(serialized.endsWith("\n")).toBe(true);
    expect(JSON.parse(serialized)).toEqual({
      schemaVersion: MANAGED_FILE_MANIFEST_SCHEMA_VERSION,
      entries: [entry(".codex/a.json"), entry(".codex/z.json")],
    });
    expect(serialized).not.toContain("provenance");
    expect(serialized).not.toContain("unexpected");
    expect(serialized).not.toContain("hidden");
  });
});

function entry(path = ".codex/hooks.json") {
  return {
    path,
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
