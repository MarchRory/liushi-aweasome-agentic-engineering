import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";

import writeFileAtomic from "write-file-atomic";

import type { RuntimeHealthPort, RuntimeHealthReport } from "#application/index.js";
import { HarnessError, HarnessErrorCode, failure, success, type Result } from "#common/index.js";

import { HEALTH_PROBE_CONTENT } from "../constants/index.js";

/** 通过原子文件往返检查 Runtime Store 的 Health Adapter。 */
export class FileRuntimeHealthAdapter implements RuntimeHealthPort {
  private readonly storeRoot: string;

  public constructor(storeRoot: string) {
    this.storeRoot = resolve(storeRoot);
  }

  /** 创建唯一 Probe、核对内容并仅清理该 Probe。 */
  public async check(): Promise<Result<RuntimeHealthReport, HarnessError>> {
    const probeFile = resolve(this.storeRoot, `.doctor-${randomUUID()}.tmp`);
    let probeCreated = false;
    try {
      await mkdir(this.storeRoot, { recursive: true });
      await writeFileAtomic(probeFile, HEALTH_PROBE_CONTENT, {
        encoding: "utf8",
        fsync: true,
        mode: 0o600,
      });
      probeCreated = true;
      if ((await readFile(probeFile, "utf8")) !== HEALTH_PROBE_CONTENT) {
        throw new HarnessError(
          HarnessErrorCode.IoFailure,
          "Runtime health probe content did not round-trip.",
          { probeFile },
        );
      }
      await rm(probeFile);
      probeCreated = false;
      return success({
        storeRoot: this.storeRoot,
        writable: true,
        atomicWriteVerified: true,
      });
    } catch (error) {
      const cleanupError = probeCreated ? await cleanProbe(probeFile) : undefined;
      if (error instanceof HarnessError && cleanupError === undefined) {
        return failure(error);
      }
      return failure(
        new HarnessError(
          HarnessErrorCode.IoFailure,
          "Runtime Store failed its atomic write health check.",
          { storeRoot: this.storeRoot },
          cleanupError === undefined ? error : new AggregateError([error, cleanupError]),
        ),
      );
    }
  }
}

async function cleanProbe(probeFile: string): Promise<Error | undefined> {
  try {
    await rm(probeFile);
    return undefined;
  } catch (error) {
    return error instanceof Error
      ? error
      : new Error("Unable to clean Runtime Store health probe.", { cause: error });
  }
}
