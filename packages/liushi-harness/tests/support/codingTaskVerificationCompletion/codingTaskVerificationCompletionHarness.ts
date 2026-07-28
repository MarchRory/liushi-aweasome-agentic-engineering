import { vi, type Mock } from "vitest";

import type { AssemblePrReadyArtifactUseCase } from "../../../src/application/useCases/assemblePrReadyArtifact/index.js";
import {
  EvidenceBundleWriteDisposition,
  type EvidenceBundleStore,
} from "../../../src/application/ports/index.js";
import type { VerificationCommandService } from "../../../src/application/verificationCommand/index.js";
import { success } from "../../../src/common/index.js";
import { VerificationStatus } from "../../../src/domain/verification/index.js";
import { CodingTaskVerificationCompletionService } from "../../../src/application/codingTaskVerificationCompletion/service/codingTaskVerificationCompletionService.js";

import {
  calculateVerificationCompletionDigest,
  createVerificationCompletionEvidence,
  createVerificationCompletionReceipt,
  verificationCompletionDigest,
  type VerificationCompletionEvidenceOverrides,
} from "./codingTaskVerificationCompletionFixture.js";
import { createVerificationCompletionPrReadyArtifact } from "./codingTaskVerificationCompletionPrReadyFixture.js";
import { CommandStatus } from "../../../src/application/command/index.js";
import type { PrReadyArtifact } from "../../../src/domain/repositoryDelivery/index.js";

/** Completion Service 测试依赖的覆盖项。 */
export interface VerificationCompletionSetupOptions {
  readonly commandStatus?: CommandStatus;
  readonly evidenceStatus?: VerificationStatus;
  readonly evidenceOverrides?: Omit<VerificationCompletionEvidenceOverrides, "status">;
}

/** Completion Service 测试 Harness 的可观测依赖。 */
export interface VerificationCompletionSetup {
  readonly service: CodingTaskVerificationCompletionService;
  readonly executeVerification: Mock<VerificationCommandService["execute"]>;
  readonly loadEvidence: Mock<EvidenceBundleStore["load"]>;
  readonly assemblePrReady: Mock<AssemblePrReadyArtifactUseCase["execute"]>;
  readonly prReadyArtifact: PrReadyArtifact;
}

/** 创建无 I/O、无等待且调用可观测的 Completion Service Harness。 */
export function createVerificationCompletionSetup(
  options: VerificationCompletionSetupOptions = {},
): VerificationCompletionSetup {
  const evidence = createVerificationCompletionEvidence({
    status: options.evidenceStatus ?? VerificationStatus.Passed,
    ...options.evidenceOverrides,
  });
  const prReadyArtifact = createVerificationCompletionPrReadyArtifact();
  const executeVerification = vi.fn<VerificationCommandService["execute"]>(() =>
    Promise.resolve(
      success(
        createVerificationCompletionReceipt(options.commandStatus ?? CommandStatus.Committed),
      ),
    ),
  );
  const loadEvidence = vi.fn<EvidenceBundleStore["load"]>(() => Promise.resolve(success(evidence)));
  const evidenceBundleStore: EvidenceBundleStore = {
    load: loadEvidence,
    persist: vi.fn(() =>
      Promise.resolve(
        success({
          disposition: EvidenceBundleWriteDisposition.Persisted,
          bundleDigest: calculateVerificationCompletionDigest({ persisted: "unused" }),
        }),
      ),
    ),
  };
  const assemblePrReady = vi.fn<AssemblePrReadyArtifactUseCase["execute"]>(() =>
    Promise.resolve(success(prReadyArtifact)),
  );
  const service = new CodingTaskVerificationCompletionService(
    { execute: executeVerification },
    evidenceBundleStore,
    { execute: assemblePrReady },
    verificationCompletionDigest,
  );
  return { service, executeVerification, loadEvidence, assemblePrReady, prReadyArtifact };
}
