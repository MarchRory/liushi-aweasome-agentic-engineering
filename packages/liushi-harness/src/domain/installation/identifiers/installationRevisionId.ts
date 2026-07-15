import { HarnessError, HarnessErrorCode, failure, success, type Result } from "#common/index.js";

declare const installationRevisionIdBrand: unique symbol;

/** 经路径安全校验的 Installation Revision ULID 标识。 */
export type InstallationRevisionId = string & {
  readonly [installationRevisionIdBrand]: true;
};

/** 将外部值校验为 Installation Revision ID。 */
export function parseInstallationRevisionId(
  value: string,
): Result<InstallationRevisionId, HarnessError> {
  return /^[0-9A-HJKMNP-TV-Z]{26}$/u.test(value)
    ? success(value as InstallationRevisionId)
    : failure(
        new HarnessError(
          HarnessErrorCode.InvalidInput,
          "Installation Revision ID must be a ULID.",
          { field: "installationRevisionId" },
        ),
      );
}
