/** 依赖树节点 */
export interface DependencyNode {
  name: string
  version?: string
  scope?: string
  children: DependencyNode[]
}

/** 依赖树 */
export interface DependencyTree {
  ecosystem: string
  root: DependencyNode
  parser: 'tool-cli' | 'regex-fallback'
}

/** 解析器错误 */
export interface ResolverError {
  _tag: string
  ecosystem: string
  message: string
  cause?: unknown
}

/** 依赖解析器统一接口 */
export interface DependencyResolver {
  /** 生态系统名称（maven/npm/gomod/pip/cargo/gradle） */
  ecosystem: string
  /** 检测当前工作区是否使用该生态系统 */
  detect(worktree: string): boolean
  /** 解析依赖树，优先使用工具命令，失败时降级为正则 */
  resolve(worktree: string, timeout: number): Promise<DependencyTree>
}
