/** Repository Root 配置或解析失败的稳定分类。 */
export enum RepositoryRootResolutionFailureCode {
  /** 静态绑定本身不满足身份或路径约束。 */
  InvalidBinding = "repository_root_invalid_binding",
  /** 同一 Workspace 与 Repository 被绑定到不同 Root。 */
  ConflictingBinding = "repository_root_conflicting_binding",
  /** 解析请求中的稳定身份无效。 */
  InvalidRequest = "repository_root_invalid_request",
  /** 未配置与请求身份完全匹配的可信 Root。 */
  BindingNotFound = "repository_root_binding_not_found",
}
