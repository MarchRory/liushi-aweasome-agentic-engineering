import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

const DEFAULT_PREFIX = "liushi-runtime-store-";
const SAFE_PREFIX_PATTERN = /^[A-Za-z0-9._-]+$/;

/** 只管理并清理由自身创建在操作系统临时目录下的 Runtime Store。 */
export class TemporaryRuntimeStore {
  readonly #createdStoreRoots = new Set<string>();

  /** 创建并登记一个具有安全前缀的临时 Runtime Store。 */
  public async create(prefix = DEFAULT_PREFIX): Promise<string> {
    if (!SAFE_PREFIX_PATTERN.test(prefix) || prefix === "." || prefix === "..") {
      throw new Error("Temporary runtime store prefix must be a safe path segment.");
    }

    const temporaryRoot = resolve(tmpdir());
    const storeRoot = resolve(await mkdtemp(join(temporaryRoot, prefix)));
    assertInsideTemporaryRoot(temporaryRoot, storeRoot);
    this.#createdStoreRoots.add(storeRoot);
    return storeRoot;
  }

  /** 校验全部登记路径后递归清理本实例创建的 Store。 */
  public async cleanup(): Promise<void> {
    const temporaryRoot = resolve(tmpdir());
    for (const storeRoot of [...this.#createdStoreRoots]) {
      assertInsideTemporaryRoot(temporaryRoot, storeRoot);
      await rm(storeRoot, { recursive: true, force: true });
      this.#createdStoreRoots.delete(storeRoot);
    }
  }
}

function assertInsideTemporaryRoot(temporaryRoot: string, storeRoot: string): void {
  const relativeStoreRoot = relative(temporaryRoot, storeRoot);
  if (
    relativeStoreRoot.length === 0 ||
    relativeStoreRoot === ".." ||
    relativeStoreRoot.startsWith(`..${sep}`) ||
    isAbsolute(relativeStoreRoot)
  ) {
    throw new Error(`Refusing to remove a path outside the OS temporary directory: ${storeRoot}`);
  }
}
