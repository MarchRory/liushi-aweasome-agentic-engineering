/** Hook Binding 的封闭 Schema 版本类别。 */
export enum HookBindingSchemaVersion {
  /** 传统的工作区级 Binding。 */
  Legacy = "1.0.0",
  /** Session 级 Binding。 */
  Session = "2.0.0",
}

/** legacy Hook Workspace Binding 的 Schema 版本。 */
export const HOOK_BINDING_SCHEMA_VERSION = "1.0.0" as const;

/** Session Hook Binding v2 的 Schema 版本。 */
export const SESSION_HOOK_BINDING_SCHEMA_VERSION = "2.0.0" as const;

/** Hook Workspace Binding 的最大路径长度。 */
export const MAX_HOOK_WORKSPACE_ROOT_LENGTH = 4_096;

/** Hook Binding Actor ID 的最大长度。 */
export const MAX_HOOK_BINDING_ACTOR_ID_LENGTH = 256;
