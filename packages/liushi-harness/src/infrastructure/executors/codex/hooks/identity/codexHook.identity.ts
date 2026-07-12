import { createHash } from "node:crypto";

const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** 从稳定 Hook 输入生成满足 ULID 格式的确定性标识。 */
export function deriveDeterministicUlid(seed: string): string {
  let value = BigInt(`0x${createHash("sha256").update(seed).digest("hex").slice(0, 32)}`);
  const characters = Array.from({ length: 26 }, () => {
    const character = CROCKFORD_ALPHABET[Number(value & 31n)];
    value >>= 5n;
    return character;
  });
  return characters.reverse().join("");
}

/** 从稳定 Hook 输入生成指定长度的十六进制标识。 */
export function deriveDeterministicHex(seed: string, length: number): string {
  return createHash("sha256").update(seed).digest("hex").slice(0, length);
}
