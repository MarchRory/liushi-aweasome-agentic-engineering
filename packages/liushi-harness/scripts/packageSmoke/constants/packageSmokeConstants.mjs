export const PACKAGE_NAME = "liushi-harness";

export const EXPECTED_BIN_NAMES = ["liushi-harness", "lh"];

export const EXPECTED_HELP_COMMANDS = [
  "doctor",
  "cell run",
  "coding-task session activate",
  "hook probe",
];

export const REQUIRED_PACKAGE_FILES = [
  "CHANGELOG.md",
  "LICENSE",
  "README.md",
  "THIRD_PARTY_NOTICES.md",
  "thirdPartyLicenses/sigstoreLicense.txt",
  "dist/index.js",
  "dist/index.cjs",
  "dist/index.d.ts",
  "dist/index.d.cts",
  "dist/bootstrap/cli/cliEntrypoint.js",
];

/** 发布物类型声明中禁止重新暴露的特权签名符号。 */
export const PRIVILEGED_SIGNING_DECLARATION_NAMES = [
  "SignExecutorCompatibilityReleaseAttestationUseCase",
  "SignExecutorCompatibilityReleaseManifestUseCase",
  "ExecutorCompatibilityAttestationSignerPort",
  "ExecutorCompatibilityReleaseApprovalAuthorityPort",
  "createExecutorCompatibilityReleaseApprovalVerificationReceipt",
];

export const TEMP_DIRECTORY_PREFIX = "liushi-harness-package-smoke-";
