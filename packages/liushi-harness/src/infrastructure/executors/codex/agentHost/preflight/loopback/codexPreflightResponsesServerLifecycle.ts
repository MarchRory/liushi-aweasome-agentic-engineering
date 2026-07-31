import type { Server } from "node:http";
import type { Socket } from "node:net";

import { CODEX_PREFLIGHT_SERVER_CLOSE_DEADLINE_MS } from "../constants/index.js";

/** Responses 服务关闭流程所需的最小可变状态。 */
interface CodexPreflightResponsesServerLifecycleState {
  /** 请求处理或服务运行期间记录的首个致命错误。 */
  fatalError: Error | undefined;
  /** 首次关闭调用创建并由后续调用复用的 Promise。 */
  closePromise: Promise<{ readonly confirmed: true }> | undefined;
  /** 当前仍由服务持有的连接集合。 */
  readonly sockets: Set<Socket>;
}

/** 在固定 loopback 地址和随机系统端口启动 Responses 服务。 */
export function listenCodexPreflightResponsesServer(server: Server): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onError = (cause: Error): void => {
      server.off("listening", onListening);
      reject(cause);
    };
    const onListening = (): void => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen({ host: "127.0.0.1", port: 0 });
  });
}

/** 幂等关闭 Responses 服务并传播运行期致命错误。 */
export function closeCodexPreflightResponsesServerLifecycle(
  server: Server,
  state: CodexPreflightResponsesServerLifecycleState,
): Promise<{ readonly confirmed: true }> {
  if (state.closePromise !== undefined) return state.closePromise;
  state.closePromise = new Promise<{ readonly confirmed: true }>((resolve, reject) => {
    let callbackFinished = !server.listening;
    let settled = false;
    const finish = (): void => {
      if (settled || !callbackFinished) return;
      settled = true;
      clearTimeout(deadline);
      if (state.fatalError === undefined) {
        resolve({ confirmed: true });
      } else {
        reject(state.fatalError);
      }
    };
    const deadline = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("预检 Responses server 未在固定 deadline 内确认关闭。"));
    }, CODEX_PREFLIGHT_SERVER_CLOSE_DEADLINE_MS);
    if (server.listening) {
      server.close((cause?: Error) => {
        if (cause !== undefined) {
          settled = true;
          clearTimeout(deadline);
          reject(cause);
          return;
        }
        callbackFinished = true;
        finish();
      });
      server.closeIdleConnections?.();
      server.closeAllConnections?.();
    }
    for (const socket of state.sockets) socket.destroy();
    finish();
  });
  return state.closePromise;
}
