import type { ProjectLanguageFact } from "#domain/projectDiscovery/index.js";

const LANGUAGE_BY_EXTENSION: Readonly<Record<string, string>> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".vue": "vue",
  ".svelte": "svelte",
  ".css": "css",
  ".scss": "scss",
  ".less": "less",
  ".html": "html",
  ".md": "markdown",
  ".mdx": "markdown",
  ".json": "json",
  ".jsonc": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".py": "python",
  ".go": "go",
  ".java": "java",
  ".kt": "kotlin",
  ".rs": "rust",
};

/** 根据文件扩展名生成不读取源码内容的语言统计。 */
export function analyzeProjectLanguages(files: readonly string[]): readonly ProjectLanguageFact[] {
  const counts = new Map<string, number>();
  for (const file of files) {
    const name = file.slice(file.lastIndexOf("/") + 1);
    const extensionIndex = name.lastIndexOf(".");
    const extension = extensionIndex < 0 ? "" : name.slice(extensionIndex).toLowerCase();
    const languageId = LANGUAGE_BY_EXTENSION[extension];
    if (languageId !== undefined) {
      counts.set(languageId, (counts.get(languageId) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([languageId, fileCount]) => ({ languageId, fileCount }))
    .sort((left, right) => compare(left.languageId, right.languageId));
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
