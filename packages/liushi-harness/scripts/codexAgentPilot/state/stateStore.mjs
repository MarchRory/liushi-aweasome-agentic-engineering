import { mkdir, open, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  STATE_DIRECTORY,
  STATE_FILE_PREFIX,
  STATE_FILE_SUFFIX,
  STATE_REVISION_WIDTH,
  STATE_SCHEMA_VERSION,
} from "../constants/index.mjs";
import { calculateDigest } from "../digest/index.mjs";
import { rejectLink } from "../validation/index.mjs";

export async function createStateStore(controlRoot) {
  const stateRoot = join(controlRoot, STATE_DIRECTORY);
  await mkdir(stateRoot, { recursive: true });
  return { stateRoot };
}

export async function appendState(stateRoot, state) {
  const current = await readStateChain(stateRoot, { allowMissing: true });
  const revision = current.length + 1;
  const previousStateDigest = current.at(-1)?.stateDigest ?? null;
  const body = {
    schemaVersion: STATE_SCHEMA_VERSION,
    revision,
    previousStateDigest,
    ...state,
  };
  if (body.stateDigest !== undefined) throw new Error("状态不得预先携带 stateDigest。");
  const stateDigest = calculateDigest(body);
  const value = { ...body, stateDigest };
  const file = join(
    stateRoot,
    `${STATE_FILE_PREFIX}${String(revision).padStart(STATE_REVISION_WIDTH, "0")}${STATE_FILE_SUFFIX}`,
  );
  await writeCreateOnly(file, `${JSON.stringify(value, null, 2)}\n`);
  return { file, state: value };
}

export async function readStateChain(stateRoot, options = {}) {
  await rejectLink(stateRoot, "状态目录");
  const entries = await readdir(stateRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(STATE_FILE_PREFIX) && !isStateFileName(entry.name)) {
      throw new Error("状态 revision 文件名无效。");
    }
    if (isStateFileName(entry.name) && !entry.isFile()) {
      throw new Error("状态 revision 必须是普通文件。");
    }
  }
  const names = entries
    .filter((entry) => isStateFileName(entry.name))
    .map((entry) => entry.name)
    .sort();
  if (names.length === 0) {
    if (options.allowMissing === true) return [];
    throw new Error("缺少状态 revision。");
  }
  const states = [];
  for (let index = 0; index < names.length; index += 1) {
    const expected = `${STATE_FILE_PREFIX}${String(index + 1).padStart(STATE_REVISION_WIDTH, "0")}${STATE_FILE_SUFFIX}`;
    if (names[index] !== expected) throw new Error("状态 revision 必须连续且不可重复。");
    const file = join(stateRoot, names[index]);
    await rejectLink(file, `状态文件 ${names[index]}`);
    const parsed = JSON.parse(await readFile(file, "utf8"));
    verifyState(parsed, index + 1, states.at(-1)?.stateDigest ?? null);
    states.push(parsed);
  }
  return states;
}

function isStateFileName(name) {
  return new RegExp(
    `^${STATE_FILE_PREFIX}\\d{${STATE_REVISION_WIDTH}}\\${STATE_FILE_SUFFIX}$`,
    "u",
  ).test(name);
}

export async function readHighestState(stateRoot) {
  const states = await readStateChain(stateRoot);
  return states.at(-1);
}

export function verifyState(state, revision, previousStateDigest) {
  if (state?.schemaVersion !== STATE_SCHEMA_VERSION || state.revision !== revision) {
    throw new Error("状态 schema 或 revision 无效。");
  }
  if (state.previousStateDigest !== previousStateDigest)
    throw new Error("状态 previousStateDigest 不匹配。");
  if (
    typeof state.stateDigest !== "string" ||
    calculateDigest(stripDigest(state)) !== state.stateDigest
  ) {
    throw new Error("状态摘要校验失败。");
  }
}

function stripDigest(state) {
  const { stateDigest, ...body } = state;
  void stateDigest;
  return body;
}

async function writeCreateOnly(file, content) {
  const handle = await open(file, "wx");
  try {
    await handle.writeFile(content, "utf8");
  } finally {
    await handle.close();
  }
}

export async function writeControlJson(file, value) {
  await writeCreateOnly(file, `${JSON.stringify(value, null, 2)}\n`);
}

export async function writeControlText(file, value) {
  if (typeof value !== "string") throw new Error("Control 文本必须是字符串。");
  await writeCreateOnly(file, value);
}

export async function readControlJson(file) {
  await rejectLink(file, "Control 文件");
  return JSON.parse(await readFile(file, "utf8"));
}
