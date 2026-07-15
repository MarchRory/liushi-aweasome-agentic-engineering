import type { ContentDigestPort } from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type HarnessError as HarnessErrorType,
  type Result,
} from "#common/index.js";
import {
  parseInstallationRevisionId,
  type InstallationRevisionId,
  type InstallationRevisionState,
} from "#domain/installation/index.js";
import type { RepositoryId, WorkspaceId } from "#domain/workspace/index.js";

import { INSTALLATION_REVISION_DIGEST_TOKEN_PATTERN } from "../constants/index.js";
import type {
  InstallationRevisionRecordFileIdentity,
  InstallationRevisionRepositoryPaths,
} from "../contracts/index.js";
import {
  listInstallationRevisionRecordFileNames,
  readInstallationRevisionRecordFile,
} from "../io/index.js";
import {
  parseInstallationRevisionRecordFileName,
  resolveInstallationRevisionRecordFile,
} from "../path/index.js";
import type { InstallationRevisionPathSafety } from "../safety/index.js";
import { verifyInstallationRevisionRecordIntegrity } from "../validation/index.js";

/** 目录扫描后唯一定位到的 Installation Revision 记录。 */
export interface LocatedInstallationRevisionRecord {
  /** 记录文件的绝对路径。 */
  readonly filePath: string;
  /** 从文件名解析得到的身份。 */
  readonly identity: InstallationRevisionRecordFileIdentity;
  /** 经过领域解析的 Revision ID。 */
  readonly revisionId: InstallationRevisionId;
}

/** 负责记录文件名查找、唯一性确认、读取与完整性校验。 */
export class InstallationRevisionRecordLookup {
  public constructor(
    private readonly digest: ContentDigestPort,
    private readonly pathSafety: InstallationRevisionPathSafety,
  ) {}

  /** 按幂等摘要查找唯一权威记录。 */
  public async findUniqueByIdempotencyDigest(
    paths: InstallationRevisionRepositoryPaths,
    token: string,
  ): Promise<LocatedInstallationRevisionRecord | undefined> {
    const suffix = `.${token}.json`;
    const names = (await listInstallationRevisionRecordFileNames(paths.recordsDirectory)).filter(
      (name) => name.endsWith(suffix),
    );
    return this.resolveUniqueLocatedRecord(paths, names, { idempotencyDigestToken: token });
  }

  /** 按 Revision ID 查找唯一权威记录。 */
  public async findUniqueByRevision(
    paths: InstallationRevisionRepositoryPaths,
    revisionId: InstallationRevisionId,
  ): Promise<LocatedInstallationRevisionRecord | undefined> {
    const prefix = `${revisionId}.`;
    const names = (await listInstallationRevisionRecordFileNames(paths.recordsDirectory)).filter(
      (name) => name.startsWith(prefix) && name.endsWith(".json"),
    );
    return this.resolveUniqueLocatedRecord(paths, names, { revisionId });
  }

  /** 读取已定位的记录，并校验路径身份、摘要和事件重放结果。 */
  public async loadLocatedRecord(
    paths: InstallationRevisionRepositoryPaths,
    located: LocatedInstallationRevisionRecord,
    workspaceId: WorkspaceId,
    repositoryId: RepositoryId,
  ): Promise<InstallationRevisionState> {
    const input = await readInstallationRevisionRecordFile(located.filePath);
    if (input === undefined)
      throw new HarnessError(
        HarnessErrorCode.CorruptStore,
        "Installation Revision record disappeared after directory scan.",
      );
    const verified = verifyInstallationRevisionRecordIntegrity(input, this.digest, {
      workspaceId,
      repositoryId,
      revisionId: located.identity.revisionId,
    });
    if (verified.status === ResultStatus.Failure) throw verified.error;
    const token = calculateInstallationRevisionIdempotencyDigestToken(
      verified.value.record.intent.approval.idempotencyKey,
      this.digest,
    );
    if (
      token.status === ResultStatus.Failure ||
      token.value !== located.identity.idempotencyDigestToken ||
      verified.value.record.revisionId !== located.revisionId
    )
      throw new HarnessError(
        HarnessErrorCode.CorruptStore,
        "Installation Revision file name does not match its approval identity.",
        { recordsDirectory: paths.recordsDirectory },
        token.status === ResultStatus.Failure ? token.error : undefined,
      );
    return verified.value;
  }

  private async resolveUniqueLocatedRecord(
    paths: InstallationRevisionRepositoryPaths,
    names: readonly string[],
    expected: { readonly revisionId?: string; readonly idempotencyDigestToken?: string },
  ): Promise<LocatedInstallationRevisionRecord | undefined> {
    if (names.length === 0) return undefined;
    if (names.length !== 1)
      throw new HarnessError(
        HarnessErrorCode.CorruptStore,
        "Installation Revision lookup is not unique.",
      );
    const name = names[0]!;
    const identity = parseInstallationRevisionRecordFileName(name);
    if (
      identity === undefined ||
      (expected.revisionId !== undefined && identity.revisionId !== expected.revisionId) ||
      (expected.idempotencyDigestToken !== undefined &&
        identity.idempotencyDigestToken !== expected.idempotencyDigestToken)
    )
      throw new HarnessError(
        HarnessErrorCode.CorruptStore,
        "Installation Revision record file name is invalid.",
      );
    const revisionId = parseInstallationRevisionId(identity.revisionId);
    if (revisionId.status === ResultStatus.Failure)
      throw new HarnessError(
        HarnessErrorCode.CorruptStore,
        "Installation Revision file name contains an invalid Revision ID.",
        {},
        revisionId.error,
      );
    const filePath = resolveInstallationRevisionRecordFile(
      paths,
      revisionId.value,
      identity.idempotencyDigestToken,
    );
    const safePath = await this.pathSafety.validateDerivedPaths([filePath]);
    if (safePath.status === ResultStatus.Failure) throw safePath.error;
    return { filePath, identity, revisionId: revisionId.value };
  }
}

/** 将幂等键摘要转换为记录文件名所需的十六进制令牌。 */
export function calculateInstallationRevisionIdempotencyDigestToken(
  idempotencyKey: string,
  digest: ContentDigestPort,
): Result<string, HarnessErrorType> {
  const calculated = digest.calculate(idempotencyKey);
  if (calculated.status === ResultStatus.Failure) return calculated;
  const matched = /^sha256:([a-f0-9]{64})$/u.exec(calculated.value);
  const token = matched?.[1];
  return token !== undefined && INSTALLATION_REVISION_DIGEST_TOKEN_PATTERN.test(token)
    ? success(token)
    : failure(
        new HarnessError(
          HarnessErrorCode.InvalidInput,
          "Idempotency key digest is not a SHA-256 digest.",
        ),
      );
}
