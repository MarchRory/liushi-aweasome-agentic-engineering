import { PilotExecutionMode, PilotStepPhase, PilotTaskClass } from "../../../dist/index.js";
import {
  PACKAGE_MANAGER,
  PILOT_CASE_SCHEMA_VERSION,
  PILOT_CASE_SOURCE_KIND,
  PILOT_PACKAGE_SCRIPT,
  PILOT_VALIDATOR_ID,
  PILOT_VERIFICATION_CHECK_ID,
  PILOT_VERIFICATION_KIND,
  REPOSITORY_ID,
  REPOSITORY_REVISION,
  REPOSITORY_URL,
  TASK_SOURCE,
  WORKSPACE_ID,
  WRITE_SET,
} from "../constants/index.mjs";
import { resolvePilotCorepackCommand } from "../harnessClient/index.mjs";
import {
  PILOT_CASE_PLAN_RISK_ARTIFACT_TYPE,
  PILOT_CASE_REQUIREMENT_ARTIFACT_TYPE,
} from "./pilotCaseConstants.mjs";

/** 创建现有公开项目回归使用的固定 Case。 */
export function createPublicCodexAgentPilotCase() {
  const command = resolvePilotCorepackCommand();
  return Object.freeze({
    schemaVersion: PILOT_CASE_SCHEMA_VERSION,
    sourceKind: PILOT_CASE_SOURCE_KIND.FixedPublic,
    workspaceId: WORKSPACE_ID,
    taskSource: TASK_SOURCE,
    repository: Object.freeze({
      id: REPOSITORY_ID,
      source: REPOSITORY_URL,
      revision: REPOSITORY_REVISION,
      roleHint: "application",
      packageManager: PACKAGE_MANAGER,
    }),
    writeSet: Object.freeze([...WRITE_SET]),
    historicalLogicChange: false,
    metrics: Object.freeze({
      pilotId: "public-defu-module-namespace-v1",
      taskClass: PilotTaskClass.Test,
      plannedSteps: Object.freeze([
        createPlannedStep("requirement_alignment", PilotStepPhase.Plan, PilotExecutionMode.Human),
        createPlannedStep("plan_confirmation", PilotStepPhase.Plan, PilotExecutionMode.Human),
        createPlannedStep("implementation", PilotStepPhase.Implement, PilotExecutionMode.Automated),
        createPlannedStep("verification", PilotStepPhase.Verify, PilotExecutionMode.Automated),
        createPlannedStep("review", PilotStepPhase.Review, PilotExecutionMode.Human),
      ]),
    }),
    verificationChecks: Object.freeze([
      createVerificationCheck({
        checkId: PILOT_VERIFICATION_CHECK_ID.Test,
        command,
        packageScript: PILOT_PACKAGE_SCRIPT.Test,
        validatorIds: [
          PILOT_VALIDATOR_ID.NodeProcessExitZero,
          PILOT_VALIDATOR_ID.PackageScriptTest,
        ],
      }),
      createVerificationCheck({
        checkId: PILOT_VERIFICATION_CHECK_ID.Typecheck,
        command,
        packageScript: PILOT_PACKAGE_SCRIPT.Typecheck,
        validatorIds: [
          PILOT_VALIDATOR_ID.NodeProcessExitZero,
          PILOT_VALIDATOR_ID.TypeScriptTypecheck,
        ],
      }),
    ]),
    requirementProposal: Object.freeze({
      artifactType: PILOT_CASE_REQUIREMENT_ARTIFACT_TYPE,
      status: "proposed",
      payload: Object.freeze({
        problem: "为 unjs/defu 的 isPlainObject 增加 module namespace object 回归测试。",
        goals: Object.freeze([
          "只修改 test/utils.test.ts。",
          "通过动态 import ../src/_utils 并断言 isPlainObject(namespace) 为 true。",
        ]),
        nonGoals: Object.freeze(["不修改 src/**。", "不修改其他文件或历史业务逻辑。"]),
        observableBehaviors: Object.freeze(["module namespace object 回归测试通过。"]),
        acceptanceCriteria: Object.freeze([
          "Write Set 只有 test/utils.test.ts。",
          "pnpm@10.33.4 test 通过。",
        ]),
        includedScopes: Object.freeze([...WRITE_SET]),
        forbiddenScopes: Object.freeze(["src/**", "除 test/utils.test.ts 外的任何文件"]),
        repositories: Object.freeze([REPOSITORY_ID]),
        edgeCases: Object.freeze(["动态 import 返回 module namespace object。"]),
        compatibilityConstraints: Object.freeze(["固定 revision 不变。"]),
        evidence: Object.freeze([]),
        claims: Object.freeze([]),
        unknowns: Object.freeze([]),
        humanAnswers: Object.freeze([]),
      }),
    }),
    planRiskProposal: Object.freeze({
      artifactType: PILOT_CASE_PLAN_RISK_ARTIFACT_TYPE,
      status: "proposed",
      payload: Object.freeze({
        steps: Object.freeze([
          Object.freeze({
            order: 1,
            action: "在 test/utils.test.ts 增加 module namespace object 回归测试。",
          }),
        ]),
        readSet: Object.freeze([...WRITE_SET]),
        writeSet: Object.freeze([...WRITE_SET]),
        risks: Object.freeze([
          Object.freeze({
            description: "测试运行时模块 namespace 行为可能受工具链影响。",
            mitigation: "使用 Node 启动 Corepack CLI 执行固定 pnpm test。",
          }),
        ]),
        riskLevel: "R2",
        historicalLogicChange: false,
        riskOperations: Object.freeze([
          Object.freeze({ target: WRITE_SET[0], reason: "新增固定回归测试。" }),
        ]),
        testPlan: Object.freeze([
          "node <corepack-cli> pnpm@10.33.4 install --offline --frozen-lockfile",
          "node <corepack-cli> pnpm@10.33.4 test",
        ]),
        rollbackPlan: Object.freeze(["仅回退本次受控 Worktree 的唯一 checkpoint。"]),
        requiredGates: Object.freeze([]),
      }),
    }),
    agentInstruction:
      "仅修改 test/utils.test.ts，增加 module namespace object 回归测试：动态 import ../src/_utils，并断言 isPlainObject(namespace) 为 true。",
  });
}

function createPlannedStep(stepId, phase, expectedExecutionMode) {
  return Object.freeze({ stepId, phase, required: true, expectedExecutionMode });
}

function createVerificationCheck(input) {
  return Object.freeze({
    checkId: input.checkId,
    kind: PILOT_VERIFICATION_KIND,
    requirement: "required",
    command: Object.freeze({
      executable: input.command.executable,
      args: Object.freeze([...input.command.args, PACKAGE_MANAGER, input.packageScript]),
      workingDirectory: "",
      allowedEnvironmentKeys: Object.freeze(["CI", "PATH"]),
    }),
    timeoutMs: 300000,
    retryable: false,
    selectionMode: "always",
    validatorIds: Object.freeze(input.validatorIds),
  });
}
