/** InstallPlan 的持久化 schema 版本。 */
export const INSTALL_PLAN_SCHEMA_VERSION = 1;
/** Installation Revision 持久化 schema 版本。 */
export const INSTALLATION_REVISION_SCHEMA_VERSION = 1;
/** 仓库受管文件所有权清单的 schema 版本。 */
export const MANAGED_FILE_MANIFEST_SCHEMA_VERSION = 1;
/** 首个 Codex 受管文件的仓库相对路径。 */
export const CODEX_HOOKS_FILE_PATH = ".codex/hooks.json";
/** 仓库所有权清单的相对路径。 */
export const MANAGED_FILES_MANIFEST_PATH = ".liushi-harness/managed-files.json";
/** Harness 受管文件的固定 owner package。 */
export const MANAGED_FILE_OWNER_PACKAGE = "liushi-harness";
/** Codex 投影使用的固定 profile 名称。 */
export const CODEX_INSTALL_PROFILE = "codex";
/** Codex hooks 模板来源标识。 */
export const CODEX_HOOK_TEMPLATE_SOURCE = "codex.hooks";
