import { runProcess as defaultRunProcess } from "../../../../../common/process/index.mjs";

export async function secureWindowsRuntimeDirectory(root, overrides = {}) {
  const runProcess = overrides.runProcess ?? defaultRunProcess;
  const result = await runProcess("whoami.exe", ["/user", "/fo", "csv", "/nh"]);
  const sid = parseWindowsUserSid(result?.stdout ?? result);
  await runProcess("icacls.exe", [
    root,
    "/inheritance:r",
    "/grant:r",
    `${sid}:(OI)(CI)F`,
    "SYSTEM:(OI)(CI)F",
    "/T",
  ]);
  return { sid };
}

export function parseWindowsUserSid(value) {
  if (typeof value !== "string") throw new Error("whoami.exe 未返回可解析的 SID。");
  const matches = value.match(/\bS-\d-\d+(?:-\d+)+\b/g) ?? [];
  if (matches.length !== 1) throw new Error("whoami.exe 返回的 SID 不唯一。");
  return matches[0];
}
