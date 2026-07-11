import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { join } from "node:path";

import {
  ProjectTextFileReadStatus,
  type ProjectTextFileReadResult,
} from "#application/ports/projectFileSystem/index.js";
import { ResultStatus, parseContentDigest } from "#common/index.js";

import {
  inspectPath,
  PathInspectionStatus,
  unavailableResult,
  unsafePathResult,
} from "./projectFileSystem.io.js";
import { isPathWithinRoot } from "./projectScanner.io.js";

/** 在不跟随链接且不泄露绝对路径的前提下读取单个 UTF-8 文本文件。 */
export async function readProjectTextFile(
  realRoot: string,
  relativePath: string,
): Promise<ProjectTextFileReadResult> {
  const candidate = join(realRoot, ...relativePath.split("/"));
  if (!isPathWithinRoot(realRoot, candidate)) {
    return unsafePathResult();
  }

  const pathInspection = await inspectPath(realRoot, relativePath);
  if (pathInspection.status === PathInspectionStatus.Link) {
    return unsafePathResult(relativePath);
  }
  if (pathInspection.status === PathInspectionStatus.Unavailable) {
    return unavailableResult(relativePath);
  }

  let resolvedPath: string;
  let stats;
  try {
    resolvedPath = await realpath(candidate);
    stats = await lstat(resolvedPath);
  } catch {
    return unavailableResult(relativePath);
  }
  if (!isPathWithinRoot(realRoot, resolvedPath) || stats.isSymbolicLink()) {
    return unsafePathResult(relativePath);
  }
  if (!stats.isFile()) {
    return unavailableResult(relativePath);
  }

  const byteLength = stats.size;

  let buffer: Buffer;
  try {
    buffer = await readFile(resolvedPath);
  } catch {
    return unavailableResult(relativePath, byteLength);
  }

  let content: string;
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return {
      relativePath,
      status: ProjectTextFileReadStatus.InvalidEncoding,
      byteLength: buffer.byteLength,
    };
  }

  const digest = parseContentDigest(`sha256:${createHash("sha256").update(buffer).digest("hex")}`);
  if (digest.status === ResultStatus.Failure) {
    throw digest.error;
  }
  return {
    relativePath,
    status: ProjectTextFileReadStatus.Read,
    byteLength: buffer.byteLength,
    contentDigest: digest.value,
    content,
  };
}
