import { describe, expect, it } from "vitest";

import { PROJECT_SCAN_MANIFEST_SCHEMA_VERSION, ResultStatus } from "../../src/common/index.js";
import {
  DEFAULT_SCAN_MAX_CONFIG_FILE_BYTES,
  DEFAULT_SCAN_MAX_CONFIG_FILES,
  DEFAULT_SCAN_MAX_DEPTH,
  DEFAULT_SCAN_MAX_DIAGNOSTICS,
  DEFAULT_SCAN_MAX_DIRECTORIES,
  DEFAULT_SCAN_MAX_FILES,
  DEFAULT_SCAN_MAX_TOTAL_CONFIG_BYTES,
  HARD_SCAN_MAX_DIRECTORIES,
  parseProjectScanManifest,
} from "../../src/domain/projectDiscovery/index.js";

describe("Project scan manifest", () => {
  it("fills every deterministic budget default", () => {
    const result = parseProjectScanManifest(manifest());

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Success) {
      expect(result.value.budget).toEqual({
        maxFilesPerRepository: DEFAULT_SCAN_MAX_FILES,
        maxDirectoriesPerRepository: DEFAULT_SCAN_MAX_DIRECTORIES,
        maxDepth: DEFAULT_SCAN_MAX_DEPTH,
        maxConfigFilesPerRepository: DEFAULT_SCAN_MAX_CONFIG_FILES,
        maxConfigFileBytes: DEFAULT_SCAN_MAX_CONFIG_FILE_BYTES,
        maxTotalConfigBytesPerRepository: DEFAULT_SCAN_MAX_TOTAL_CONFIG_BYTES,
        maxDiagnosticsPerRepository: DEFAULT_SCAN_MAX_DIAGNOSTICS,
      });
    }
  });

  it("rejects case-insensitive duplicate repository IDs and unknown fields", () => {
    const duplicate = parseProjectScanManifest({
      ...manifest(),
      repositories: [
        { repositoryId: "web-app", localRoot: "C:/one", repositoryRevision: "rev-1" },
        { repositoryId: "WEB-APP", localRoot: "C:/two", repositoryRevision: "rev-2" },
      ],
    });
    const unknown = parseProjectScanManifest({ ...manifest(), unexpected: true });

    expect(duplicate.status).toBe(ResultStatus.Failure);
    expect(unknown.status).toBe(ResultStatus.Failure);
  });

  it("rejects a total byte budget smaller than the per-file budget", () => {
    const result = parseProjectScanManifest({
      ...manifest(),
      budget: { maxConfigFileBytes: 100, maxTotalConfigBytesPerRepository: 99 },
    });

    expect(result.status).toBe(ResultStatus.Failure);
  });

  it("rejects directory budgets outside the strict positive hard limit", () => {
    const zero = parseProjectScanManifest({
      ...manifest(),
      budget: { maxDirectoriesPerRepository: 0 },
    });
    const aboveHardLimit = parseProjectScanManifest({
      ...manifest(),
      budget: { maxDirectoriesPerRepository: HARD_SCAN_MAX_DIRECTORIES + 1 },
    });

    expect(zero.status).toBe(ResultStatus.Failure);
    expect(aboveHardLimit.status).toBe(ResultStatus.Failure);
  });
});

function manifest(): Record<string, unknown> {
  return {
    schemaVersion: PROJECT_SCAN_MANIFEST_SCHEMA_VERSION,
    workspaceId: "workspace-scan-test",
    workspaceGraphRevision: "graph-rev-1",
    repositories: [
      { repositoryId: "web-app", localRoot: "C:/project", repositoryRevision: "rev-1" },
    ],
  };
}
