import { describe, expect, it } from "vitest";

import { ResultStatus, type ContentDigest } from "../../src/common/index.js";
import {
  RepositoryRole,
  createArchitectureMechanismCandidateDigestInput,
  createProjectProfileCandidateDigestInput,
} from "../../src/domain/projectDiscovery/index.js";
import {
  compileProjectProfileBundle,
  createProjectProfileBundleDigestInput,
  createProjectProfileDigestInput,
} from "../../src/domain/projectProfile/index.js";
import { RuleStatus, createRuleDigestInput } from "../../src/domain/rule/index.js";
import { parseTaskId } from "../../src/domain/task/index.js";
import { parseRepositoryId, parseWorkspaceId } from "../../src/domain/workspace/index.js";
import {
  compilerDigestPort as digestPort,
  compilerProvenance as provenance,
  compilerRepoA as repoA,
  compilerRepoB as repoB,
  compilerWorkspaceId as workspaceId,
  createCompilerCandidate as createCandidate,
  createCompilerProposal as createProposal,
  createCompilerReport as createReport,
  unwrap,
  withCompilerDigest as withDigest,
} from "../support/profileCompile/index.js";

const otherProfileCandidateDigest = `sha256:${"c".repeat(64)}` as ContentDigest;

describe("Project profile compiler", () => {
  it("compiles approved profiles and promotes accepted rules", () => {
    const report = createReport([createCandidate(repoA)]);
    const result = compileProjectProfileBundle(
      {
        discoveryReport: report,
        proposalPayload: createProposal(report),
        provenance: { ...provenance, revision: 1 },
      },
      digestPort,
    );

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Success) {
      expect(result.value.profiles).toHaveLength(1);
      expect(result.value.profiles[0]?.workspaceId).toBe(workspaceId);
      expect(result.value.profiles[0]?.workspaceGraphRevision).toBe(
        result.value.workspaceGraphRevision,
      );
      expect(result.value.profiles[0]?.revision).toBe(result.value.revision);
      expect(result.value.profiles[0]?.sourceRefs.profileCandidateDigest).toBe(
        report.profileCandidates[0]?.digest,
      );
      expect(result.value.profiles[0]?.sourceRefs.approvalId).toBe(provenance.approvalId);
      expect(result.value.profiles[0]?.confirmedRole).toBe(RepositoryRole.Application);
      expect(result.value.ruleCatalog.rules.map((rule) => rule.status)).toEqual([
        RuleStatus.Active,
      ]);
      expect(result.value.digest).not.toBe(report.digest);
    }
  });

  it("keeps the same bundle digest when repository input order changes", () => {
    const first = createReport([createCandidate(repoA), createCandidate(repoB)]);
    const second = createReport([createCandidate(repoB), createCandidate(repoA)]);
    const firstResult = compileProjectProfileBundle(
      {
        discoveryReport: first,
        proposalPayload: createProposal(first, [...first.profileCandidates].reverse()),
        provenance: { ...provenance, revision: 2 },
      },
      digestPort,
    );
    const secondResult = compileProjectProfileBundle(
      {
        discoveryReport: second,
        proposalPayload: createProposal(second),
        provenance: { ...provenance, revision: 2 },
      },
      digestPort,
    );

    expect(firstResult.status).toBe(ResultStatus.Success);
    expect(secondResult.status).toBe(ResultStatus.Success);
    if (
      firstResult.status === ResultStatus.Success &&
      secondResult.status === ResultStatus.Success
    ) {
      expect(firstResult.value.digest).toBe(secondResult.value.digest);
    }
  });

  it("accepts repository-qualified TypeScript strict rules from two repositories", () => {
    const report = createReport([createCandidate(repoA), createCandidate(repoB)]);
    const result = compileProjectProfileBundle(
      {
        discoveryReport: report,
        proposalPayload: createProposal(report),
        provenance: { ...provenance, revision: 2 },
      },
      digestPort,
    );

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Success) {
      expect(result.value.ruleCatalog.rules.map((rule) => rule.ruleId)).toEqual([
        "project.repo-a.typescript.strict",
        "project.repo-b.typescript.strict",
      ]);
      expect(new Set(result.value.ruleCatalog.rules.map((rule) => rule.familyKey))).toEqual(
        new Set(["typescript.strict"]),
      );
    }
  });

  it("fails closed for candidate identity and repository binding violations", () => {
    const base = createCandidate(repoA);
    const otherRepositoryId = unwrap(parseRepositoryId("repo-other"));
    const mechanism = base.mechanismCandidates[0]!;
    const wrongMechanism = withDigest(
      { ...mechanism, repositoryId: otherRepositoryId },
      createArchitectureMechanismCandidateDigestInput({
        ...mechanism,
        repositoryId: otherRepositoryId,
      }),
    );
    const rule = base.ruleCandidates[0]!;
    const wrongRule = withDigest(
      { ...rule, sourceRefs: [{ ...rule.sourceRefs[0]!, revision: "wrong-revision" }] },
      createRuleDigestInput({
        ...rule,
        sourceRefs: [{ ...rule.sourceRefs[0]!, revision: "wrong-revision" }],
      }),
    );
    const mutations = [
      { ...base, mechanismCandidates: [wrongMechanism] },
      { ...base, ruleCandidates: [wrongRule] },
      { ...base, ruleCandidates: [rule, rule] },
    ];

    for (const mutation of mutations) {
      const candidate = withDigest(mutation, createProjectProfileCandidateDigestInput(mutation));
      const report = createReport([candidate]);
      const result = compileProjectProfileBundle(
        {
          discoveryReport: report,
          proposalPayload: createProposal(report),
          provenance: { ...provenance, revision: 1 },
        },
        digestPort,
      );
      expect(result.status).toBe(ResultStatus.Failure);
    }
  });

  it("fails when report digest or repository revision drifts", () => {
    const report = createReport([createCandidate(repoA)]);
    const digestDrift = compileProjectProfileBundle(
      {
        discoveryReport: report,
        proposalPayload: {
          ...createProposal(report),
          discoveryReportDigest: otherProfileCandidateDigest,
        },
        provenance: { ...provenance, revision: 1 },
      },
      digestPort,
    );
    const proposal = createProposal(report);
    const revisionDrift = compileProjectProfileBundle(
      {
        discoveryReport: report,
        proposalPayload: {
          ...proposal,
          repositorySelections: [
            { ...proposal.repositorySelections[0]!, repositoryRevision: "repo-rev-drift" },
          ],
        },
        provenance: { ...provenance, revision: 1 },
      },
      digestPort,
    );

    expect(digestDrift.status).toBe(ResultStatus.Failure);
    expect(revisionDrift.status).toBe(ResultStatus.Failure);
  });

  it("fails when a candidate partition is missing an id", () => {
    const report = createReport([createCandidate(repoA)]);
    const proposal = createProposal(report);
    const result = compileProjectProfileBundle(
      {
        discoveryReport: report,
        proposalPayload: {
          ...proposal,
          repositorySelections: [
            { ...proposal.repositorySelections[0]!, acceptedRuleIds: [], rejectedRuleIds: [] },
          ],
        },
        provenance: { ...provenance, revision: 1 },
      },
      digestPort,
    );

    expect(result.status).toBe(ResultStatus.Failure);
  });

  it("fails when a partition references an unknown id", () => {
    const report = createReport([createCandidate(repoA)]);
    const proposal = createProposal(report);
    const result = compileProjectProfileBundle(
      {
        discoveryReport: report,
        proposalPayload: {
          ...proposal,
          repositorySelections: [
            {
              ...proposal.repositorySelections[0]!,
              acceptedMechanismCandidateIds: ["mechanism.repo-a", "mechanism.unknown"],
              rejectedMechanismCandidateIds: [],
            },
          ],
        },
        provenance: { ...provenance, revision: 1 },
      },
      digestPort,
    );

    expect(result.status).toBe(ResultStatus.Failure);
  });

  it("changes profile and bundle digests when any new profile contract field changes", () => {
    const report = createReport([createCandidate(repoA)]);
    const result = compileProjectProfileBundle(
      {
        discoveryReport: report,
        proposalPayload: createProposal(report),
        provenance: { ...provenance, revision: 1 },
      },
      digestPort,
    );

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Success) {
      const bundle = result.value;
      const profile = bundle.profiles[0]!;
      const baselineProfileDigest = digestPort.calculate(createProjectProfileDigestInput(profile));
      const baselineBundleDigest = digestPort.calculate(
        createProjectProfileBundleDigestInput(bundle),
      );

      expect(baselineProfileDigest.status).toBe(ResultStatus.Success);
      expect(baselineBundleDigest.status).toBe(ResultStatus.Success);
      if (
        baselineProfileDigest.status === ResultStatus.Success &&
        baselineBundleDigest.status === ResultStatus.Success
      ) {
        const mutations = [
          { ...profile, workspaceId: unwrap(parseWorkspaceId("workspace-profile-other")) },
          { ...profile, workspaceGraphRevision: "graph-rev-other" },
          { ...profile, revision: profile.revision + 1 },
          {
            ...profile,
            sourceRefs: {
              ...profile.sourceRefs,
              profileCandidateDigest: otherProfileCandidateDigest,
            },
          },
        ];

        for (const mutatedProfile of mutations) {
          const profileDigest = digestPort.calculate(
            createProjectProfileDigestInput(mutatedProfile),
          );
          const bundleDigest = digestPort.calculate(
            createProjectProfileBundleDigestInput({
              ...bundle,
              profiles: [mutatedProfile],
            }),
          );

          expect(profileDigest.status).toBe(ResultStatus.Success);
          expect(bundleDigest.status).toBe(ResultStatus.Success);
          if (
            profileDigest.status === ResultStatus.Success &&
            bundleDigest.status === ResultStatus.Success
          ) {
            expect(profileDigest.value).not.toBe(baselineProfileDigest.value);
            expect(bundleDigest.value).not.toBe(baselineBundleDigest.value);
          }
        }
        const changedTaskDigest = digestPort.calculate(
          createProjectProfileBundleDigestInput({
            ...bundle,
            provenance: {
              ...bundle.provenance,
              taskId: unwrap(parseTaskId("01ARZ3NDEKTSV4RRFFQ69G5FAX")),
            },
          }),
        );
        expect(changedTaskDigest.status).toBe(ResultStatus.Success);
        if (changedTaskDigest.status === ResultStatus.Success) {
          expect(changedTaskDigest.value).not.toBe(baselineBundleDigest.value);
        }
      }
    }
  });
});
