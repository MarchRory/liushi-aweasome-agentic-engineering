export const PACKAGE_NAME = "liushi-harness";

export const EXPECTED_BIN_NAMES = ["liushi-harness", "lh"];

export const EXPECTED_HELP_COMMANDS = ["doctor", "cell run", "hook probe"];

export const REQUIRED_PACKAGE_FILES = [
  "CHANGELOG.md",
  "LICENSE",
  "README.md",
  "THIRD_PARTY_NOTICES.md",
  "dist/index.js",
  "dist/index.cjs",
  "dist/index.d.ts",
  "dist/index.d.cts",
  "dist/bootstrap/cli/cliEntrypoint.js",
];

export const TEMP_DIRECTORY_PREFIX = "liushi-harness-package-smoke-";
