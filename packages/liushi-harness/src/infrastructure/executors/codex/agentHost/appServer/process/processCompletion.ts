import { clearTimeout, setTimeout } from "node:timers";

import {
  type CodexAppServerConfig,
  type CodexAppServerError,
  type CodexAppServerProcessInfo,
  type CodexAppServerProtocol,
  type CodexAppServerResult,
} from "../contracts/index.js";
import { CODEX_APP_SERVER_OUTCOMES, CODEX_APP_SERVER_TERMINATION_REASONS } from "../enums/index.js";
import { asCodexAppServerError, createCodexAppServerProcessError } from "./processHelpers.js";

/** 进程收口所需的只读运行时状态。 */
interface CodexAppServerProcessCompletionState {
  readonly settled: boolean;
  readonly closed: boolean;
  readonly messageChainSettled: boolean;
  readonly messageChainAbandoned: boolean;
  readonly terminationStarted: boolean;
  readonly terminationConfirmed: boolean;
  readonly timeout: ReturnType<typeof setTimeout> | undefined;
  readonly terminationConfirmationTimer: ReturnType<typeof setTimeout> | undefined;
  readonly terminationReason: CODEX_APP_SERVER_TERMINATION_REASONS | null;
  readonly closeCode: number | null;
  readonly closeSignal: NodeJS.Signals | null;
  readonly transportFailure: CodexAppServerError | null;
}

/** 创建进程收口函数所需的依赖。 */
interface CodexAppServerProcessCompletionOptions {
  readonly config: CodexAppServerConfig;
  readonly protocol: CodexAppServerProtocol;
  readonly getState: () => CodexAppServerProcessCompletionState;
  readonly setSettled: (value: boolean) => void;
  readonly setTerminationConfirmationTimer: (value: ReturnType<typeof setTimeout>) => void;
  readonly clearTerminationConfirmationTimer: () => void;
  readonly processInfo: () => CodexAppServerProcessInfo;
  readonly resolve: (result: CodexAppServerResult) => void;
  readonly reject: (reason: unknown) => void;
}

/** 进程收口函数集合。 */
interface CodexAppServerProcessCompletion {
  readonly finish: () => void;
  readonly armTerminationConfirmationTimer: () => void;
  readonly rejectUnknownTermination: (cause: unknown) => void;
}

/** 创建进程关闭、终止确认和协议结果的收口函数。 */
export function createCodexAppServerProcessCompletion(
  options: CodexAppServerProcessCompletionOptions,
): CodexAppServerProcessCompletion {
  const { config, protocol, getState, setSettled, setTerminationConfirmationTimer } = options;

  const armTerminationConfirmationTimer = (): void => {
    const state = getState();
    if (state.terminationConfirmationTimer !== undefined || state.closed || state.settled) return;
    setTerminationConfirmationTimer(
      setTimeout(() => {
        rejectUnknownTermination(new Error("codex app-server exit could not be confirmed"));
      }, config.terminationConfirmationTimeoutMs),
    );
  };

  const rejectUnknownTermination = (cause: unknown): void => {
    const state = getState();
    if (state.settled) return;
    setSettled(true);
    if (state.timeout !== undefined) clearTimeout(state.timeout);
    options.clearTerminationConfirmationTimer();
    const error = createCodexAppServerProcessError(
      "codex app-server process tree termination is unconfirmed",
      cause,
      true,
      true,
    );
    error.outcomeUnknown = true;
    error.terminationReason = state.terminationReason;
    error.protocolEvidence = protocol.getEvidence();
    options.reject(error);
  };

  const finish = (): void => {
    const state = getState();
    if (
      state.settled ||
      !state.closed ||
      (!state.messageChainSettled && !state.messageChainAbandoned)
    ) {
      return;
    }
    if (state.terminationStarted && !state.terminationConfirmed) return;
    setSettled(true);
    if (state.timeout !== undefined) clearTimeout(state.timeout);
    options.clearTerminationConfirmationTimer();
    const info = options.processInfo();

    if (state.transportFailure !== null) {
      state.transportFailure.protocolEvidence = protocol.getEvidence();
      state.transportFailure.processMayBeRunning = false;
      state.transportFailure.outcomeUnknown = false;
      options.reject(state.transportFailure);
      return;
    }

    if (
      state.terminationReason === CODEX_APP_SERVER_TERMINATION_REASONS.Timeout ||
      state.terminationReason === CODEX_APP_SERVER_TERMINATION_REASONS.OutputLimit ||
      state.terminationReason === CODEX_APP_SERVER_TERMINATION_REASONS.StderrLimit
    ) {
      options.resolve({
        outcome: protocol.getPolicyDenied()
          ? CODEX_APP_SERVER_OUTCOMES.Denied
          : CODEX_APP_SERVER_OUTCOMES.Interrupted,
        process: info,
        protocolEvidence: protocol.getEvidence(),
      });
      return;
    }

    try {
      const result = protocol.finalize(info);
      if (
        result.outcome === CODEX_APP_SERVER_OUTCOMES.Succeeded &&
        (state.closeCode !== 0 || state.closeSignal !== null)
      ) {
        result.outcome = CODEX_APP_SERVER_OUTCOMES.Failed;
      }
      options.resolve(result);
    } catch (cause) {
      const error = asCodexAppServerError(cause, "codex app-server protocol finalization failed");
      error.protocolEvidence ??= protocol.getEvidence();
      options.reject(error);
    }
  };

  return { finish, armTerminationConfirmationTimer, rejectUnknownTermination };
}
