/** Resolve Rules Use Case 接收的未信任外部输入。 */
export interface ResolveRulesInput {
  /** 待校验并解析的 Project Rule Catalog 文档。 */
  catalog: unknown;
  /** 待校验的 Task Rule Resolution Context 文档。 */
  context: unknown;
}
