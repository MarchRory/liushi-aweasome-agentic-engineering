import {
  ARTIFACT_TYPES,
  PACKAGE_MANAGER,
  PILOT_PACKAGE_SCRIPT,
  PILOT_VALIDATOR_ID,
  PILOT_VERIFICATION_CHECK_ID,
  PILOT_VERIFICATION_KIND,
  PROJECT_PROFILE_PROPOSAL_SCHEMA_VERSION,
  REPOSITORY_ID,
  REPOSITORY_REVISION,
  WRITE_SET,
} from "../constants/index.mjs";
import { resolvePilotCorepackCommand } from "../harnessClient/index.mjs";

export function createProjectProfileProposal(report) {
  const candidate = report?.profileCandidates?.find(
    (entry) => entry.repositoryId === REPOSITORY_ID,
  );
  if (candidate === undefined) throw new Error("扫描报告缺少固定单仓候选。");
  if (candidate.repositoryRevision !== REPOSITORY_REVISION)
    throw new Error("扫描报告固定 revision 不匹配。");
  const command = resolvePilotCorepackCommand();
  return {
    artifactType: ARTIFACT_TYPES.ProjectProfile,
    status: "proposed",
    payload: {
      schemaVersion: PROJECT_PROFILE_PROPOSAL_SCHEMA_VERSION,
      discoveryReportDigest: report.digest,
      workspaceGraphRevision: report.workspaceGraphRevision,
      repositorySelections: [
        {
          repositoryId: candidate.repositoryId,
          repositoryRevision: candidate.repositoryRevision,
          profileCandidateDigest: candidate.digest,
          confirmedRole: candidate.roleHint,
          acceptedRuleIds: candidate.ruleCandidates.map((rule) => rule.ruleId),
          rejectedRuleIds: [],
          acceptedMechanismCandidateIds: candidate.mechanismCandidates.map(
            (item) => item.candidateId,
          ),
          rejectedMechanismCandidateIds: [],
          verificationChecks: [
            {
              checkId: PILOT_VERIFICATION_CHECK_ID.Test,
              kind: PILOT_VERIFICATION_KIND,
              requirement: "required",
              command: {
                executable: command.executable,
                args: [...command.args, PACKAGE_MANAGER, PILOT_PACKAGE_SCRIPT.Test],
                workingDirectory: "",
                allowedEnvironmentKeys: ["CI", "PATH"],
              },
              timeoutMs: 300000,
              retryable: false,
              selectionMode: "always",
              validatorIds: [
                PILOT_VALIDATOR_ID.NodeProcessExitZero,
                PILOT_VALIDATOR_ID.PackageScriptTest,
              ],
            },
            {
              checkId: PILOT_VERIFICATION_CHECK_ID.Typecheck,
              kind: PILOT_VERIFICATION_KIND,
              requirement: "required",
              command: {
                executable: command.executable,
                args: [...command.args, PACKAGE_MANAGER, PILOT_PACKAGE_SCRIPT.Typecheck],
                workingDirectory: "",
                allowedEnvironmentKeys: ["CI", "PATH"],
              },
              timeoutMs: 300000,
              retryable: false,
              selectionMode: "always",
              validatorIds: [
                PILOT_VALIDATOR_ID.NodeProcessExitZero,
                PILOT_VALIDATOR_ID.TypeScriptTypecheck,
              ],
            },
          ],
        },
      ],
    },
  };
}

export function createRequirementProposal() {
  return {
    artifactType: ARTIFACT_TYPES.Requirement,
    status: "proposed",
    payload: {
      problem: "为 unjs/defu 的 isPlainObject 增加 module namespace object 回归测试。",
      goals: [
        "只修改 test/utils.test.ts。",
        "通过动态 import ../src/_utils 并断言 isPlainObject(namespace) 为 true。",
      ],
      nonGoals: ["不修改 src/**。", "不修改其他文件或历史业务逻辑。"],
      observableBehaviors: ["module namespace object 回归测试通过。"],
      acceptanceCriteria: ["Write Set 只有 test/utils.test.ts。", "pnpm@10.33.4 test 通过。"],
      includedScopes: [...WRITE_SET],
      forbiddenScopes: ["src/**", "除 test/utils.test.ts 外的任何文件"],
      repositories: [REPOSITORY_ID],
      edgeCases: ["动态 import 返回 module namespace object。"],
      compatibilityConstraints: ["固定 revision 不变。"],
      evidence: [],
      claims: [],
      unknowns: [],
      humanAnswers: [],
    },
  };
}

export function createPlanRiskProposal() {
  return {
    artifactType: ARTIFACT_TYPES.PlanRisk,
    status: "proposed",
    payload: {
      steps: [
        { order: 1, action: "在 test/utils.test.ts 增加 module namespace object 回归测试。" },
      ],
      readSet: [...WRITE_SET],
      writeSet: [...WRITE_SET],
      risks: [
        {
          description: "测试运行时模块 namespace 行为可能受工具链影响。",
          mitigation: "使用 Node 启动 Corepack CLI 执行固定 pnpm test。",
        },
      ],
      riskLevel: "R2",
      historicalLogicChange: false,
      riskOperations: [{ target: WRITE_SET[0], reason: "新增固定回归测试。" }],
      testPlan: [
        "node <corepack-cli> pnpm@10.33.4 install --offline --frozen-lockfile",
        "node <corepack-cli> pnpm@10.33.4 test",
      ],
      rollbackPlan: ["仅回退本次受控 Worktree 的唯一 checkpoint。"],
      requiredGates: [],
    },
  };
}
