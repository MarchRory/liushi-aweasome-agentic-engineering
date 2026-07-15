/** Installation Revision 在 Runtime Store 下的固定目录名。 */
export const INSTALLATION_REVISION_STORE_DIRECTORY = "installation-revisions";

/** 单个 Repository 的权威 Revision 记录目录名。 */
export const INSTALLATION_REVISION_RECORDS_DIRECTORY = "records";

/** 单个 Repository 的 Reservation 与 Revision 锁目录名。 */
export const INSTALLATION_REVISION_LOCKS_DIRECTORY = "locks";

/** 文件名中使用的 SHA-256 十六进制摘要格式。 */
export const INSTALLATION_REVISION_DIGEST_TOKEN_PATTERN = /^[a-f0-9]{64}$/u;

/** 权威记录文件名格式：Revision ID、幂等键摘要与 JSON 后缀。 */
export const INSTALLATION_REVISION_RECORD_FILE_PATTERN =
  /^([0-9A-HJKMNP-TV-Z]{26})\.([a-f0-9]{64})\.json$/u;
