import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

import { describe, expect, it } from "vitest";

import {
  createCodexAgentRuntimePlan,
  prepareCodexAgentRuntime,
  removeCodexAgentRuntime,
} from "../../../src/infrastructure/executors/codex/agentHost/runtimeIsolation/index.js";

const SYSTEM_SID = "S-1-5-18";
const SOURCE_STATE_DIGEST = `sha256:${"c".repeat(64)}`;
const ACL_EVIDENCE_PATH_ENVIRONMENT = "LIUSHI_RUNTIME_ACL_EVIDENCE_PATH";
const READ_ACL_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  `$targetPath = $env:${ACL_EVIDENCE_PATH_ENVIRONMENT}`,
  "$acl = Get-Acl -LiteralPath $targetPath",
  "$currentUserSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value",
  "$fullControl = [System.Security.AccessControl.FileSystemRights]::FullControl",
  "$containerInherit = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit",
  "$objectInherit = [System.Security.AccessControl.InheritanceFlags]::ObjectInherit",
  "$rules = @($acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]) | ForEach-Object {",
  "  [pscustomobject]@{",
  "    sid = $_.IdentityReference.Value",
  "    accessControlType = [int]$_.AccessControlType",
  "    isInherited = [bool]$_.IsInherited",
  "    hasFullControl = [bool](($_.FileSystemRights -band $fullControl) -eq $fullControl)",
  "    inheritsToContainers = [bool](($_.InheritanceFlags -band $containerInherit) -eq $containerInherit)",
  "    inheritsToObjects = [bool](($_.InheritanceFlags -band $objectInherit) -eq $objectInherit)",
  "  }",
  "})",
  "[pscustomobject]@{",
  "  areAccessRulesProtected = [bool]$acl.AreAccessRulesProtected",
  "  currentUserSid = $currentUserSid",
  "  rules = @($rules)",
  "} | ConvertTo-Json -Depth 4 -Compress",
].join("\n");

/** Windows ACL 只读证据。 */
interface WindowsAclEvidence {
  /** ACL 是否已关闭继承。 */
  readonly areAccessRulesProtected: boolean;
  /** 当前 Windows 用户 SID。 */
  readonly currentUserSid: string;
  /** 根目录上的访问控制项。 */
  readonly rules: readonly WindowsAclRuleEvidence[];
}

/** 单条 Windows ACL 访问控制项证据。 */
interface WindowsAclRuleEvidence {
  /** 访问主体 SID。 */
  readonly sid: string;
  /** 访问控制类型；零表示允许。 */
  readonly accessControlType: number;
  /** 是否为继承访问控制项。 */
  readonly isInherited: boolean;
  /** 是否包含完整控制权限。 */
  readonly hasFullControl: boolean;
  /** 是否向子目录继承。 */
  readonly inheritsToContainers: boolean;
  /** 是否向文件继承。 */
  readonly inheritsToObjects: boolean;
}

describe("Codex Agent Runtime Windows ACL", () => {
  it.runIf(process.platform === "win32")(
    "默认 runner 真实关闭继承并仅授予当前 SID 与 SYSTEM 完整控制",
    async () => {
      const sourceRoot = await mkdtemp(join(tmpdir(), "liushi-windows-acl-integration-"));
      const codexHomeSource = join(sourceRoot, "codex-home");
      await mkdir(codexHomeSource, { recursive: true });
      await writeFile(join(codexHomeSource, "auth.json"), "opaque-auth-content\n", {
        encoding: "utf8",
        mode: 0o600,
      });
      const plan = createCodexAgentRuntimePlan({
        codexHomeSource,
        taskId: "windows-acl",
        sourceStateDigest: SOURCE_STATE_DIGEST,
      });

      try {
        await prepareCodexAgentRuntime(plan);
        const rootEvidence = readWindowsAclEvidence(plan.root);
        const expectedSids = expectedAclSids(rootEvidence.currentUserSid);
        assertProtectedDirectoryAcl(rootEvidence, expectedSids);

        for (const directory of [
          plan.codexHome,
          plan.sqliteHome,
          plan.tempHome,
          plan.profileHome,
        ]) {
          const directoryEvidence = readWindowsAclEvidence(directory);
          expect(directoryEvidence.currentUserSid).toBe(rootEvidence.currentUserSid);
          assertProtectedDirectoryAcl(directoryEvidence, expectedSids);
        }

        const authEvidence = readWindowsAclEvidence(plan.authFile);
        expect(authEvidence.currentUserSid).toBe(rootEvidence.currentUserSid);
        assertExactFullControlAcl(authEvidence, expectedSids);
        expect(authEvidence.areAccessRulesProtected).toBe(false);
        expect(authEvidence.rules.every((rule) => rule.isInherited)).toBe(true);
      } finally {
        try {
          await removeCodexAgentRuntime(plan);
        } finally {
          await rm(sourceRoot, { recursive: true, force: true });
        }
      }
    },
  );
});

