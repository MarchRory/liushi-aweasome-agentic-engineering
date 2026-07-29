export const CODEX_PREFLIGHT_VERSION = "codex-cli 0.145.0";
export const CODEX_PREFLIGHT_TEMPORARY_ROOT_PREFIX = "liushi-codex-app-server-preflight-";
export const CODEX_PREFLIGHT_OWNER_FILE = ".liushi-codex-app-server-preflight-owner";
export const CODEX_PREFLIGHT_OWNER_MARKER = "liushi.codex-agent-pilot.app-server-preflight.v1";

export const CODEX_PREFLIGHT_SCENARIOS = Object.freeze({
  AllowedUpdate: "allowed_update",
  OutOfSetUpdate: "out_of_set_update",
});

export const CODEX_PREFLIGHT_RESULTS = Object.freeze({
  Accepted: "accepted",
  Cancelled: "cancelled",
});

export const CODEX_PREFLIGHT_CHANGE_KINDS = Object.freeze({
  Update: "update",
});

export const CODEX_PREFLIGHT_OUTCOMES = Object.freeze({
  Succeeded: "succeeded",
  Denied: "denied",
});

export const CODEX_PREFLIGHT_SSE_EVENTS = Object.freeze({
  OutputItemDone: "response.output_item.done",
  Completed: "response.completed",
});

export const CODEX_PREFLIGHT_SCENARIO_DIRECTORIES = Object.freeze({
  [CODEX_PREFLIGHT_SCENARIOS.AllowedUpdate]: "allowed-update",
  [CODEX_PREFLIGHT_SCENARIOS.OutOfSetUpdate]: "out-of-set-update",
});

export const CODEX_PREFLIGHT_TARGET_FILE = "target.txt";
export const CODEX_PREFLIGHT_OUT_OF_SET_FILE = "outOfSet.txt";
export const CODEX_PREFLIGHT_INITIAL_CONTENT = "preflight-original\n";
export const CODEX_PREFLIGHT_UPDATED_CONTENT = "preflight-updated\n";
export const CODEX_PREFLIGHT_OUT_OF_SET_CONTENT = "preflight-out-of-set\n";
export const CODEX_PREFLIGHT_PROMPT =
  "Apply the single proposed file change and finish without any other tool call.";

export const CODEX_PREFLIGHT_ENVIRONMENT_NAMES = Object.freeze([
  "PATH",
  "Path",
  "SystemRoot",
  "WINDIR",
  "ComSpec",
  "PATHEXT",
  "PROCESSOR_ARCHITECTURE",
  "PROCESSOR_ARCHITEW6432",
  "NUMBER_OF_PROCESSORS",
  "PROCESSOR_IDENTIFIER",
  "PROCESSOR_LEVEL",
  "PROCESSOR_REVISION",
]);

export const CODEX_PREFLIGHT_LOOPBACK_NO_PROXY = "127.0.0.1,localhost";
