import type { ContentDigestPort } from "#application/ports/index.js";
import { ResultStatus, success, type HarnessError, type Result } from "#common/index.js";
import {
  createApplicableRuleBundleDigestInput,
  parseProjectRuleCatalog,
  parseRuleResolutionContext,
  resolveApplicableRules,
  type ApplicableRuleBundle,
} from "#domain/rule/index.js";

import type { ResolveRulesInput } from "./resolveRules.input.js";
import { validateRuleCatalogIntegrity } from "./ruleCatalogIntegrityValidator.js";

/** 校验 Rule 真源、解析适用范围并生成带 Digest 的 Bundle。 */
export class ResolveRulesUseCase {
  public constructor(private readonly digestPort: ContentDigestPort) {}

  /** 执行无副作用的 Rule Resolution。 */
  public execute(input: ResolveRulesInput): Result<ApplicableRuleBundle, HarnessError> {
    const catalog = parseProjectRuleCatalog(input.catalog);
    if (catalog.status === ResultStatus.Failure) {
      return catalog;
    }
    const context = parseRuleResolutionContext(input.context);
    if (context.status === ResultStatus.Failure) {
      return context;
    }
    const integrity = validateRuleCatalogIntegrity(catalog.value, this.digestPort);
    if (integrity.status === ResultStatus.Failure) {
      return integrity;
    }

    const resolved = resolveApplicableRules(catalog.value, context.value);
    const digest = this.digestPort.calculate(createApplicableRuleBundleDigestInput(resolved));
    if (digest.status === ResultStatus.Failure) {
      return digest;
    }

    return success({ ...resolved, digest: digest.value });
  }
}
