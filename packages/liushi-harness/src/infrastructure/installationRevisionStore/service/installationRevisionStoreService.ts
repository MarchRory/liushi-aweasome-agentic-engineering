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
import { type HarnessError as HarnessErrorType, type Result } from "#common/index.js";
import type { InstallationRevisionState } from "#domain/installation/index.js";

import type { FileInstallationRevisionStoreDependencies } from "../contracts/index.js";
import { InstallationRevisionRecordLookup } from "../lookup/index.js";
import { InstallationRevisionPathSafety } from "../safety/index.js";
import { InstallationRevisionStateFactory } from "../state/index.js";
import { InstallationRevisionReadService } from "./installationRevisionReadService.js";
import { InstallationRevisionWriteService } from "./installationRevisionWriteService.js";

/** 组合 Revision Store 的内部读写服务，向 adapter 提供稳定 Port 实现。 */
export class InstallationRevisionStoreService
  implements InstallationRevisionStore, ManagedOwnershipVerifier
{
  private readonly readService: InstallationRevisionReadService;
  private readonly writeService: InstallationRevisionWriteService;

  public constructor(storeRoot: string, dependencies: FileInstallationRevisionStoreDependencies) {
    const pathSafety = new InstallationRevisionPathSafety(storeRoot);
    const lookup = new InstallationRevisionRecordLookup(dependencies.digest, pathSafety);
    const stateFactory = new InstallationRevisionStateFactory(dependencies.digest);
    this.readService = new InstallationRevisionReadService(
      storeRoot,
      dependencies.digest,
      pathSafety,
      lookup,
    );
    this.writeService = new InstallationRevisionWriteService(
      storeRoot,
      dependencies,
      pathSafety,
      lookup,
      stateFactory,
    );
  }

  /** 委派 approval 范围查询。 */
  public async findByApproval(
    input: FindInstallationRevisionByApprovalInput,
  ): Promise<Result<InstallationRevisionState | undefined, HarnessErrorType>> {
    return this.readService.findByApproval(input);
  }

  /** 委派 Intent reservation。 */
  public async reserveIntent(
    input: ReserveInstallationRevisionIntentInput,
  ): Promise<Result<InstallationRevisionReservation, HarnessErrorType>> {
    return this.writeService.reserveIntent(input);
  }

  /** 委派带 CAS 前置条件的事件追加。 */
  public async appendEvent(
    input: AppendInstallationRevisionEventInput,
  ): Promise<Result<InstallationRevisionState, HarnessErrorType>> {
    return this.writeService.appendEvent(input);
  }

  /** 委派 Revision 加载。 */
  public async load(
    input: InstallationRevisionLocator,
  ): Promise<Result<InstallationRevisionState, HarnessErrorType>> {
    return this.readService.load(input);
  }

  /** 委派 committed ownership 验证。 */
  public async verify(
    input: VerifyManagedOwnershipInput,
  ): Promise<Result<boolean, HarnessErrorType>> {
    return this.readService.verify(input);
  }
}
