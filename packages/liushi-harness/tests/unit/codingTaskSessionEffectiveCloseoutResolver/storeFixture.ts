import type { CodingTaskSessionCloseoutRecoveryState } from "#application/codingTaskSessionCloseoutRecovery/index.js";
import type { CodingTaskSessionCloseoutState } from "#application/codingTaskSessionCloseoutState/index.js";
import type {
  CodingTaskSessionCloseoutRecoveryStateStore,
  CodingTaskSessionCloseoutStateStore,
  ContentDigestPort,
} from "#application/ports/index.js";
import { HarnessError, HarnessErrorCode, success } from "#common/index.js";

import { digest } from "../../support/codingTaskSessionCloseout/index.js";

/** Resolver 测试保留的完整 Store fake 与调用计数。 */
export interface ResolverStoreFixture {
  readonly calls: Record<string, number>;
  readonly closeoutStateStore: CodingTaskSessionCloseoutStateStore<CodingTaskSessionCloseoutState>;
  readonly recoveryStateStore: CodingTaskSessionCloseoutRecoveryStateStore<CodingTaskSessionCloseoutRecoveryState>;
  readonly digest: ContentDigestPort;
}

/** 创建完整 fake Store，但 Resolver dependencies 只接收其只读能力。 */
export function createResolverStoreFixture(
  closeout: CodingTaskSessionCloseoutState,
  recovery: CodingTaskSessionCloseoutRecoveryState,
): ResolverStoreFixture {
  const calls: Record<string, number> = {};
  const count = (name: string): void => {
    calls[name] = (calls[name] ?? 0) + 1;
  };
  const closeoutStateStore: ResolverStoreFixture["closeoutStateStore"] = {
    create: () => unexpected(count, "closeout.create"),
    find: () => unexpected(count, "closeout.find"),
    load: () => {
      count("closeout.load");
      return Promise.resolve(success(closeout));
    },
    replace: () => unexpected(count, "closeout.replace"),
  };
  const recoveryStateStore: ResolverStoreFixture["recoveryStateStore"] = {
    create: () => unexpected(count, "recovery.create"),
    find: () => {
      count("recovery.find");
      return Promise.resolve(success(recovery));
    },
    load: () => unexpected(count, "recovery.load"),
    replace: () => unexpected(count, "recovery.replace"),
  };
  return {
    calls,
    closeoutStateStore,
    recoveryStateStore,
    digest: countingDigest(count),
  };
}

function countingDigest(count: (name: string) => void): ContentDigestPort {
  return {
    calculate(input: unknown) {
      count("digest.calculate");
      return digest.calculate(input);
    },
  };
}

function unexpected(count: (name: string) => void, name: string): Promise<never> {
  count(name);
  return Promise.reject(new HarnessError(HarnessErrorCode.OperationForbidden, "测试不允许调用。"));
}
