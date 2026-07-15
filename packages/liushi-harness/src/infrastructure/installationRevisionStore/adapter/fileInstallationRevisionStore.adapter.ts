import type {
  AppendInstallationRevisionEventInput,
  FindInstallationRevisionByApprovalInput,
  InstallationRevisionLocator,
  InstallationRevisionReservation,
  InstallationRevisionStore,
  ManagedOwnershipVerifier,
  ReserveInstallationRevisionIntentInput,
  VerifyManagedOwnershipInput,
} from "#application/ports/index.js";
import type { HarnessError as HarnessErrorType, Result } from "#common/index.js";
import type { InstallationRevisionState } from "#domain/installation/index.js";

import type { FileInstallationRevisionStoreDependencies } from "../contracts/index.js";
import { InstallationRevisionStoreService } from "../service/index.js";

/** File Installation Revision Store 的 Port 编排适配器。 */
export class FileInstallationRevisionStore
  implements InstallationRevisionStore, ManagedOwnershipVerifier
{
  private readonly service: InstallationRevisionStoreService;

  public constructor(storeRoot: string, dependencies: FileInstallationRevisionStoreDependencies) {
    this.service = new InstallationRevisionStoreService(storeRoot, dependencies);
  }

  /** 委派按 approval 查找 Revision。 */
  public async findByApproval(
    input: FindInstallationRevisionByApprovalInput,
  ): Promise<Result<InstallationRevisionState | undefined, HarnessErrorType>> {
    return this.service.findByApproval(input);
  }

  /** 委派 Intent 持久化 reservation。 */
  public async reserveIntent(
    input: ReserveInstallationRevisionIntentInput,
  ): Promise<Result<InstallationRevisionReservation, HarnessErrorType>> {
    return this.service.reserveIntent(input);
  }

  /** 委派基于 recordDigest 的事件追加。 */
  public async appendEvent(
    input: AppendInstallationRevisionEventInput,
  ): Promise<Result<InstallationRevisionState, HarnessErrorType>> {
    return this.service.appendEvent(input);
  }

  /** 委派 Revision 加载。 */
  public async load(
    input: InstallationRevisionLocator,
  ): Promise<Result<InstallationRevisionState, HarnessErrorType>> {
    return this.service.load(input);
  }

  /** 委派 committed ownership 验证。 */
  public async verify(
    input: VerifyManagedOwnershipInput,
  ): Promise<Result<boolean, HarnessErrorType>> {
    return this.service.verify(input);
  }
}
