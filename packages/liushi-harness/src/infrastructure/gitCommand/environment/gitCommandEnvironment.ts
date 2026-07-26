/** 创建不受宿主 `GIT_*` 控制变量污染的本地 Git 命令环境。 */
export function createSanitizedGitCommandEnvironment(
  source: Readonly<NodeJS.ProcessEnv> = process.env,
): Readonly<Record<string, string>> {
  const environment: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && !key.toUpperCase().startsWith("GIT_")) {
      environment[key] = value;
    }
  }
  return environment;
}
