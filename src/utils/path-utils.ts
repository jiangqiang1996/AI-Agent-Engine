import { existsSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function toPosixPath(p: string): string {
  return p.replaceAll('\\', '/')
}

export function resolveRepoRootFromModuleUrl(moduleUrl: string): string {
  let dir = dirname(fileURLToPath(moduleUrl))

  while (dir !== dirname(dir)) {
    // opencode.json 是插件项目的稳定锚点，比依赖当前工作目录更适合构建产物和测试环境。
    if (existsSync(join(dir, 'opencode.json'))) {
      return dir
    }
    dir = dirname(dir)
  }

  throw new Error(`无法从模块路径推断仓库根目录: ${moduleUrl}`)
}

export function isInsideRoot(root: string, filePath: string): boolean {
  const rel = relative(resolve(root), resolve(filePath))
  // Windows 盘符相对路径会包含冒号，必须和 .. 一起拦截，避免跨盘路径绕过仓库边界。
  return rel === '' || (!rel.startsWith('..') && !rel.includes(':'))
}

export function toRepoRelativePath(root: string, filePath: string): string {
  const absRoot = resolve(root)
  const absTarget = resolve(filePath)

  if (!isInsideRoot(absRoot, absTarget)) {
    throw new Error(`路径不在仓库内: ${absTarget}`)
  }

  const rel = relative(absRoot, absTarget)
  return toPosixPath(rel === '' ? '.' : rel)
}
