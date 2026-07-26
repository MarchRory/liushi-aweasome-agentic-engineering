import { describe, expect, it } from "vitest";

import { createSanitizedGitCommandEnvironment } from "../../src/infrastructure/gitCommand/index.js";

describe("Git Command Environment", () => {
  it("保留普通环境变量并按大小写剥离全部 GIT 控制变量", () => {
    const environment = createSanitizedGitCommandEnvironment({
      PATH: "C:/tools",
      HOME: "C:/home",
      GIT_DIR: "C:/attacker/repository.git",
      git_work_tree: "C:/attacker/worktree",
      GIT_CONFIG_COUNT: "1",
      EMPTY: undefined,
    });

    expect(environment).toEqual({
      PATH: "C:/tools",
      HOME: "C:/home",
    });
  });
});
