import type { ContentDigestPort } from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import {
  createProjectRuleCatalogDigestInput,
  createRuleDigestInput,
  type ProjectRuleCatalog,
} from "#domain/rule/index.js";

/** 校验 Catalog 中每条 Rule 及 Catalog 索引的 Digest 绑定。 */
export function validateRuleCatalogIntegrity(
  catalog: ProjectRuleCatalog,
  digestPort: ContentDigestPort,
): Result<void, HarnessError> {
  for (const rule of catalog.rules) {
    const calculated = digestPort.calculate(createRuleDigestInput(rule));
    if (calculated.status === ResultStatus.Failure) {
      return calculated;
    }
    if (calculated.value !== rule.digest) {
      return failure(
        new HarnessError(
          HarnessErrorCode.InvalidInput,
          "Rule digest does not match its canonical content.",
          { ruleId: rule.ruleId, version: rule.version },
        ),
      );
    }
  }

  const calculatedCatalogDigest = digestPort.calculate(
    createProjectRuleCatalogDigestInput(catalog),
  );
  if (calculatedCatalogDigest.status === ResultStatus.Failure) {
    return calculatedCatalogDigest;
  }
  if (calculatedCatalogDigest.value !== catalog.digest) {
    return failure(
      new HarnessError(
        HarnessErrorCode.InvalidInput,
        "Project rule catalog digest does not match its canonical index.",
        { catalogId: catalog.catalogId, revision: String(catalog.revision) },
      ),
    );
  }

  return success(undefined);
}
