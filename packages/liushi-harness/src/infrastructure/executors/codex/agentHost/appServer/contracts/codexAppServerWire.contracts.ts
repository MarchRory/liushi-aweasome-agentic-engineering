/** App Server JSON 消息的可索引记录形状。 */
export interface CodexAppServerWireRecord {
  /** 任意未建模的 Wire 字段。 */
  readonly [key: string]: unknown;
  /** JSON-RPC 请求或响应编号。 */
  readonly id?: string | number;
  /** JSON-RPC 方法名称。 */
  readonly method?: unknown;
  /** JSON-RPC 参数。 */
  readonly params?: unknown;
  /** JSON-RPC 成功结果。 */
  readonly result?: unknown;
  /** JSON-RPC 错误对象。 */
  readonly error?: unknown;
  /** 线程或 Turn 嵌套对象。 */
  readonly thread?: unknown;
  /** 线程编号。 */
  readonly threadId?: unknown;
  /** Turn 嵌套对象。 */
  readonly turn?: unknown;
  /** Turn 编号。 */
  readonly turnId?: unknown;
  /** Item 对象。 */
  readonly item?: unknown;
  /** Item 编号。 */
  readonly itemId?: unknown;
  /** Item 或状态类型。 */
  readonly type?: unknown;
  /** Item 状态。 */
  readonly status?: unknown;
  /** 文件变更集合。 */
  readonly changes?: unknown;
  /** 文件变更种类对象。 */
  readonly kind?: unknown;
  /** 文件路径。 */
  readonly path?: unknown;
  /** 服务端请求编号。 */
  readonly requestId?: unknown;
  /** 速率限制记录。 */
  readonly rateLimits?: unknown;
  /** 远程控制服务名称。 */
  readonly serverName?: unknown;
  /** 远程控制安装编号。 */
  readonly installationId?: unknown;
  /** 远程控制环境编号。 */
  readonly environmentId?: unknown;
  /** 线程活动标记集合。 */
  readonly activeFlags?: unknown;
  /** 驼峰移动路径字段。 */
  readonly movePath?: unknown;
  /** 下划线移动路径字段。 */
  readonly move_path?: unknown;
  /** 驼峰授权根字段。 */
  readonly grantRoot?: unknown;
  /** 下划线授权根字段。 */
  readonly grant_root?: unknown;
}

/** JSON-RPC 请求、通知和响应共用的最小消息形状。 */
export interface CodexAppServerWireMessage {
  /** JSON-RPC 请求或响应编号。 */
  readonly id?: string | number;
  /** JSON-RPC 方法名称。 */
  readonly method?: unknown;
  /** JSON-RPC 参数。 */
  readonly params?: unknown;
  /** JSON-RPC 成功结果。 */
  readonly result?: unknown;
  /** JSON-RPC 错误对象。 */
  readonly error?: unknown;
}

/** App Server 使用的请求编号类型。 */
export type CodexAppServerRpcId = string | number;
