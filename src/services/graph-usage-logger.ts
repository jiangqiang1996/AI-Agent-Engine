import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { docsAePath, DOCS_AE_SUBDIRS } from '../schemas/docs-ae-paths.js'
import { toPosixPath } from '../utils/path-utils.js'

/**
 * 图谱使用埋点：记录图谱工具的真实调用数据，供数据驱动决策（删/留/重构）使用。
 *
 * 设计原则：
 * - 异常静默，绝不阻断主流程
 * - 追加写入 JSONL，每行一条记录
 * - 记录调用次数、查询模式、freshness、结果大小、耗时
 * - 跨进程安全：使用 O_EXCL 锁文件 + stale 检测保证独占写入
 */

export interface GraphUsageRecord {
  timestamp: string
  tool: 'ae-graph-query' | 'ae-graph-build'
  mode?: string
  queryMode?: string
  scopeRoot?: string
  targetFile?: string
  freshnessStatus?: string
  resultStatus: 'success' | 'diagnostic' | 'error' | 'not_found'
  resultSize?: number
  elapsedMs?: number
  worktree: string
}

const MAX_LOG_SIZE_BYTES = 5 * 1024 * 1024
const LOCK_TIMEOUT_MS = 3000
const LOCK_RETRY_INTERVAL_MS = 50
const STALE_LOCK_MS = 30000

export function appendGraphUsageRecord(worktree: string, record: Omit<GraphUsageRecord, 'timestamp' | 'worktree'>): void {
  try {
    const graphDir = join(worktree, docsAePath(DOCS_AE_SUBDIRS.GRAPHS))
    if (!existsSync(graphDir)) {
      mkdirSync(graphDir, { recursive: true })
    }
    const logPath = join(graphDir, 'usage-log.jsonl')
    const fullRecord: GraphUsageRecord = {
      ...record,
      timestamp: new Date().toISOString(),
      worktree: toPosixPath(worktree),
    }
    const line = `${JSON.stringify(fullRecord)}\n`
    withFileLock(graphDir, () => {
      rotateLogIfNeeded(logPath)
      appendFileSync(logPath, line, 'utf8')
    })
  } catch {
    // 埋点失败绝不阻断主流程
  }
}

/**
 * 跨进程安全的文件锁。
 * 使用 O_EXCL 创建锁文件，获取失败时重试直到超时。
 * 检测 stale lock（超过 STALE_LOCK_MS 自动清理）。
 * 超时后放弃写入（不无锁写入，避免 JSONL 行交错损坏）。
 */
function withFileLock(graphDir: string, fn: () => void): void {
  const lockPath = join(graphDir, 'usage-log.lock')
  let lockFd: number | undefined
  const startTime = Date.now()

  while (lockFd === undefined && Date.now() - startTime < LOCK_TIMEOUT_MS) {
    try {
      lockFd = openSync(lockPath, 'wx')
    } catch {
      // 检查是否为 stale lock
      try {
        const stat = statSync(lockPath)
        if (Date.now() - stat.mtimeMs > STALE_LOCK_MS) {
          unlinkSync(lockPath)
          continue
        }
      } catch {
        // 锁文件可能已被其他进程清理，直接重试
        continue
      }
      // 用 Atomics.wait 替代自旋，避免 CPU 空转
      sleep(LOCK_RETRY_INTERVAL_MS)
    }
  }

  if (lockFd === undefined) {
    // 超时后放弃写入，不无锁写入（避免并发损坏）
    return
  }

  try {
    fn()
  } finally {
    try {
      closeSync(lockFd)
    } catch {
      // 忽略关闭错误
    }
    try {
      unlinkSync(lockPath)
    } catch {
      // 忽略删除错误
    }
  }
}

/**
 * 同步阻塞等待，不占用 CPU。
 * 使用 Atomics.wait 实现真正的线程阻塞（项目内 graph-fs-utils.ts 已有先例）。
 */
function sleep(ms: number): void {
  try {
    const sharedArray = new Int32Array(new SharedArrayBuffer(4))
    Atomics.wait(sharedArray, 0, 0, ms)
  } catch {
    // SharedArrayBuffer 不可用时降级为 setTimeout 同步等待
    // 注意：这是同步函数，无法用 await；fallback 用自旋但不占满 CPU
    const start = Date.now()
    while (Date.now() - start < ms) {
      // 空循环，但间隔极短（fallback 路径极少触发）
    }
  }
}

function rotateLogIfNeeded(logPath: string): void {
  try {
    const stat = statSync(logPath)
    if (stat.size > MAX_LOG_SIZE_BYTES) {
      const archived = `${logPath}.archived`
      if (existsSync(archived)) {
        unlinkSync(archived)
      }
      renameSync(logPath, archived)
    }
  } catch {
    // 日志轮转 renameSync 失败时截断文件避免无限增长
    try {
      writeFileSync(logPath, '', 'utf8')
    } catch {
      // 截断也失败则放弃
    }
  }
}

export function readGraphUsageLog(worktree: string): GraphUsageRecord[] {
  try {
    const logPath = join(worktree, docsAePath(DOCS_AE_SUBDIRS.GRAPHS), 'usage-log.jsonl')
    if (!existsSync(logPath)) {
      return []
    }
    const content = readFileSync(logPath, 'utf8')
    return content
      .split(/\r?\n/)
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0)
      .map((line: string) => {
        try {
          return JSON.parse(line) as GraphUsageRecord
        } catch {
          return null
        }
      })
      .filter((record): record is GraphUsageRecord => record !== null)
  } catch {
    return []
  }
}

export function summarizeGraphUsage(worktree: string): {
  totalCalls: number
  queryCalls: number
  buildCalls: number
  byMode: Record<string, number>
  byFreshness: Record<string, number>
  byResultStatus: Record<string, number>
  avgElapsedMs: number
  recentCalls: GraphUsageRecord[]
} {
  const records = readGraphUsageLog(worktree)
  const queryCalls = records.filter((r) => r.tool === 'ae-graph-query').length
  const buildCalls = records.filter((r) => r.tool === 'ae-graph-build').length
  const byMode: Record<string, number> = {}
  const byFreshness: Record<string, number> = {}
  const byResultStatus: Record<string, number> = {}
  let totalElapsed = 0
  let elapsedCount = 0
  for (const record of records) {
    const mode = record.queryMode ?? record.mode ?? 'unknown'
    byMode[mode] = (byMode[mode] ?? 0) + 1
    if (record.freshnessStatus) {
      byFreshness[record.freshnessStatus] = (byFreshness[record.freshnessStatus] ?? 0) + 1
    }
    byResultStatus[record.resultStatus] = (byResultStatus[record.resultStatus] ?? 0) + 1
    if (record.elapsedMs != null) {
      totalElapsed += record.elapsedMs
      elapsedCount += 1
    }
  }
  return {
    totalCalls: records.length,
    queryCalls,
    buildCalls,
    byMode,
    byFreshness,
    byResultStatus,
    avgElapsedMs: elapsedCount > 0 ? Math.round(totalElapsed / elapsedCount) : 0,
    recentCalls: records.slice(-20),
  }
}
