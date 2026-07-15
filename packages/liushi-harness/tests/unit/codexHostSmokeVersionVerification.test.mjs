import { describe, expect, it } from "vitest";

import { assertCodexHostSmokeVersion } from "../../scripts/codexHostSmoke/verification/index.mjs";

const VALID_VERSION = "0.144.0-alpha.4";

describe("Codex 宿主烟测版本校验", () => {
  it("接受带 Codex 命令行前缀的完整版本输出", () => {
    expect(() =>
      assertCodexHostSmokeVersion(createManifest(VALID_VERSION), `codex-cli ${VALID_VERSION}`),
    ).not.toThrow();
  });

  it.each([
    ["子串漂移", "codex-cli 0.144.0-alpha.4", "0.144.0"],
    ["相邻版本", "codex-cli 0.144.0.1", "0.144.0"],
    ["前缀版本", "codex-cli v0.144.0-alpha.4", VALID_VERSION],
    ["前缀字符串污染", `codex-cli x${VALID_VERSION}`, VALID_VERSION],
    ["后缀字符串污染", `codex-cli ${VALID_VERSION}suffix`, VALID_VERSION],
  ])("拒绝%s", (_label, actualVersion, manifestVersion) => {
    expect(() =>
      assertCodexHostSmokeVersion(createManifest(manifestVersion), actualVersion),
    ).toThrow();
  });

  it("拒绝包含多个不同版本的歧义输出", () => {
    expect(() =>
      assertCodexHostSmokeVersion(
        createManifest(VALID_VERSION),
        `codex-cli ${VALID_VERSION} and 0.144.1`,
      ),
    ).toThrow();
  });

  it.each(["", "Codex CLI version unknown", undefined])(
    "拒绝空值或无版本输出 %s",
    (actualVersion) => {
      expect(() =>
        assertCodexHostSmokeVersion(createManifest(VALID_VERSION), actualVersion),
      ).toThrow();
    },
  );

  it.each(["C:\\codex\\0.144.0-alpha.4", "版本 0.144.0-alpha.4", ""])(
    "拒绝不完整的清单版本值 %s",
    (manifestVersion) => {
      expect(() =>
        assertCodexHostSmokeVersion(createManifest(manifestVersion), `codex-cli ${VALID_VERSION}`),
      ).toThrow();
    },
  );
});

function createManifest(version) {
  return { codexProbe: { version } };
}
