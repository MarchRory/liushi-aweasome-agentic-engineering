import { chmod as defaultChmod } from "node:fs/promises";

export async function securePosixRuntimeDirectory(root, overrides = {}) {
  const chmod = overrides.chmod ?? defaultChmod;
  await chmod(root, 0o700);
}
