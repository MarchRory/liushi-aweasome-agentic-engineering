import {
  mkdir as defaultMkdir,
  mkdtemp as defaultMkdtemp,
  lstat as defaultLstat,
  readFile as defaultReadFile,
  readdir as defaultReaddir,
  realpath as defaultRealpath,
  rm as defaultRm,
  writeFile as defaultWriteFile,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { tmpdir as defaultTmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";

import {
  CODEX_PREFLIGHT_INITIAL_CONTENT,
  CODEX_PREFLIGHT_OUT_OF_SET_FILE,
  CODEX_PREFLIGHT_OWNER_FILE,
  CODEX_PREFLIGHT_OWNER_MARKER,
  CODEX_PREFLIGHT_SCENARIO_DIRECTORIES,
  CODEX_PREFLIGHT_SCENARIOS,
  CODEX_PREFLIGHT_TARGET_FILE,
  CODEX_PREFLIGHT_TEMPORARY_ROOT_PREFIX,
  CODEX_PREFLIGHT_UPDATED_CONTENT,
} from "./preflightConstants.mjs";

const ownedRoots = new Map();

export async function createCodexPreflightTemporaryRoot(overrides = {}) {
  const fs = createFileSystem(overrides);
  const tempDirectory = overrides.tempDirectory ?? defaultTmpdir();
  const root = await fs.mkdtemp(join(tempDirectory, CODEX_PREFLIGHT_TEMPORARY_ROOT_PREFIX));
  const canonicalParent = await fs.realpath(dirname(root));
  const expectedParent = await fs.realpath(tempDirectory);
  if (!samePath(canonicalParent, expectedParent)) {
    throw new Error("preflight root was not created under the requested temporary directory");
  }
  await assertPreflightRootDirectory(root, fs, canonicalParent);
  const ownerToken = randomUUID();
  await fs.writeFile(
    join(root, CODEX_PREFLIGHT_OWNER_FILE),
    `${CODEX_PREFLIGHT_OWNER_MARKER}\n${ownerToken}\n`,
    {
      encoding: "utf8",
      flag: "wx",
    },
  );
  const canonicalRoot = resolve(root);
  ownedRoots.set(canonicalRoot, { ownerToken, parent: canonicalParent });
  await assertOwnedCodexPreflightRoot(canonicalRoot, { ...overrides, fs, ownerToken });
  return { root: canonicalRoot, ownerToken };
}

export async function createCodexPreflightScenarioWorkspace(input, overrides = {}) {
  const fs = createFileSystem(overrides);
  const root = requireAbsolutePath(input?.root, "preflight root");
  await assertOwnedCodexPreflightRoot(root, { ...overrides, fs, ownerToken: input?.ownerToken });
  const scenario = requireScenario(input?.scenario);
  const scenarioRoot = join(root, CODEX_PREFLIGHT_SCENARIO_DIRECTORIES[scenario]);
  const worktreeRoot = join(scenarioRoot, "worktree");
  const codexHome = join(scenarioRoot, "codex-home");
  const sqliteHome = join(codexHome, "sqlite");
  const profileHome = join(scenarioRoot, "home");
  const tempHome = join(scenarioRoot, "temp");

  for (const directory of [
    scenarioRoot,
    worktreeRoot,
    codexHome,
    sqliteHome,
    profileHome,
    tempHome,
  ]) {
    await fs.mkdir(directory, { recursive: false, mode: 0o700 });
  }
  const targetPath = join(worktreeRoot, CODEX_PREFLIGHT_TARGET_FILE);
  await fs.writeFile(targetPath, CODEX_PREFLIGHT_INITIAL_CONTENT, {
    encoding: "utf8",
    flag: "wx",
  });

  return {
    scenario,
    root: scenarioRoot,
    worktreeRoot,
    codexHome,
    sqliteHome,
    profileHome,
    tempHome,
    targetPath,
    outOfSetPath: join(worktreeRoot, CODEX_PREFLIGHT_OUT_OF_SET_FILE),
  };
}

export async function verifyCodexPreflightScenarioWorkspace(workspace) {
  const targetPath = requireAbsolutePath(workspace?.targetPath, "target path");
  const outOfSetPath = requireAbsolutePath(workspace?.outOfSetPath, "out-of-set path");
  const targetMetadata = await defaultLstat(targetPath);
  if (targetMetadata.isSymbolicLink() || !targetMetadata.isFile()) {
    throw new Error("preflight target.txt must remain an ordinary file");
  }
  const targetContent = await defaultReadFile(targetPath, "utf8");
  const outOfSetExists = await pathExists(outOfSetPath);
  const entries = (await defaultReaddir(workspace.worktreeRoot)).sort();
  const expectedEntries = [CODEX_PREFLIGHT_TARGET_FILE];
  if (JSON.stringify(entries) !== JSON.stringify(expectedEntries)) {
    throw new Error("preflight worktree contains an unexpected file");
  }

  if (workspace.scenario === CODEX_PREFLIGHT_SCENARIOS.AllowedUpdate) {
    if (targetContent !== CODEX_PREFLIGHT_UPDATED_CONTENT || outOfSetExists) {
      throw new Error("allowed preflight did not produce the exact target update");
    }
    return { targetChanged: true };
  }
  if (workspace.scenario === CODEX_PREFLIGHT_SCENARIOS.OutOfSetUpdate) {
    if (targetContent !== CODEX_PREFLIGHT_INITIAL_CONTENT || outOfSetExists) {
      throw new Error("out-of-set preflight changed the worktree");
    }
    return { targetChanged: false };
  }
  throw new Error("preflight scenario is not supported");
}

export async function cleanupCodexPreflightTemporaryRoot(root, overrides = {}) {
  const fs = createFileSystem(overrides);
  const validatedRoot = await assertOwnedCodexPreflightRoot(root, { ...overrides, fs });
  await assertOrdinaryTree(validatedRoot, fs);
  await fs.rm(validatedRoot, { recursive: true, force: false });
  if (await pathExists(validatedRoot, fs)) {
    throw new Error("preflight temporary root still exists after cleanup");
  }
  ownedRoots.delete(validatedRoot);
  return { confirmed: true };
}

export async function assertOwnedCodexPreflightRoot(root, overrides = {}) {
  const fs = createFileSystem(overrides);
  const validatedRoot = requireAbsolutePath(root, "preflight root");
  const ownership = ownedRoots.get(validatedRoot);
  await assertPreflightRootDirectory(validatedRoot, fs, ownership?.parent);
  const ownerFile = join(validatedRoot, CODEX_PREFLIGHT_OWNER_FILE);
  const ownerMetadata = await fs.lstat(ownerFile);
  if (ownerMetadata.isSymbolicLink() || !ownerMetadata.isFile()) {
    throw new Error("preflight root owner marker must be an ordinary file");
  }
  const owner = await fs.readFile(ownerFile, "utf8");
  const [marker, ownerToken] = owner.split("\n");
  if (
    marker !== CODEX_PREFLIGHT_OWNER_MARKER ||
    ownership === undefined ||
    (overrides.ownerToken !== undefined && overrides.ownerToken !== ownership.ownerToken) ||
    ownerToken !== ownership.ownerToken
  ) {
    throw new Error("preflight root owner marker is invalid");
  }
  return validatedRoot;
}

async function assertPreflightRootDirectory(validatedRoot, fs, expectedParent) {
  const rootMetadata = await fs.lstat(validatedRoot);
  if (rootMetadata.isSymbolicLink() || !rootMetadata.isDirectory()) {
    throw new Error("preflight root must be an ordinary directory");
  }
  const canonicalRoot = await fs.realpath(validatedRoot);
  if (!samePath(canonicalRoot, validatedRoot)) {
    throw new Error("preflight root must be canonical");
  }
  const canonicalParent = await fs.realpath(dirname(validatedRoot));
  if (expectedParent !== undefined && !samePath(canonicalParent, expectedParent)) {
    throw new Error("preflight root parent is not owned by this invocation");
  }
  if (!basename(validatedRoot).startsWith(CODEX_PREFLIGHT_TEMPORARY_ROOT_PREFIX)) {
    throw new Error("preflight root has an invalid owner prefix");
  }
}

async function assertOrdinaryTree(path, fs) {
  const metadata = await fs.lstat(path);
  if (metadata.isSymbolicLink()) throw new Error("preflight root contains a symbolic link");
  const canonical = await fs.realpath(path);
  if (!samePath(canonical, path)) throw new Error("preflight root contains a redirected path");
  if (metadata.isDirectory()) {
    for (const entry of await fs.readdir(path)) {
      const child = join(path, entry);
      if (relative(path, child).startsWith("..")) {
        throw new Error("preflight root contains a path traversal");
      }
      await assertOrdinaryTree(child, fs);
    }
    return;
  }
  if (!metadata.isFile()) throw new Error("preflight root contains a non-file node");
}

async function pathExists(path, fs = createFileSystem({})) {
  try {
    await fs.lstat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function requireScenario(value) {
  if (!Object.values(CODEX_PREFLIGHT_SCENARIOS).includes(value)) {
    throw new TypeError("preflight scenario is invalid");
  }
  return value;
}

function requireAbsolutePath(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    throw new TypeError(`${label} must be a non-empty path without NUL`);
  }
  if (!resolve(value) || (!value.startsWith("/") && !/^[A-Za-z]:[\\/]/u.test(value))) {
    throw new TypeError(`${label} must be absolute`);
  }
  return value;
}

function samePath(left, right) {
  const normalizedLeft = resolve(left);
  const normalizedRight = resolve(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function createFileSystem(overrides) {
  const supplied = overrides.fs ?? overrides;
  return {
    lstat: supplied.lstat ?? defaultLstat,
    mkdir: supplied.mkdir ?? defaultMkdir,
    mkdtemp: supplied.mkdtemp ?? defaultMkdtemp,
    readFile: supplied.readFile ?? defaultReadFile,
    readdir: supplied.readdir ?? defaultReaddir,
    realpath: supplied.realpath ?? defaultRealpath,
    rm: supplied.rm ?? defaultRm,
    writeFile: supplied.writeFile ?? defaultWriteFile,
  };
}
