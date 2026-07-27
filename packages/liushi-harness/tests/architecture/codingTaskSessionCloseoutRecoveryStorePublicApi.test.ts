import { describe, expect, it } from "vitest";

import * as recoveryStorePublicApi from "../../src/infrastructure/persistence/fileCodingTaskSessionCloseoutRecoveryStore/index.js";

describe("Closeout Recovery Store public API", () => {
  it("只公开 Adapter，Port 枚举由 Application 层拥有", () => {
    expect(Object.keys(recoveryStorePublicApi)).toEqual([
      "FileCodingTaskSessionCloseoutRecoveryStore",
    ]);
  });
});
