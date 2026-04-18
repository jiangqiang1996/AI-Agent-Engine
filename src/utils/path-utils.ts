import { existsSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 统一生成 repo-relative 路径，避免文档和资产在不同机器上漂移。
 */
export function toPosixPath(path: string): string {
  return path.replaceAll('\\', '/')
}

export function resolveRepoRootFromModuleUrl(moduleUrl: string): string {
  let current = dirname(fileURLToPath(moduleUrl))

  while (current !== dirname(current)) {
    if (existsSync(join(current, 'opencode.json'))) {
      return current
    }

    current = dirname(current)
  }

  throw new Error(`无法从模块路径推断仓库根目录: ${moduleUrl}`)
}

export function isInsideRoot(root: string, target: string): boolean {
  const relativePath = relative(resolve(root), resolve(target))
  return relativePath === '' || (!relativePath.startsWith('..') && !relativePath.includes(':'))
}

export function toRepoRelativePath(root: string, target: string): string {
  const resolvedRoot = resolve(root)
  const resolvedTarget = resolve(target)

  if (!isInsideRoot(resolvedRoot, resolvedTarget)) {
    throw new Error(`路径不在仓库内: ${resolvedTarget}`)
  }

  const relativePath = relative(resolvedRoot, resolvedTarget)
  return toPosixPath(relativePath === '' ? '.' : relativePath)
}
