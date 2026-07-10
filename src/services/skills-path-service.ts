import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

import type { RuntimeAssetManifest } from './runtime-asset-manifest.js'
import { getOpencodeGlobalConfigDir } from './opencode-path-service.js'

interface SkillPathConfig {
  skills?: {
    paths?: string[]
  }
}

export async function registerSkillsPath(
  config: SkillPathConfig,
  manifest: RuntimeAssetManifest,
  worktree: string,
): Promise<void> {
  config.skills = config.skills ?? {}
  config.skills.paths = orderSkillPaths(config.skills.paths ?? [], manifest.skillsDir, worktree)
}

export function orderSkillPaths(existingPaths: string[], dynamicSkillsDir: string, worktree: string): string[] {
  const paths = uniquePaths([...existingPaths, dynamicSkillsDir])
  const projectDirect = join(worktree, '.opencode', 'skills')
  const globalDirect = join(getOpencodeGlobalConfigDir(), 'skills')
  const directPaths = [globalDirect, projectDirect].filter((path) => existsSync(path) || hasPath(paths, path))
  const buckets = {
    unknown: [] as string[],
    globalDynamic: [] as string[],
    projectDynamic: [] as string[],
  }

  for (const path of paths) {
    if (isSamePath(path, globalDirect) || isSamePath(path, projectDirect)) {
      continue
    }

    if (isProjectPath(path, worktree)) {
      buckets.projectDynamic.push(path)
    } else if (isGlobalPath(path)) {
      buckets.globalDynamic.push(path)
    } else {
      buckets.unknown.push(path)
    }
  }

  return uniquePaths([
    ...buckets.unknown,
    ...buckets.globalDynamic,
    ...buckets.projectDynamic,
    ...directPaths,
  ])
}

function uniquePaths(paths: string[]): string[] {
  const result: string[] = []
  const seen = new Set<string>()

  for (const path of paths) {
    const key = normalizePath(path)
    if (!key || seen.has(key)) {
      continue
    }
    seen.add(key)
    result.push(path)
  }

  return result
}

function hasPath(paths: string[], target: string): boolean {
  return paths.some((path) => isSamePath(path, target))
}

function isSamePath(left: string, right: string): boolean {
  return normalizePath(left) === normalizePath(right)
}

function isProjectPath(path: string, worktree: string): boolean {
  const normalizedPath = normalizePath(path)
  const normalizedWorktree = normalizePath(worktree)
  return normalizedPath === normalizedWorktree || normalizedPath.startsWith(`${normalizedWorktree}/`)
}

function isGlobalPath(path: string): boolean {
  const normalizedPath = normalizePath(path)
  const normalizedHome = normalizePath(homedir())
  return normalizedPath === normalizedHome || normalizedPath.startsWith(`${normalizedHome}/`)
}

function normalizePath(path: string): string {
  return resolve(path).replace(/\\/g, '/').toLowerCase()
}
