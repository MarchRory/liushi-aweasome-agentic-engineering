import { isAbsolute, resolve } from "node:path";
import process from "node:process";

/** 判断两个已规范化路径是否指向同一路径身份。 */
export function sameCodexPreflightPath(left: string, right: string): boolean {
  const normalizedLeft = resolve(left);
  const normalizedRight = resolve(right);

  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

/** 判断路径是否为当前平台或 Windows 盘符形式的绝对路径。 */
export function isCodexPreflightAbsolutePath(value: string): boolean {
  return isAbsolute(value) || /^[A-Za-z]:[\\/]/u.test(value);
}

/** 将 Home 路径拆成 Windows 子进程需要的盘符和盘内路径。 */
export function splitCodexPreflightHomePath(homePath: string): {
  readonly drive: string;
  readonly path: string;
} {
  const windowsPath = /^([A-Za-z]:)([\\/].*)$/u.exec(homePath);

  return windowsPath === null
    ? { drive: "", path: homePath }
    : { drive: windowsPath[1]!, path: windowsPath[2]! };
}
