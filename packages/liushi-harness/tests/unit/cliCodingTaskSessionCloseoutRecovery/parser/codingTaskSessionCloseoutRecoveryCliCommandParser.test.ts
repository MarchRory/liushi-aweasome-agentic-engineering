import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { ResultStatus } from "../../../../src/index.js";
import {
  CliCommand,
  CliOutputFormat,
  parseCliArguments,
} from "../../../../src/presentation/index.js";

const repositoryRoot = resolve("repository");

describe("CodingTask Session Closeout Recovery CLI parser", () => {
  it("解析 assess 命令并保存 Repository 绑定", () => {
    expect(
      parseCliArguments([
        "coding-task",
        "session",
        "closeout",
        "assess",
        "--workspace",
        "workspace-1",
        "--session",
        "session-1",
        "--repository",
        "repository-1",
        "--root",
        repositoryRoot,
        "--store",
        ".runtime",
        "--json",
      ]),
    ).toEqual({
      status: ResultStatus.Success,
      value: {
        command: CliCommand.CodingTaskSessionCloseoutRecoveryAssess,
        outputFormat: CliOutputFormat.Json,
        storeRoot: ".runtime",
        workspaceId: "workspace-1",
        sessionId: "session-1",
        repositoryId: "repository-1",
        repositoryRoot,
      },
    });
  });

  it("解析 recover 命令并保存文件、绑定和 Actor", () => {
    const result = parseCliArguments([
      "coding-task",
      "session",
      "closeout",
      "recover",
      "--file",
      "human-command.json",
      "--workspace",
      "workspace-1",
      "--session",
      "session-1",
      "--repository",
      "repository-1",
      "--root",
      repositoryRoot,
      "--actor-id",
      "human-1",
    ]);

    expect(result).toEqual({
      status: ResultStatus.Success,
      value: {
        command: CliCommand.CodingTaskSessionCloseoutRecover,
        outputFormat: CliOutputFormat.Human,
        filePath: "human-command.json",
        workspaceId: "workspace-1",
        sessionId: "session-1",
        repositoryId: "repository-1",
        repositoryRoot,
        actorId: "human-1",
      },
    });
  });

  it("解析 effective 命令且只保存 Workspace 和 Session", () => {
    const result = parseCliArguments([
      "coding-task",
      "session",
      "closeout",
      "effective",
      "--workspace",
      "workspace-1",
      "--session",
      "session-1",
    ]);

    expect(result).toEqual({
      status: ResultStatus.Success,
      value: {
        command: CliCommand.CodingTaskSessionEffectiveCloseout,
        outputFormat: CliOutputFormat.Human,
        workspaceId: "workspace-1",
        sessionId: "session-1",
      },
    });
  });

  it.each([
    ["assess", ["--file", "unexpected.json"]],
    ["assess", ["--actor-id", "human-1"]],
    ["recover", ["--verification-mode", "local_command"]],
    ["effective", ["--root", repositoryRoot]],
  ])("拒绝 %s 命令的多余选项", (subcommand, extra) => {
    const args = baseArgs(subcommand);
    args.push(...extra);

    expect(parseCliArguments(args).status).toBe(ResultStatus.Failure);
  });

  it("拒绝通过 --resolution 绕过完整 Human Command", () => {
    const args = baseArgs("recover");
    args.push("--resolution", "retry_once");

    expect(parseCliArguments(args).status).toBe(ResultStatus.Failure);
  });

  it.each([
    ["assess", "--session"],
    ["assess", "--root"],
    ["recover", "--file"],
    ["recover", "--actor-id"],
    ["effective", "--workspace"],
    ["effective", "--session"],
  ])("拒绝 %s 命令缺少 %s", (subcommand, option) => {
    const args = baseArgs(subcommand);
    const index = args.indexOf(option);
    args.splice(index, 2);

    expect(parseCliArguments(args).status).toBe(ResultStatus.Failure);
  });

  it.each(["assess", "recover"])("拒绝 %s 命令的相对 root", (subcommand) => {
    const args = baseArgs(subcommand);
    const index = args.indexOf("--root");
    args[index + 1] = "relative/repository";

    expect(parseCliArguments(args).status).toBe(ResultStatus.Failure);
  });
});

function baseArgs(subcommand: string): string[] {
  const args = [
    "coding-task",
    "session",
    "closeout",
    subcommand,
    "--workspace",
    "workspace-1",
    "--session",
    "session-1",
    "--repository",
    "repository-1",
    "--root",
    repositoryRoot,
  ];
  if (subcommand === "assess" || subcommand === "recover") {
    if (subcommand === "recover") {
      args.push("--file", "human-command.json", "--actor-id", "human-1");
    }
    return args;
  }
  return args.slice(0, 8);
}
