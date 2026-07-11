import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ResultStatus, createHarnessApplication } from "../../src/index.js";
import { TemporaryRuntimeStore } from "../support/runtime/index.js";

const runtimeStores = new TemporaryRuntimeStore();

afterEach(async () => runtimeStores.cleanup());

describe("runtime doctor", () => {
  it("原子 Probe 成功且不残留", async () => {
    const storeRoot = await runtimeStores.create("liushi-doctor-");
    const app = createHarnessApplication({ storeRoot });

    const result = await app.checkRuntimeHealth.execute();

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Success) {
      expect(result.value).toEqual({
        storeRoot: resolve(storeRoot),
        writable: true,
        atomicWriteVerified: true,
      });
    }
    const files = await readdir(storeRoot);
    expect(files.filter((file) => file.startsWith(".doctor-"))).toEqual([]);
  });
});
