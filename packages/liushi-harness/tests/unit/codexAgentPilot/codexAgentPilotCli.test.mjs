import { describe, expect, it } from "vitest";

import { parsePilotCli } from "../../../scripts/codexAgentPilot/cli/index.mjs";

describe("Codex Agent Pilot CLI", () => {
  it("严格解析 prepare 与 approve，拒绝未知、重复和多余选项", () => {
    expect(
      parsePilotCli([
        "prepare",
        "--root",
        "C:\\pilot",
        "--actor-id",
        "human",
        "--codex",
        "C:\\codex.exe",
        "--codex-home",
        "C:\\home",
        "--model",
        "gpt-5.6-sol",
      ]),
    ).toMatchObject({ command: "prepare", actorId: "human" });
    expect(
      parsePilotCli([
        "approve",
        "--root",
        "C:\\pilot",
        "--state-digest",
        "sha256:a",
        "--actor-id",
        "human",
      ]).command,
    ).toBe("approve");
    expect(
      parsePilotCli([
        "preview-host",
        "--root",
        "C:\\pilot",
        "--state-digest",
        "sha256:b",
        "--actor-id",
        "human",
      ]).command,
    ).toBe("preview-host");
    expect(
      parsePilotCli([
        "approve-host",
        "--root",
        "C:\\pilot",
        "--state-digest",
        "sha256:b",
        "--packet-digest",
        "sha256:packet",
        "--actor-id",
        "human",
      ]),
    ).toMatchObject({
      command: "approve-host",
      stateDigest: "sha256:b",
      packetDigest: "sha256:packet",
      actorId: "human",
    });
    expect(() =>
      parsePilotCli([
        "approve-host",
        "--root",
        "C:\\pilot",
        "--state-digest",
        "sha256:b",
        "--actor-id",
        "human",
      ]),
    ).toThrow("--packet-digest");
    for (const extraArguments of [
      ["--model", "gpt-5.6-sol"],
      ["--packet-digest", "sha256:packet", "--packet-digest", "sha256:other"],
    ]) {
      expect(() =>
        parsePilotCli([
          "approve-host",
          "--root",
          "C:\\pilot",
          "--state-digest",
          "sha256:b",
          "--packet-digest",
          "sha256:packet",
          "--actor-id",
          "human",
          ...extraArguments,
        ]),
      ).toThrow();
    }
    expect(() =>
      parsePilotCli([
        "approve",
        "--root",
        "C:\\pilot",
        "--state-digest",
        "sha256:a",
        "--actor-id",
        "human",
        "--model",
        "gpt-5.6-sol",
      ]),
    ).toThrow();
    expect(() =>
      parsePilotCli([
        "approve",
        "--root",
        "C:\\pilot",
        "--root",
        "C:\\other",
        "--state-digest",
        "sha256:a",
        "--actor-id",
        "human",
      ]),
    ).toThrow();
  });
  it("run-agent requires packet digest", () => {
    expect(() =>
      parsePilotCli([
        "run-agent",
        "--root",
        "C:\\pilot",
        "--state-digest",
        "sha256:state",
        "--actor-id",
        "human",
      ]),
    ).toThrow("--packet-digest");
    expect(
      parsePilotCli([
        "run-agent",
        "--root",
        "C:\\pilot",
        "--state-digest",
        "sha256:state",
        "--packet-digest",
        "sha256:packet",
        "--actor-id",
        "human",
      ]),
    ).toMatchObject({ command: "run-agent", packetDigest: "sha256:packet" });
  });
});
