import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { appendState, readStateChain } from "../../../scripts/codexAgentPilot/state/index.mjs";

let root;

afterEach(async () => {
  if (root !== undefined) await rm(root, { recursive: true, force: true });
  root = undefined;
});

describe("Codex Agent Pilot state store atomicity", () => {
  it("并发 CAS 只发布一个完整后继 revision，且不遗留临时文件", async () => {
    root = await mkdtemp(join(tmpdir(), "liushi-pilot-state-"));
    const stateRoot = join(root, "state");
    await mkdir(stateRoot);
    const initial = await appendState(stateRoot, { status: "waiting_approval" });

    const results = await Promise.allSettled([
      appendState(
        stateRoot,
        { status: "left" },
        { expectedPreviousStateDigest: initial.state.stateDigest },
      ),
      appendState(
        stateRoot,
        { status: "right" },
        { expectedPreviousStateDigest: initial.state.stateDigest },
      ),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);

    const states = await readStateChain(stateRoot);
    expect(states).toHaveLength(2);
    expect(states[1].previousStateDigest).toBe(initial.state.stateDigest);
    expect((await readdir(stateRoot)).every((name) => !name.endsWith(".tmp"))).toBe(true);
  });
});
