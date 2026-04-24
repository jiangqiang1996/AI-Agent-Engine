import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * AE 适配层工具：从文件系统加载技能/代理内容。
 * 不属于通用编排框架的核心 API，仅供工具层（ae-orchestrator.tool.ts）直接引用。
 */

const cache = new Map<string, string>()

export interface AssetResolverConfig {
  /** 技能文件查找目录列表，每项为包含 SKILL.md 子目录的父目录 */
  skillDirs: string[]
  /** 代理文件查找目录列表，每项为包含 <name>.md 的父目录 */
  agentDirs: string[]
}

export function loadSkillContent(skillSlug: string, config: AssetResolverConfig): string {
  const key = `skill:${skillSlug}`
  const cached = cache.get(key)
  if (cached !== undefined) return cached

  for (const baseDir of config.skillDirs) {
    const path = join(baseDir, skillSlug, 'SKILL.md')
    if (existsSync(path)) {
      const content = readFileSync(path, 'utf-8')
      cache.set(key, content)
      return content
    }
  }

  throw new Error(`技能文件未找到: ${skillSlug}（已查找: ${config.skillDirs.join(', ')}）`)
}

export function loadAgentContent(agentName: string, config: AssetResolverConfig): string {
  const key = `agent:${agentName}`
  const cached = cache.get(key)
  if (cached !== undefined) return cached

  for (const agentsRoot of config.agentDirs) {
    const found = findFileRecursive(agentsRoot, `${agentName}.md`)
    if (found) {
      const content = readFileSync(found, 'utf-8')
      cache.set(key, content)
      return content
    }
  }

  throw new Error(`代理文件未找到: ${agentName}（已查找: ${config.agentDirs.join(', ')}）`)
}

function findFileRecursive(dir: string, filename: string): string | null {
  if (!existsSync(dir)) return null
  try {
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry)
      const stat = statSync(fullPath)
      if (stat.isFile() && entry === filename) return fullPath
      if (stat.isDirectory()) {
        const found = findFileRecursive(fullPath, filename)
        if (found) return found
      }
    }
  } catch {
    // 忽略权限错误
  }
  return null
}

export function clearLoaderCache(): void {
  cache.clear()
}
