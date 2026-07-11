import { describe, expect, it } from "vitest";

import { PROJECT_SCAN_MANIFEST_SCHEMA_VERSION, ResultStatus } from "../../src/common/index.js";
import { parseProjectScanManifest } from "../../src/domain/projectDiscovery/index.js";

describe("Project scan manifest", () => {
  it("parses a manifest without capacity budgets", () => {
    const result = parseProjectScanManifest(manifest());

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Success) {
      expect(result.value).not.toHaveProperty("budget");
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

  it("rejects manifest budget fields", () => {
    const result = parseProjectScanManifest({
      ...manifest(),
      budget: { maxDirectoriesPerRepository: 1 },
    });

    expect(result.status).toBe(ResultStatus.Failure);
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
