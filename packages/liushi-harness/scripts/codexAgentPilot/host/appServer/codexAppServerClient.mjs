import { spawn } from "node:child_process";
import process from "node:process";
import { StringDecoder } from "node:string_decoder";
import { clearTimeout, setTimeout } from "node:timers";

import {
  shouldCreateDetachedProcessGroup,
  terminateProcessTree,
} from "../../../common/process/index.mjs";
import {
  CODEX_APP_SERVER_OUTPUT_LIMIT,
  CODEX_APP_SERVER_REQUEST_IDS,
  CODEX_APP_SERVER_TIMEOUT_MS,
} from "../../constants/index.mjs";

export function listCodexSessionHooks(input, overrides = {}) {
  validateInput(input);
  const spawnProcess = overrides.spawnProcess ?? spawn;
  const terminateChild = overrides.terminateProcessTree ?? terminateProcessTree;
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnProcess(input.executable, input.arguments, {
        cwd: input.cwd,
        env: {
          ...process.env,
          CODEX_HOME: input.codexHome,
          NO_UPDATE_NOTIFIER: "1",
        },
        shell: false,
        detached: shouldCreateDetachedProcessGroup(),
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (error) {
      reject(new Error("Codex app-server 无法启动。", { cause: error }));
      return;
    }

    if (child.stdin === null || child.stdout === null || child.stderr === null) {
      void terminateChild(child).then(
        () => reject(new Error("Codex app-server 缺少标准流。")),
        (error) => reject(new Error("Codex app-server 缺少标准流且无法终止。", { cause: error })),
      );
      return;
    }

    const stdoutDecoder = new StringDecoder("utf8");
    const stderrDecoder = new StringDecoder("utf8");
    let stdoutBuffer = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let initializeResult;
    let hooksListResponse;
    let settled = false;
    let protocolComplete = false;
    let failure;
    let terminationStarted = false;
    let timeout;

    const settleRejected = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    };

    const requestFailure = (error, terminate = true) => {
      if (settled) return;
      failure ??= error;
      clearTimeout(timeout);
      if (!terminate || terminationStarted) return;
      terminationStarted = true;
      try {
        child.stdin.destroy();
      } catch {
        // stdin 可能已由 app-server 关闭。
      }
      void terminateChild(child).catch((terminationError) => {
        const combined = new Error("Codex app-server 失败后无法确认进程树已退出。", {
          cause: terminationError,
        });
        combined.processMayBeRunning = true;
        settleRejected(combined);
      });
    };

    const send = (message) => {
      try {
        child.stdin.write(`${JSON.stringify(message)}\n`, "utf8");
        return true;
      } catch (error) {
        requestFailure(new Error("Codex app-server stdin 写入失败。", { cause: error }));
        return false;
      }
    };

    const handleMessage = (line) => {
      let message;
      try {
        message = JSON.parse(line);
      } catch (error) {
        requestFailure(new Error("Codex app-server 输出了无效 JSONL。", { cause: error }));
        return;
      }
      if (message.id === CODEX_APP_SERVER_REQUEST_IDS.Initialize) {
        if (initializeResult !== undefined || message.error !== undefined) {
          requestFailure(new Error("Codex app-server initialize 响应无效。"));
          return;
        }
        initializeResult = message.result;
        if (send({ method: "initialized", params: {} })) {
          send({
            id: CODEX_APP_SERVER_REQUEST_IDS.HooksList,
            method: "hooks/list",
            params: { cwds: [input.cwd] },
          });
        }
        return;
      }
      if (message.id === CODEX_APP_SERVER_REQUEST_IDS.HooksList) {
        if (
          initializeResult === undefined ||
          hooksListResponse !== undefined ||
          message.error !== undefined
        ) {
          requestFailure(new Error("Codex app-server hooks/list 响应无效。"));
          return;
        }
        hooksListResponse = message.result;
        protocolComplete = true;
        try {
          child.stdin.end();
        } catch (error) {
          requestFailure(new Error("Codex app-server stdin 关闭失败。", { cause: error }));
        }
        return;
      }
      if (message.id !== undefined) {
        requestFailure(new Error("Codex app-server 返回了未知响应 ID。"));
      }
    };

    child.stdout.on("data", (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > CODEX_APP_SERVER_OUTPUT_LIMIT) {
        requestFailure(new Error("Codex app-server stdout 超出安全上限。"));
        return;
      }
      stdoutBuffer += stdoutDecoder.write(chunk);
      const lines = stdoutBuffer.split(/\r?\n/u);
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.length > 0 && !settled) handleMessage(line);
      }
    });

    child.stderr.on("data", (chunk) => {
      stderrBytes += chunk.length;
      if (stderrBytes > CODEX_APP_SERVER_OUTPUT_LIMIT) {
        requestFailure(new Error("Codex app-server stderr 超出安全上限。"));
        return;
      }
      stderr += stderrDecoder.write(chunk);
    });

    child.stdin.on("error", (error) => {
      if (!protocolComplete) {
        requestFailure(new Error("Codex app-server stdin 写入失败。", { cause: error }));
      }
    });
    child.on("error", (error) => {
      requestFailure(new Error("Codex app-server 进程失败。", { cause: error }));
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      clearTimeout(timeout);
      stdoutBuffer += stdoutDecoder.end();
      stderr += stderrDecoder.end();
      if (stdoutBuffer.trim().length > 0) handleMessage(stdoutBuffer.trim());
      if (settled) return;
      if (failure !== undefined) {
        settleRejected(failure);
        return;
      }
      if (code !== 0 || !protocolComplete) {
        settleRejected(
          new Error(
            `Codex app-server 未完成只读预检：code=${String(code)} signal=${String(signal)} stderr=${summarize(stderr)}`,
          ),
        );
        return;
      }
      settled = true;
      resolve({ initializeResult, hooksListResponse, stderr });
    });

    timeout = setTimeout(() => {
      requestFailure(new Error("Codex app-server 只读预检超时。"));
    }, input.timeoutMs ?? CODEX_APP_SERVER_TIMEOUT_MS);
    send({
      id: CODEX_APP_SERVER_REQUEST_IDS.Initialize,
      method: "initialize",
      params: {
        clientInfo: {
          name: "liushi-harness",
          title: "liushi-harness",
          version: "0.0.0",
        },
        capabilities: { experimentalApi: true },
      },
    });
  });
}

function validateInput(input) {
  if (
    typeof input?.executable !== "string" ||
    !Array.isArray(input.arguments) ||
    input.arguments.length === 0 ||
    typeof input.cwd !== "string" ||
    typeof input.codexHome !== "string"
  ) {
    throw new Error("Codex app-server 输入无效。");
  }
}

function summarize(value) {
  const normalized = value.trim();
  return normalized.length <= 2_000 ? normalized : `${normalized.slice(0, 2_000)}…`;
}
