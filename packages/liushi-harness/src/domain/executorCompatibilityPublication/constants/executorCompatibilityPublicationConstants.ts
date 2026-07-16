/** Executor Compatibility Publication Bundle 的契约版本。 */
export const EXECUTOR_COMPATIBILITY_PUBLICATION_BUNDLE_SCHEMA_VERSION =
  "liushi.executor-compatibility-publication-bundle.v1";

/** npm 包名允许的最大长度。 */
export const EXECUTOR_COMPATIBILITY_PUBLICATION_PACKAGE_NAME_MAX_LENGTH = 214;

/** 包版本允许的最大长度。 */
export const EXECUTOR_COMPATIBILITY_PUBLICATION_PACKAGE_VERSION_MAX_LENGTH = 128;

/** 源码仓库 URI 允许的最大长度。 */
export const EXECUTOR_COMPATIBILITY_PUBLICATION_REPOSITORY_URI_MAX_LENGTH = 512;

/** npm 包名的关闭式格式。 */
export const EXECUTOR_COMPATIBILITY_PUBLICATION_PACKAGE_NAME_PATTERN =
  /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u;

/** 精确 SemVer 的关闭式格式。 */
export const EXECUTOR_COMPATIBILITY_PUBLICATION_PACKAGE_VERSION_PATTERN =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;

/** Git SHA-1 或 SHA-256 完整 Revision 的关闭式格式。 */
export const EXECUTOR_COMPATIBILITY_PUBLICATION_SOURCE_REVISION_PATTERN =
  /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
