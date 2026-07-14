export function includesExactTextWithNormalizedLineEndings(actual, expected) {
  return normalizeLineEndings(actual).includes(normalizeLineEndings(expected));
}

function normalizeLineEndings(value) {
  return value.replace(/\r\n?/gu, "\n");
}
