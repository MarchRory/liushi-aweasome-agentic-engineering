export const PUBLIC_REPOSITORY_URL = "https://github.com/unjs/defu.git";
export const PUBLIC_REPOSITORY_REVISION = "82632b66f5914e9946edce300e10633a3d5c0cb7";
export const PUBLIC_REPOSITORY_ID = "unjs-defu";
export const PUBLIC_PACKAGE_MANAGER = "pnpm@10.33.4";
export const WORKSPACE_ID = "liushi-public-project-smoke";
export const CODING_TASK_ID = "liushi-public-project-smoke-coding-task";
export const CORRELATION_ID = "liushi-public-project-smoke-correlation";
export const SMOKE_HUMAN_ACTOR_ID = "smoke-human";
export const SMOKE_AGENT_ACTOR_ID = "public-smoke-agent";
export const WRITE_SET = ["test/utils.test.ts"];
export const WORKTREE_RELATIVE_PATH = "node_modules/.liushi-harness-public-smoke";
export const WORKTREE_ID = "liushi-public-project-smoke-worktree";
export const WORKTREE_BRANCH = "liushi/public-project-smoke";
export const VERIFICATION_RUN_ID = "liushi-public-project-smoke-verification";
export const VERIFICATION_PLAN_ID = "liushi-public-project-smoke-plan";
export const TEMP_DIRECTORY_PREFIX = "liushi-public-project-smoke-";
export const MANIFEST_SCHEMA_VERSION = "coding-task.cell.run.v2";
export const SUBMITTED_AT = "2026-07-14T00:00:00.000Z";

export const EXPECTED_TEST_CONTENT = `import { describe } from "node:test";
import { it, expect } from "vitest";
import { isPlainObject } from "../src/_utils";

describe("isPlainObject", () => {
  it("plain objects", () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ prop: true })).toBe(true);
    expect(isPlainObject({ constructor: true })).toBe(true);
    expect(isPlainObject({ __proto__: true })).toBe(true);
    expect(isPlainObject(new Proxy({}, {}))).toBe(true);
  });

  it("module namespace objects", async () => {
    const namespace = await import("../src/_utils");
    expect(isPlainObject(namespace)).toBe(true);
  });

  it("non plain objects", () => {
    expect(isPlainObject(undefined)).toBe(false);
    expect(isPlainObject(0)).toBe(false);
    expect(isPlainObject(0n)).toBe(false);
    expect(isPlainObject("")).toBe(false);
    expect(isPlainObject(true)).toBe(false);
    expect(isPlainObject(Symbol(""))).toBe(false);
    expect(isPlainObject(() => {})).toBe(false);
    expect(isPlainObject(function namedFunc() {})).toBe(false);
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject(Math)).toBe(false);
    expect(isPlainObject(new Set([]))).toBe(false);
    expect(isPlainObject(new ArrayBuffer(0))).toBe(false);
    expect(isPlainObject(Promise.resolve())).toBe(false);
    expect(isPlainObject(Object.create(null))).toBe(true);
    expect(isPlainObject(new Intl.Locale("en"))).toBe(false);
    // eslint-disable-next-line no-new-object
    expect(isPlainObject(new Object({ prop: true }))).toBe(true);
    expect(isPlainObject(new (class Class {})())).toBe(false);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(/regexp/)).toBe(false);
    expect(isPlainObject(new Error("test"))).toBe(false);
    expect(isPlainObject(new Date())).toBe(false);
    expect(
      isPlainObject(
        (function () {
          // eslint-disable-next-line prefer-rest-params
          return arguments;
        })(),
      ),
    ).toBe(false);
    expect(isPlainObject({ [Symbol.toStringTag]: true })).toBe(false);
    expect(isPlainObject({ [Symbol.iterator]: true })).toBe(false);
  });
});
`;

export const ORIGINAL_TEST_CONTENT = EXPECTED_TEST_CONTENT.replace(
  `
  it("module namespace objects", async () => {
    const namespace = await import("../src/_utils");
    expect(isPlainObject(namespace)).toBe(true);
  });
`,
  "",
);
