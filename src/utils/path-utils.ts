import { existsSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function toPosixPath(p: string): string {
  return p.replaceAll('\\', '/')
}

function isPluginRootCandidate(dir: string): boolean {
  return [
    join(dir, 'dist', 'src', 'assets'),
    join(dir, 'opencode.json'),
  ].some((candidate) => existsSync(candidate))
}

/**
 * 根据模块 URL 推断 AE 插件根目录，兼容源码运行和仅分发 dist 产物两种结构。
 */
export function resolvePluginRootFromModuleUrl(moduleUrl: string): string {
  let dir = dirname(fileURLToPath(moduleUrl))

  while (dir !== dirname(dir)) {
    const parentDir = dirname(dir)

    if (basename(dir) === 'src' && basename(parentDir) === 'dist' && existsSync(join(dir, 'assets'))) {
      return dirname(parentDir)
    }

    if (basename(dir) === 'src' && existsSync(join(dir, 'assets'))) {
      return parentDir
    }

    // 优先根据插件结构推断根目录，兼容只有桥接文件和 dist 产物的安装方式。
    if (isPluginRootCandidate(dir)) {
      return dir
    }
    dir = dirname(dir)
  }

  throw new Error(`无法从模块路径推断仓库根目录: ${moduleUrl}`)
}

/**
 * 兼容旧命名，等价于 `resolvePluginRootFromModuleUrl()`。
 */
export const resolveRepoRootFromModuleUrl = resolvePluginRootFromModuleUrl

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
