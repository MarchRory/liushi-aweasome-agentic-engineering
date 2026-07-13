import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export async function calculateFileDigest(filePath) {
  const content = await readFile(filePath);
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}
