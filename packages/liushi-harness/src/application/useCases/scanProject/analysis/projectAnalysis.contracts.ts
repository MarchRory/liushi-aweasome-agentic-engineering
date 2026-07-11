import type {
  ProjectConfigFinding,
  ProjectCompilerConfigFact,
  ProjectDiscoveryDiagnostic,
  ProjectFrameworkHint,
  ProjectPackageFact,
  ProjectPackageManagerFact,
} from "#domain/projectDiscovery/index.js";

import type { ProjectConfigDocumentFormat } from "#application/ports/index.js";
import type { ProjectConfigKind } from "#domain/projectDiscovery/index.js";

/** Scanner 对一个配置路径的安全分类。 */
export interface ClassifiedProjectConfig {
  /** 配置文件的 Repository 相对路径。 */
  relativePath: string;
  /** 配置文件的封闭类别。 */
  kind: ProjectConfigKind;
  /** 可以无执行解析时使用的格式。 */
  format?: ProjectConfigDocumentFormat;
  /** 文件是否可能包含可执行配置代码。 */
  executable: boolean;
}

/** Package Manifest 结构化分析结果。 */
export interface PackageManifestAnalysis {
  /** Manifest 的脱敏事实。 */
  packageFact: ProjectPackageFact;
  /** packageManager 字段产生的可选事实。 */
  packageManager?: ProjectPackageManagerFact;
  /** 已知依赖产生的 Framework Hint。 */
  frameworkHints: readonly ProjectFrameworkHint[];
}

/** 配置文本分析后用于 Candidate Assembly 的事实集合。 */
export interface AnalyzedProjectConfigs {
  /** 所有配置文件的处理状态。 */
  configFiles: readonly ProjectConfigFinding[];
  /** Package Manifest 事实。 */
  packages: readonly ProjectPackageFact[];
  /** Compiler 配置事实。 */
  compilerConfigs: readonly ProjectCompilerConfigFact[];
  /** Lockfile 与 packageManager 字段事实。 */
  packageManagers: readonly ProjectPackageManagerFact[];
  /** Framework 与工具 Hint。 */
  frameworkHints: readonly ProjectFrameworkHint[];
  /** 配置读取与解析诊断。 */
  diagnostics: readonly ProjectDiscoveryDiagnostic[];
}
