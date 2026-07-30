import { chmod as defaultChmod } from "node:fs/promises";

import type { PosixRuntimeSecurityOverrides } from "../contracts/index.js";

/** 在 POSIX 系统将 Runtime 根目录限制为仅所有者可访问。 */
export async function securePosixRuntimeDirectory(
  root: string,
  overrides: PosixRuntimeSecurityOverrides = {},
): Promise<void> {
  const chmod = overrides.chmod ?? ((path, mode) => defaultChmod(path, mode));
  await chmod(root, 0o700);
}