function readWindowsAclEvidence(path: string): WindowsAclEvidence {
  const result = spawnSync(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", READ_ACL_SCRIPT],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        [ACL_EVIDENCE_PATH_ENVIRONMENT]: path,
      },
      shell: false,
      windowsHide: true,
    },
  );
  if (result.error !== undefined) {
    throw new Error("PowerShell ACL 读取进程无法启动。", {
      cause: result.error,
    });
  }
  if (result.status !== 0) {
    throw new Error(
      `PowerShell ACL 读取失败，退出码 ${String(result.status)}：${result.stderr.trim()}`,
    );
  }

  const parsed: unknown = JSON.parse(result.stdout);
  return parseWindowsAclEvidence(parsed);
}

function parseWindowsAclEvidence(value: unknown): WindowsAclEvidence {
  if (!isRecord(value)) {
    throw new Error("PowerShell ACL 证据必须是对象。");
  }
  const rules = value["rules"];
  if (
    typeof value["areAccessRulesProtected"] !== "boolean" ||
    typeof value["currentUserSid"] !== "string" ||
    !isSid(value["currentUserSid"])
  ) {
    throw new Error("PowerShell ACL 证据字段无效。");
  }
  const normalizedRules = normalizeAclRules(rules);

  return {
    areAccessRulesProtected: value["areAccessRulesProtected"],
    currentUserSid: value["currentUserSid"],
    rules: normalizedRules.map(parseWindowsAclRuleEvidence),
  };
}

function parseWindowsAclRuleEvidence(value: unknown): WindowsAclRuleEvidence {
  if (
    !isRecord(value) ||
    typeof value["sid"] !== "string" ||
    !isSid(value["sid"]) ||
    typeof value["accessControlType"] !== "number" ||
    typeof value["isInherited"] !== "boolean" ||
    typeof value["hasFullControl"] !== "boolean" ||
    typeof value["inheritsToContainers"] !== "boolean" ||
    typeof value["inheritsToObjects"] !== "boolean"
  ) {
    throw new Error("PowerShell ACL 访问控制项字段无效。");
  }

  return {
    sid: value["sid"],
    accessControlType: value["accessControlType"],
    isInherited: value["isInherited"],
    hasFullControl: value["hasFullControl"],
    inheritsToContainers: value["inheritsToContainers"],
    inheritsToObjects: value["inheritsToObjects"],
  };
}

function normalizeAclRules(value: unknown): readonly unknown[] {
  const rules = Array.isArray(value) ? value : isRecord(value) ? [value] : [];
  if (rules.length === 0) {
    throw new Error("PowerShell ACL 证据不得缺少访问控制项。");
  }

  return rules;
}

function expectedAclSids(currentUserSid: string): readonly string[] {
  return [...new Set([currentUserSid, SYSTEM_SID])].sort();
}

function assertExactFullControlAcl(
  evidence: WindowsAclEvidence,
  expectedSids: readonly string[],
): void {
  expect(evidence.rules).toHaveLength(expectedSids.length);
  expect(evidence.rules.map((rule) => rule.sid).sort()).toEqual(expectedSids);
  for (const rule of evidence.rules) {
    expect(rule).toMatchObject({
      accessControlType: 0,
      hasFullControl: true,
    });
  }
}

function assertProtectedDirectoryAcl(
  evidence: WindowsAclEvidence,
  expectedSids: readonly string[],
): void {
  assertExactFullControlAcl(evidence, expectedSids);
  expect(evidence.areAccessRulesProtected).toBe(true);
  for (const rule of evidence.rules) {
    expect(rule).toMatchObject({
      isInherited: false,
      inheritsToContainers: true,
      inheritsToObjects: true,
    });
  }
}

function isSid(value: string): boolean {
  return /^S-\d-\d+(?:-\d+)+$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
