import { describe, expect, it } from "vitest";

import { ResultStatus } from "../../src/common/index.js";
import {
  ContextSource,
  FailureTaxonomy,
  TrustChannel,
  parseContextManifest,
  parseEffectiveRevisionSet,
  parseInputBindingSet,
  validateInputBindingsAgainstEffectiveRevisions,
} from "../../src/domain/workflow/index.js";

const artifactId = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const digest = `sha256:${"a".repeat(64)}`;

describe("Workflow value contracts", () => {
  it("accepts matching current and input revisions", () => {
    const revisions = parseEffectiveRevisionSet({
      revisions: [{ artifactId, artifactType: "requirement_contract", revision: 2, digest }],
    });
    const bindings = parseInputBindingSet({
      bindings: [
        {
          inputKey: "requirement",
          artifactId,
          artifactType: "requirement_contract",
          revision: 2,
          digest,
        },
      ],
    });

    expect(revisions.status).toBe(ResultStatus.Success);
    expect(bindings.status).toBe(ResultStatus.Success);
    if (revisions.status === ResultStatus.Success && bindings.status === ResultStatus.Success) {
      expect(
        validateInputBindingsAgainstEffectiveRevisions(bindings.value, revisions.value).status,
      ).toBe(ResultStatus.Success);
    }
  });

  it("rejects a revision mismatch without inferring field impact", () => {
    const revisions = parseEffectiveRevisionSet({
      revisions: [{ artifactId, artifactType: "requirement_contract", revision: 3, digest }],
    });
    const bindings = parseInputBindingSet({
      bindings: [
        {
          inputKey: "requirement",
          artifactId,
          artifactType: "requirement_contract",
          revision: 2,
          digest,
        },
      ],
    });

    expect(revisions.status).toBe(ResultStatus.Success);
    expect(bindings.status).toBe(ResultStatus.Success);
    if (revisions.status === ResultStatus.Success && bindings.status === ResultStatus.Success) {
      expect(
        validateInputBindingsAgainstEffectiveRevisions(bindings.value, revisions.value).status,
      ).toBe(ResultStatus.Failure);
    }
  });

  it("rejects duplicate bindings", () => {
    const result = parseInputBindingSet({
      bindings: [
        {
          inputKey: "requirement",
          artifactId,
          artifactType: "requirement_contract",
          revision: 1,
          digest,
        },
        {
          inputKey: "requirement",
          artifactId,
          artifactType: "requirement_contract",
          revision: 1,
          digest,
        },
      ],
    });

    expect(result.status).toBe(ResultStatus.Failure);
  });

  it("records context source metadata and rejects missing trust metadata", () => {
    const manifest = parseContextManifest({
      sources: [
        {
          source: ContextSource.Repository,
          locator: "repo/src/domain.ts",
          revision: "HEAD",
          digest,
          scope: "repository",
          trustLevel: TrustChannel.ExternalUntrusted,
          selectionReason: "explicit repository input",
          truncationReason: "not truncated",
        },
      ],
    });
    const missingTrust = parseContextManifest({
      sources: [
        {
          locator: "repo/src/domain.ts",
          revision: "HEAD",
          digest,
          scope: "repository",
          selectionReason: "explicit",
        },
      ],
    });
    const elevatedRepository = parseContextManifest({
      sources: [
        {
          source: ContextSource.Repository,
          locator: "repo/src/domain.ts",
          revision: "HEAD",
          digest,
          scope: "repository",
          trustLevel: TrustChannel.Instruction,
          selectionReason: "explicit",
        },
      ],
    });

    expect(manifest.status).toBe(ResultStatus.Success);
    expect(missingTrust.status).toBe(ResultStatus.Failure);
    expect(elevatedRepository.status).toBe(ResultStatus.Failure);
    expect(TrustChannel.ExternalUntrusted).toBe("external_untrusted");
  });

  it("exposes closed failure taxonomy values", () => {
    expect(FailureTaxonomy.OutcomeUnknown).toBe("outcome_unknown");
  });
});
