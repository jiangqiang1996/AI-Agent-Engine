import { existsSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function toPosixPath(p: string): string {
  return p.replaceAll('\\', '/')
}

export function resolveRepoRootFromModuleUrl(moduleUrl: string): string {
  let dir = dirname(fileURLToPath(moduleUrl))

  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, 'opencode.json'))) {
      return dir
    }
    dir = dirname(dir)
  }

  throw new Error(`无法从模块路径推断仓库根目录: ${moduleUrl}`)
}

export function isInsideRoot(root: string, filePath: string): boolean {
  const rel = relative(resolve(root), resolve(filePath))
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
