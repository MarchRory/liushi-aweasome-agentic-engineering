const capabilityBrand: unique symbol = Symbol("codingTaskImplementationSubmissionCapability");

/** 仅供实现提交编排器持有的内部能力凭证。 */
export interface CodingTaskImplementationSubmissionCapability {
  /** 阻止调用方构造结构相同对象的私有品牌。 */
  readonly [capabilityBrand]: true;
}

/**
 * 实现提交内部入口的唯一凭证。
 *
 * 此模块不得从 CodingTask 的公共根 barrel 导出。
 */
export const codingTaskImplementationSubmissionCapability: CodingTaskImplementationSubmissionCapability =
  Object.freeze({ [capabilityBrand]: true as const });
