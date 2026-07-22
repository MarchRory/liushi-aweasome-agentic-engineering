/** Executor Compatibility Publisher Trust Policy 的契约版本。 */
export const EXECUTOR_COMPATIBILITY_PUBLISHER_TRUST_POLICY_SCHEMA_VERSION =
  "liushi.executor-compatibility-publisher-trust-policy.v1";

/** Executor Compatibility Release Trust Profile 的契约版本。 */
export const EXECUTOR_COMPATIBILITY_RELEASE_TRUST_PROFILE_SCHEMA_VERSION =
  "liushi.executor-compatibility-release-trust-profile.v1";

/** Trust Profile 标识符允许的最小长度。 */
export const EXECUTOR_COMPATIBILITY_RELEASE_TRUST_PROFILE_ID_MIN_LENGTH = 1;

/** Trust Profile 标识符允许的最大长度。 */
export const EXECUTOR_COMPATIBILITY_RELEASE_TRUST_PROFILE_ID_MAX_LENGTH = 128;

/** Trust Profile 标识符的 ASCII 小写 kebab-case 格式。 */
export const EXECUTOR_COMPATIBILITY_RELEASE_TRUST_PROFILE_ID_PATTERN =
  /^[a-z](?:[a-z0-9]|-(?=[a-z0-9]))*$/u;

/** 稳定 Publisher Trust Policy 的 Runner Environment 最大长度。 */
export const EXECUTOR_COMPATIBILITY_PUBLISHER_TRUST_POLICY_RUNNER_ENVIRONMENT_MAX_LENGTH = 2048;
