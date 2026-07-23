import { createHash } from 'node:crypto'

/**
 * 变更类型
 */
export type ChangeType = 'modify' | 'add' | 'remove'

/**
 * 全局文件变更子1
 */
export type GlobalChangeType = 'module-list' | 'cross-module-dependency' | 'global-non-functional' | 'other'

/**
 * 变更摘要条目
 */
export interface ChangeEntry {
  id: string
  date: string
  type: ChangeType
  targetId: string
  fromVersion?: string
  toVersion?: string
  changeSummary: string
  affectedDimensions: string[]
  affectedIds: string[]
  blastRadius: number
  reason?: string
}

/**
 * 文件内容哈希
 */
export function computeContentHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 16)
}

/**
 * 聚合哈希
 */
export function computeSourceHash(hashes: string[]): string {
  return createHash('sha256').update(hashes.join(''), 'utf8').digest('hex').slice(0, 16)
}

/**
 * 提取 Markdown 文件中的稳定 ID
 * 匹配 ### R1, ### EP-001, ### T-users, ### PAGE-001, ### ST-001, ### TC-001 等格式
 */
const ID_PATTERNS = [
  /^###\s+(R\d+)/gm,
  /^###\s+(SC\d+)/gm,
  /^###\s+(D\d+)/gm,
  /^###\s+(NFR\d+)/gm,
  /^###\s+(EP-\d+)/gm,
  /^###\s+(T-[\w-]+)/gm,
  /^###\s+(PAGE-\d+)/gm,
  /^###\s+(ST-\d+)/gm,
  /^###\s+(TC-\d+)/gm,
  /^###\s+(ADR-\d+)/gm,
]

export function extractIds(content: string): string[] {
  const ids: string[] = []
  for (const pattern of ID_PATTERNS) {
    let match: RegExpExecArray | null
    while ((match = pattern.exec(content)) !== null) {
      ids.push(match[1])
    }
  }
  return ids
}

/**
 * 提取模块依赖声明
 */
export function extractDependencies(frontmatter: Record<string, unknown>): {
  dependsOn: string[]
  dependedBy: string[]
} {
  const filterStrings = (arr: unknown): string[] =>
    Array.isArray(arr) ? (arr as unknown[]).filter((v): v is string => typeof v === 'string') : []

  return {
    dependsOn: filterStrings(frontmatter.dependsOn),
    dependedBy: filterStrings(frontmatter.dependedBy),
  }
}

/**
 * 计算 blast radius
 * Level 1: 模块内局部变更
 * Level 2: 模块内结构变更（影响索引）或跨模块依赖变更
 * Level 3: 跨模块变更（模块边界、全局非功能等）
 */
export function computeBlastRadius(
  changeType: ChangeType,
  oldIds: string[],
  newIds: string[],
  isGlobalFile: boolean,
  globalChangeType?: GlobalChangeType,
): number {
  if (isGlobalFile) {
    if (globalChangeType === 'cross-module-dependency') {
      return 2
    }
    return 3
  }
  if (changeType === 'add' || changeType === 'remove') {
    return 2
  }
  const idAdded = newIds.filter((id) => !oldIds.includes(id))
  const idRemoved = oldIds.filter((id) => !newIds.includes(id))
  if (idAdded.length > 0 || idRemoved.length > 0) {
    return 2
  }
  return 1
}

/**
 * 推断受影响的设计维度
 */
export function inferAffectedDimensions(targetId: string): string[] {
  const dimensions: string[] = []
  if (targetId.startsWith('R')) {
    dimensions.push('api', 'database', 'ui-ux', 'test-cases')
  } else if (targetId.startsWith('PAGE')) {
    dimensions.push('ui-ux', 'test-cases')
  } else if (targetId.startsWith('SC')) {
    dimensions.push('test-cases')
  } else if (targetId.startsWith('NFR')) {
    dimensions.push('non-functional', 'architecture')
  } else if (targetId.startsWith('D')) {
    dimensions.push('architecture', 'security')
  }
  return dimensions
}

/**
 * 使用 Multiset 计数对比计算行级增删
 */
function computeLineDiff(oldLines: string[], newLines: string[]): { added: string[]; removed: string[] } {
  const oldCounts = new Map<string, number>()
  const newCounts = new Map<string, number>()

  for (const line of oldLines) {
    if (line.trim().length > 0) {
      oldCounts.set(line, (oldCounts.get(line) ?? 0) + 1)
    }
  }
  for (const line of newLines) {
    if (line.trim().length > 0) {
      newCounts.set(line, (newCounts.get(line) ?? 0) + 1)
    }
  }

  const added: string[] = []
  const removed: string[] = []

  for (const [line, newCount] of newCounts) {
    const oldCount = oldCounts.get(line) ?? 0
    if (newCount > oldCount) {
      for (let i = 0; i < newCount - oldCount; i++) {
        added.push(line)
      }
    }
  }
  for (const [line, oldCount] of oldCounts) {
    const newCount = newCounts.get(line) ?? 0
    if (oldCount > newCount) {
      for (let i = 0; i < oldCount - newCount; i++) {
        removed.push(line)
      }
    }
  }

  return { added, removed }
}

/**
 * 生成变更摘要
 */
export function generateChangeSummary(
  oldContent: string,
  newContent: string,
  targetId: string,
): string {
  const oldLines = oldContent.split('\n')
  const newLines = newContent.split('\n')
  const { added, removed } = computeLineDiff(oldLines, newLines)

  if (added.length > 0 && removed.length > 0) {
    return `${targetId}: 修改了 ${removed.length} 行，新增 ${added.length} 行`
  } else if (added.length > 0) {
    return `${targetId}: 新增 ${added.length} 行`
  } else if (removed.length > 0) {
    return `${targetId}: 删除了 ${removed.length} 行`
  }
  return `${targetId}: 内容变更`
}

/**
 * 生成变更条目
 */
export function createChangeEntry(
  changeType: ChangeType,
  targetId: string,
  oldContent: string,
  newContent: string,
  oldIds: string[],
  newIds: string[],
  isGlobalFile: boolean,
  reason?: string,
  fromVersion?: string,
  toVersion?: string,
  globalChangeType?: GlobalChangeType,
): ChangeEntry {
  const blastRadius = computeBlastRadius(changeType, oldIds, newIds, isGlobalFile, globalChangeType)
  const affectedDimensions = inferAffectedDimensions(targetId)
  const changeSummary = generateChangeSummary(oldContent, newContent, targetId)

  return {
    id: `change-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: new Date().toISOString().slice(0, 10),
    type: changeType,
    targetId,
    fromVersion: changeType === 'modify' ? (fromVersion ?? `${targetId}.v1`) : undefined,
    toVersion: changeType === 'modify' ? (toVersion ?? targetId) : undefined,
    changeSummary,
    affectedDimensions,
    affectedIds: newIds,
    blastRadius,
    reason,
  }
}
