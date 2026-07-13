import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { extractDoc } from '../../src/services/doc-extract-service.js'

const tempRoots: string[] = []

function createTempRoot(): string {
  const root = join(tmpdir(), `ae-doc-extract-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  tempRoots.push(root)
  mkdirSync(root, { recursive: true })
  return root
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('doc-extract-service', () => {
  it('应该从分片主文件按模块读取子文件并保留全局上下文', () => {
    const root = createTempRoot()
    mkdirSync(join(root, 'ae', 'designs', 'shards'), { recursive: true })
    writeFileSync(join(root, 'ae', 'designs', 'main.md'), [
      '---',
      'type: design',
      'status: drafted',
      'date: 2026-05-22',
      'title: sharded-design',
      'sharded: true',
      'shards:',
      '  - file: ae/designs/shards/auth.md',
      '    module: auth',
      '    requirements: [R1]',
      '    implementationUnits: [U1]',
      '  - file: ae/designs/shards/billing.md',
      '    module: billing',
      '    requirements: [R2]',
      '    implementationUnits: [U2]',
      '---',
      '# 分片设计',
      '## 范围',
      '全局范围和跨模块关系。',
    ].join('\n'), 'utf8')
    writeFileSync(join(root, 'ae', 'designs', 'shards', 'auth.md'), [
      '---',
      'type: design-shard',
      'status: drafted',
      'parent: ae/designs/main.md',
      'module: auth',
      '---',
      '# auth',
      '## 实现单元',
      '- U1. 处理 R1。',
    ].join('\n'), 'utf8')
    writeFileSync(join(root, 'ae', 'designs', 'shards', 'billing.md'), [
      '---',
      'type: design-shard',
      'status: drafted',
      'parent: ae/designs/main.md',
      'module: billing',
      '---',
      '# billing',
      '## 实现单元',
      '- U2. 处理 R2。',
    ].join('\n'), 'utf8')

    const result = extractDoc({ repoRoot: root, path: 'ae/designs/main.md', modules: ['auth'] })

    expect(result.metadata.source).toBe('ae/designs/main.md')
    expect(result.scope.map((section) => section.source)).toContain('ae/designs/main.md')
    expect(result.implementationUnits).toHaveLength(1)
    expect(result.implementationUnits[0]).toMatchObject({ id: 'U1', module: 'auth', source: 'ae/designs/shards/auth.md' })
    expect(result.implementationUnits[0]?.content).toContain('R1')
    expect(result.diagnostics).toEqual([])
  })

  it('应该报告缺失分片并继续返回可读取内容', () => {
    const root = createTempRoot()
    mkdirSync(join(root, 'ae', 'prds'), { recursive: true })
    writeFileSync(join(root, 'ae', 'prds', 'main.md'), [
      '---',
      'type: prd',
      'status: drafted',
      'date: 2026-05-22',
      'topic: sharded-requirements',
      'sharded: true',
      'shards:',
      '  - file: ae/prds/missing.md',
      '    module: auth',
      '    requirements: [R1]',
      '---',
      '# 需求',
      '## 问题框架',
      '全局背景。',
    ].join('\n'), 'utf8')

    const result = extractDoc({ repoRoot: root, path: 'ae/prds/main.md', modules: ['auth'] })

    expect(result.goals).toEqual([])
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain('missing-shard')
  })

  it('按 ID 筛选分片时索引部分命中应该降级读取全部分片', () => {
    const root = createTempRoot()
    mkdirSync(join(root, 'ae', 'designs', 'shards'), { recursive: true })
    writeFileSync(join(root, 'ae', 'designs', 'main.md'), [
      '---',
      'type: design',
      'status: drafted',
      'date: 2026-05-22',
      'title: sharded-design',
      'sharded: true',
      'shards:',
      '  - file: ae/designs/shards/stale-index.md',
      '    module: stale',
      '    requirements: [R2]',
      '  - file: ae/designs/shards/actual.md',
      '    module: actual',
      '---',
      '# 设计',
    ].join('\n'), 'utf8')
    writeFileSync(join(root, 'ae', 'designs', 'shards', 'stale-index.md'), [
      '---',
      'type: design-shard',
      'status: drafted',
      'parent: ae/designs/main.md',
      'module: stale',
      '---',
      '# stale',
      '## 功能需求',
      '- R1. 旧索引分片。',
    ].join('\n'), 'utf8')
    writeFileSync(join(root, 'ae', 'designs', 'shards', 'actual.md'), [
      '---',
      'type: design-shard',
      'status: drafted',
      'parent: ae/designs/main.md',
      'module: actual',
      '---',
      '# actual',
      '## 功能需求',
      '- R2. 实际需求。',
    ].join('\n'), 'utf8')

    const result = extractDoc({ repoRoot: root, path: 'ae/designs/main.md', ids: ['R2'] })

    expect(result.requirements).toHaveLength(1)
    expect(result.requirements[0]).toMatchObject({ id: 'R2', source: 'ae/designs/shards/actual.md' })
    expect(result.diagnostics).toContainEqual({
      code: 'shard-index-id-coverage',
      message: '分片索引只命中部分分片，已降级读取全部分片以确认 ID 覆盖',
      path: 'ae/designs/main.md',
    })
  })

  it('直接输入缺少 parent 的分片子文件时应该报告诊断', () => {
    const root = createTempRoot()
    mkdirSync(join(root, 'ae', 'designs', 'shards'), { recursive: true })
    writeFileSync(join(root, 'ae', 'designs', 'shards', 'auth.md'), [
      '---',
      'type: design-shard',
      'status: drafted',
      'module: auth',
      '---',
      '# auth',
      '## 实现单元',
      '- U1. 认证实现。',
    ].join('\n'), 'utf8')

    const result = extractDoc({ repoRoot: root, path: 'ae/designs/shards/auth.md' })

    expect(result.diagnostics).toContainEqual({
      code: 'missing-parent',
      message: '分片文件缺少 parent 字段',
      path: 'ae/designs/shards/auth.md',
    })
  })

  it('应该按大写 U 标题提取计划实现单元', () => {
    const root = createTempRoot()
    mkdirSync(join(root, 'ae', 'designs'), { recursive: true })
    writeFileSync(join(root, 'ae', 'designs', 'main.md'), [
      '---',
      'type: design',
      'status: drafted',
      'date: 2026-05-22',
      'title: design',
      '---',
      '# 设计',
      '## 实现单元',
      '### U1. 建立提取工具',
      '覆盖 R1。',
      '### U2. 更新文档',
      '覆盖 R2。',
    ].join('\n'), 'utf8')

    const result = extractDoc({ repoRoot: root, path: 'ae/designs/main.md', ids: ['U1'] })

    expect(result.implementationUnits).toHaveLength(1)
    expect(result.implementationUnits[0]).toMatchObject({ id: 'U1', title: 'U1. 建立提取工具' })
  })

  it('应该按稳定 ID 精确提取同一章节中的列表项', () => {
    const root = createTempRoot()
    mkdirSync(join(root, 'ae', 'prds'), { recursive: true })
    writeFileSync(join(root, 'ae', 'prds', 'main.md'), [
      '---',
      'type: prd',
      'status: drafted',
      'date: 2026-05-22',
      'topic: requirements',
      '---',
      '# 需求',
      '## 功能需求',
      '- R1. 登录能力。',
      '  - R1-AC1. 验证用户名。',
      '- R2. 支付能力。',
      '  - R2-AC1. 验证金额。',
      '- R3. 报表能力。',
    ].join('\n'), 'utf8')

    const result = extractDoc({ repoRoot: root, path: 'ae/prds/main.md', ids: ['R2'] })

    expect(result.requirements).toHaveLength(1)
    expect(result.requirements[0]).toMatchObject({ id: 'R2', title: '功能需求' })
    expect(result.requirements[0]?.content).toContain('R2. 支付能力')
    expect(result.requirements[0]?.content).toContain('R2-AC1. 验证金额')
    expect(result.requirements[0]?.content).not.toContain('R1. 登录能力')
    expect(result.requirements[0]?.content).not.toContain('R3. 报表能力')
  })

  it('应该报告跨分片重复稳定 ID', () => {
    const root = createTempRoot()
    mkdirSync(join(root, 'ae', 'designs', 'shards'), { recursive: true })
    writeFileSync(join(root, 'ae', 'designs', 'main.md'), [
      '---',
      'type: design',
      'status: drafted',
      'date: 2026-05-22',
      'title: sharded-design',
      'sharded: true',
      'shards:',
      '  - file: ae/designs/shards/auth.md',
      '    module: auth',
      '    requirements: [R2]',
      '  - file: ae/designs/shards/billing.md',
      '    module: billing',
      '    requirements: [R2]',
      '---',
      '# 设计',
    ].join('\n'), 'utf8')
    writeFileSync(join(root, 'ae', 'designs', 'shards', 'auth.md'), [
      '---',
      'type: design-shard',
      'status: drafted',
      'parent: ae/designs/main.md',
      'module: auth',
      '---',
      '# auth',
      '## 功能需求',
      '- R2. auth 需求。',
    ].join('\n'), 'utf8')
    writeFileSync(join(root, 'ae', 'designs', 'shards', 'billing.md'), [
      '---',
      'type: design-shard',
      'status: drafted',
      'parent: ae/designs/main.md',
      'module: billing',
      '---',
      '# billing',
      '## 功能需求',
      '- R2. billing 需求。',
    ].join('\n'), 'utf8')

    const result = extractDoc({ repoRoot: root, path: 'ae/designs/main.md', ids: ['R2'] })

    expect(result.requirements).toHaveLength(2)
    expect(result.diagnostics).toContainEqual({
      code: 'duplicate-id',
      message: '稳定 ID 重复：R2 出现在 ae/designs/shards/auth.md, ae/designs/shards/billing.md',
    })
  })

  it('应该报告同一文档内重复稳定 ID', () => {
    const root = createTempRoot()
    mkdirSync(join(root, 'ae', 'prds'), { recursive: true })
    writeFileSync(join(root, 'ae', 'prds', 'main.md'), [
      '---',
      'type: prd',
      'status: drafted',
      'date: 2026-05-22',
      'topic: requirements',
      '---',
      '# 需求',
      '## 功能需求',
      '- R2. 支付能力。',
      '- R2. 重复支付能力。',
    ].join('\n'), 'utf8')

    const result = extractDoc({ repoRoot: root, path: 'ae/prds/main.md', ids: ['R2'] })

    expect(result.diagnostics).toContainEqual({
      code: 'duplicate-id',
      message: '稳定 ID 重复：R2 出现在 ae/prds/main.md',
    })
  })

  it('不应该把追溯引用误报为重复稳定 ID', () => {
    const root = createTempRoot()
    mkdirSync(join(root, 'ae', 'designs'), { recursive: true })
    writeFileSync(join(root, 'ae', 'designs', 'main.md'), [
      '---',
      'type: design',
      'status: drafted',
      'date: 2026-05-22',
      'title: design',
      '---',
      '# 设计',
      '## 功能需求',
      '- R2. 支付能力。',
      '## 实现单元',
      '- U1. 实现支付流程，覆盖 R2。',
      '## 追溯矩阵',
      '| 需求 | 实现 |',
      '| R2 | U1 |',
    ].join('\n'), 'utf8')

    const result = extractDoc({ repoRoot: root, path: 'ae/designs/main.md' })

    expect(result.diagnostics.filter((diagnostic) => diagnostic.code === 'duplicate-id')).toEqual([])
  })

  it('按实现单元 ID 提取时应该保留包含需求追溯的续行', () => {
    const root = createTempRoot()
    mkdirSync(join(root, 'ae', 'designs'), { recursive: true })
    writeFileSync(join(root, 'ae', 'designs', 'main.md'), [
      '---',
      'type: design',
      'status: drafted',
      'date: 2026-05-22',
      'title: design',
      '---',
      '# 设计',
      '## 实现单元',
      '- U1. 实现登录流程。',
      '  覆盖 R1。',
      '  验证命令：npm test。',
      '- U2. 实现报表流程。',
    ].join('\n'), 'utf8')

    const result = extractDoc({ repoRoot: root, path: 'ae/designs/main.md', ids: ['U1'] })

    expect(result.implementationUnits).toHaveLength(1)
    expect(result.implementationUnits[0]?.content).toContain('覆盖 R1')
    expect(result.implementationUnits[0]?.content).toContain('验证命令：npm test')
    expect(result.implementationUnits[0]?.content).not.toContain('U2. 实现报表流程')
  })

  it('应该拒绝主文档路径越过仓库边界', () => {
    const root = createTempRoot()

    expect(() => extractDoc({ repoRoot: root, path: '../outside.md' })).toThrow('路径必须位于当前工作区内')
  })

  it('应该把越界分片路径报告为 missing-shard', () => {
    const root = createTempRoot()
    mkdirSync(join(root, 'ae', 'designs'), { recursive: true })
    writeFileSync(join(root, 'ae', 'designs', 'main.md'), [
      '---',
      'type: design',
      'status: drafted',
      'date: 2026-05-22',
      'title: sharded-design',
      'sharded: true',
      'shards:',
      '  - file: ../outside.md',
      '    module: auth',
      '---',
      '# 设计',
    ].join('\n'), 'utf8')

    const result = extractDoc({ repoRoot: root, path: 'ae/designs/main.md' })

    expect(result.diagnostics).toContainEqual({
      code: 'missing-shard',
      message: '路径必须位于当前工作区内：../outside.md',
      path: '../outside.md',
    })
  })

  it('模块筛选且不包含全局上下文时不应该返回主文件章节', () => {
    const root = createTempRoot()
    mkdirSync(join(root, 'ae', 'designs', 'shards'), { recursive: true })
    writeFileSync(join(root, 'ae', 'designs', 'main.md'), [
      '---',
      'type: design',
      'status: drafted',
      'date: 2026-05-22',
      'title: sharded-design',
      'sharded: true',
      'shards:',
      '  - file: ae/designs/shards/auth.md',
      '    module: auth',
      '    implementationUnits: [U1]',
      '---',
      '# 分片设计',
      '## 范围',
      '全局范围。',
    ].join('\n'), 'utf8')
    writeFileSync(join(root, 'ae', 'designs', 'shards', 'auth.md'), [
      '---',
      'type: design-shard',
      'status: drafted',
      'parent: ae/designs/main.md',
      'module: auth',
      '---',
      '# auth',
      '## 实现单元',
      '### U1. 认证实现',
      '处理 R1。',
    ].join('\n'), 'utf8')

    const result = extractDoc({
      repoRoot: root,
      path: 'ae/designs/main.md',
      modules: ['auth'],
      includeGlobalContext: false,
    })

    expect(result.scope).toEqual([])
    expect(result.implementationUnits.every((unit) => unit.source === 'ae/designs/shards/auth.md')).toBe(true)
  })

  it('应该报告分片索引和 parent 诊断', () => {
    const root = createTempRoot()
    mkdirSync(join(root, 'ae', 'designs', 'shards'), { recursive: true })
    writeFileSync(join(root, 'ae', 'designs', 'missing-index.md'), [
      '---',
      'type: design',
      'status: drafted',
      'date: 2026-05-22',
      'title: missing-index',
      'sharded: true',
      '---',
      '# 设计',
    ].join('\n'), 'utf8')

    expect(extractDoc({ repoRoot: root, path: 'ae/designs/missing-index.md' }).diagnostics).toEqual([
      { code: 'missing-shards-index', message: '分片主文件缺少 shards 索引', path: 'ae/designs/missing-index.md' },
    ])

    writeFileSync(join(root, 'ae', 'designs', 'main.md'), [
      '---',
      'type: design',
      'status: drafted',
      'date: 2026-05-22',
      'title: sharded-design',
      'sharded: true',
      'shards:',
      '  - module: broken',
      '  - file: ae/designs/shards/wrong-parent.md',
      '    module: wrong',
      '    implementationUnits: [U1]',
      '  - file: ae/designs/shards/missing-parent.md',
      '    module: missing',
      '    implementationUnits: [U2]',
      '---',
      '# 设计',
    ].join('\n'), 'utf8')
    writeFileSync(join(root, 'ae', 'designs', 'shards', 'wrong-parent.md'), [
      '---',
      'type: design-shard',
      'status: drafted',
      'parent: ae/designs/other.md',
      'module: wrong',
      '---',
      '# wrong',
    ].join('\n'), 'utf8')
    writeFileSync(join(root, 'ae', 'designs', 'shards', 'missing-parent.md'), [
      '---',
      'type: design-shard',
      'status: drafted',
      'module: missing',
      '---',
      '# missing',
    ].join('\n'), 'utf8')

    const result = extractDoc({ repoRoot: root, path: 'ae/designs/main.md', modules: ['none'] })

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'shard-index-filter-miss',
      'invalid-shard-entry',
      'parent-mismatch',
      'missing-parent',
    ])
  })
})
