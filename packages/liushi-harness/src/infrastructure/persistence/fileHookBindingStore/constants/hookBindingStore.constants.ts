/** Hook Binding Store 文件 Schema 版本。 */
export const LEGACY_FILE_HOOK_BINDING_STORE_SCHEMA_VERSION = "1.0.0" as const;

/** Hook Binding Store 当前文件 Schema 版本。 */
export const FILE_HOOK_BINDING_STORE_SCHEMA_VERSION = "2.0.0" as const;

/** Hook Binding Store 在 Runtime Store 下的目录名。 */
export const HOOK_BINDINGS_DIRECTORY_NAME = "hookBindings";

/** Hook Binding Store 的数据文件名。 */
export const HOOK_BINDINGS_FILE_NAME = "bindings.json";

/** Hook Binding Store 的 Lock 文件名。 */
export const HOOK_BINDINGS_LOCK_FILE_NAME = "bindings.lock";
