import { existsSync, lstatSync, statSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function isRegularFile(path: string): boolean {
  return statSync(path, { throwIfNoEntry: false })?.isFile() ?? false
}

export function toPosixPath(p: string): string {
  return p.replaceAll('\\', '/')
}

function isPluginRootCandidate(dir: string): boolean {
  return existsSync(join(dir, 'dist', 'src', 'assets'))
}

function isPluginBundleLayout(dir: string): boolean {
  return existsSync(join(dir, 'ai-agent-engine', 'skills'))
}

function isNestedUnderHiddenDirectory(moduleDir: string, candidateRoot: string): boolean {
  const rel = relative(candidateRoot, moduleDir)
  return rel.split(/[\\/]+/).some((part) => part.startsWith('.'))
}

/**
 * 根据模块 URL 推断 AE 插件根目录，兼容以下结构：
 * 1. 打包后布局：bundle 在 <root>/plugins/ 下，assets 在 <root>/plugins/ai-agent-engine/assets/
 * 2. 源码布局：模块在 <root>/src/index.js，assets 在 <root>/src/assets/
 * 3. dist 产物布局：模块在 <root>/dist/src/index.js，assets 在 <root>/dist/src/assets/
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

    if (isPluginRootCandidate(dir) && !isNestedUnderHiddenDirectory(dirname(fileURLToPath(moduleUrl)), dir)) {
      return dir
    }

    if (isPluginBundleLayout(dir) && !isNestedUnderHiddenDirectory(dirname(fileURLToPath(moduleUrl)), dir)) {
      return dirname(dir)
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

/**
 * 基于优先基准路径解析输入路径；相对路径默认相对于提供的 base。
 */
export function resolvePathWithBase(base: string, input?: string): string {
  if (!input) {
    return resolve(base)
  }
  return resolve(base, input)
}

export function pathContainsSymlink(root: string, filePath: string): boolean {
  const absRoot = resolve(root)
  const absTarget = resolve(filePath)
  if (!isInsideRoot(absRoot, absTarget)) {
    return false
  }
  const rel = relative(absRoot, absTarget)
  if (!rel) {
    return lstatSync(absRoot).isSymbolicLink()
  }
  let current = absRoot
  for (const part of rel.split(/[\\/]+/)) {
    current = join(current, part)
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) {
      return true
    }
  }
  return false
}
