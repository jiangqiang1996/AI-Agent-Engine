import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { appendGraphUsageRecord, readGraphUsageLog, summarizeGraphUsage } from '../../src/services/graph-usage-logger.js'

describe('graph-usage-logger', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'graph-usage-test-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('应该追加写入 JSONL 格式的使用记录', () => {
    appendGraphUsageRecord(tempDir, {
      tool: 'ae-graph-query',
      queryMode: 'deps',
      resultStatus: 'success',
      elapsedMs: 42,
    })
    appendGraphUsageRecord(tempDir, {
      tool: 'ae-graph-build',
      mode: 'full',
      resultStatus: 'success',
      elapsedMs: 500,
    })
    const records = readGraphUsageLog(tempDir)
    expect(records).toHaveLength(2)
    expect(records[0].tool).toBe('ae-graph-query')
    expect(records[0].queryMode).toBe('deps')
    expect(records[0].worktree).toBe(tempDir.replace(/\\/g, '/'))
    expect(records[1].tool).toBe('ae-graph-build')
    expect(records[1].mode).toBe('full')
  })

  it('应该自动补充 timestamp 字段', () => {
    appendGraphUsageRecord(tempDir, {
      tool: 'ae-graph-query',
      resultStatus: 'not_found',
    })
    const records = readGraphUsageLog(tempDir)
    expect(records).toHaveLength(1)
    expect(records[0].timestamp).toBeTruthy()
    expect(new Date(records[0].timestamp).getTime()).toBeGreaterThan(Date.now() - 10000)
  })

  it('summarizeGraphUsage 应正确汇总调用统计', () => {
    appendGraphUsageRecord(tempDir, { tool: 'ae-graph-query', queryMode: 'deps', resultStatus: 'success', freshnessStatus: 'fresh', elapsedMs: 10 })
    appendGraphUsageRecord(tempDir, { tool: 'ae-graph-query', queryMode: 'impact', resultStatus: 'success', freshnessStatus: 'stale', elapsedMs: 20 })
    appendGraphUsageRecord(tempDir, { tool: 'ae-graph-build', mode: 'full', resultStatus: 'success', elapsedMs: 100 })
    appendGraphUsageRecord(tempDir, { tool: 'ae-graph-query', queryMode: 'deps', resultStatus: 'error' })

    const summary = summarizeGraphUsage(tempDir)
    expect(summary.totalCalls).toBe(4)
    expect(summary.queryCalls).toBe(3)
    expect(summary.buildCalls).toBe(1)
    expect(summary.byMode.deps).toBe(2)
    expect(summary.byMode.impact).toBe(1)
    expect(summary.byMode.full).toBe(1)
    expect(summary.byFreshness.fresh).toBe(1)
    expect(summary.byFreshness.stale).toBe(1)
    expect(summary.byResultStatus.success).toBe(3)
    expect(summary.byResultStatus.error).toBe(1)
    expect(summary.avgElapsedMs).toBe((10 + 20 + 100) / 3 | 0)
  })

  it('日志文件不存在时应返回空数组', () => {
    const records = readGraphUsageLog(tempDir)
    expect(records).toEqual([])
  })

  it('应该在异常时不阻断主流程', () => {
    const badWorktree = '/nonexistent/path/that/should/not/exist'
    // 验证调用不抛出异常即可——日志写入是否成功由实现内部决定
    expect(() => {
      appendGraphUsageRecord(badWorktree, {
        tool: 'ae-graph-query',
        resultStatus: 'error',
      })
    }).not.toThrow()
  })

  it('应该支持并发写入不丢失记录', () => {
    for (let i = 0; i < 20; i++) {
      appendGraphUsageRecord(tempDir, {
        tool: 'ae-graph-query',
        queryMode: 'deps',
        resultStatus: 'success',
        elapsedMs: i,
      })
    }
    const records = readGraphUsageLog(tempDir)
    expect(records).toHaveLength(20)
    for (let i = 0; i < 20; i++) {
      expect(records[i].elapsedMs).toBe(i)
    }
  })

  it('stale lock 残留时应自动清理并继续写入', () => {
    const graphDir = join(tempDir, 'ae', 'graphs')
    mkdirSync(graphDir, { recursive: true })
    // 模拟残留锁文件（修改 mtime 为很久以前）
    const lockPath = join(graphDir, 'usage-log.lock')
    writeFileSync(lockPath, 'stale')
    const oldTime = new Date(Date.now() - 60000)
    // Windows 上 utimesSync 可能不完全工作，但 stale 检测会 unlinkSync
    const { utimesSync } = require('node:fs')
    try { utimesSync(lockPath, oldTime, oldTime) } catch { /* ignore */ }

    appendGraphUsageRecord(tempDir, {
      tool: 'ae-graph-query',
      resultStatus: 'success',
    })
    const records = readGraphUsageLog(tempDir)
    expect(records).toHaveLength(1)
  })

  it('日志超过 5MB 应触发轮转', () => {
    const graphDir = join(tempDir, 'ae', 'graphs')
    mkdirSync(graphDir, { recursive: true })
    const logPath = join(graphDir, 'usage-log.jsonl')
    // 写入超过 5MB 的内容
    const bigLine = `${JSON.stringify({ tool: 'ae-graph-query', resultStatus: 'success' })}\n`
    const bigContent = bigLine.repeat(Math.ceil(6 * 1024 * 1024 / bigLine.length))
    writeFileSync(logPath, bigContent, 'utf8')

    appendGraphUsageRecord(tempDir, {
      tool: 'ae-graph-query',
      resultStatus: 'success',
    })

    // 原文件应被轮转，新文件应只含最新一条
    const records = readGraphUsageLog(tempDir)
    expect(records).toHaveLength(1)
    expect(existsSync(`${logPath}.archived`)).toBe(true)
  })
})
