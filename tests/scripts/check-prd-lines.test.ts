import { describe, it, expect, afterAll, beforeEach } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'

const scriptPath = join(process.cwd(), 'src', 'assets', 'skills', 'ae-prd', 'scripts', 'check-prd-lines.mjs')
const tmpDir = mkdtempSync(join(tmpdir(), 'check-prd-lines-test-'))

function makeFile(name: string, content: string): void {
  writeFileSync(join(tmpDir, name), content, 'utf-8')
}

function makeLines(n: number): string {
  return Array.from({ length: n }, (_, i) => `line ${i}`).join('\n') + '\n'
}

/** 生成带 frontmatter 的独立主文件内容（type: prd, sharded: false） */
function makeStandalonePrdFile(lines: number, topic: string): string {
  const fm = `---\ntype: prd\nstatus: drafted\ndate: 2026-07-14\ntopic: ${topic}\nformat: human-readable-requirements\nsharded: false\n---\n`
  const fmLines = fm.split('\n').length - 1
  const bodyLines = Math.max(0, lines - fmLines)
  const body = bodyLines > 0 ? Array.from({ length: bodyLines }, (_, i) => `内容行 ${i}`).join('\n') + '\n' : ''
  return fm + body
}

/** 生成带 frontmatter 的分片索引主文件内容（type: prd, sharded: true） */
function makeShardedIndexFile(lines: number, topic: string): string {
  const fm = `---\ntype: prd\nstatus: drafted\ndate: 2026-07-14\ntopic: ${topic}\nformat: human-readable-requirements\nsharded: true\nshards:\n  - file: module-a.md\n    module: module-a\n  - file: module-b.md\n    module: module-b\n---\n`
  const fmLines = fm.split('\n').length - 1
  const bodyLines = Math.max(0, lines - fmLines)
  const body = bodyLines > 0 ? Array.from({ length: bodyLines }, (_, i) => `内容行 ${i}`).join('\n') + '\n' : ''
  return fm + body
}

/** 生成带 frontmatter 的分片子文件内容（type: prd-shard） */
function makePrdShardFile(lines: number, module: string): string {
  const fm = `---\ntype: prd-shard\nparent: prd.md\nmodule: ${module}\ndate: 2026-07-14\n---\n`
  const fmLines = fm.split('\n').length - 1
  const bodyLines = Math.max(0, lines - fmLines)
  const body = bodyLines > 0 ? Array.from({ length: bodyLines }, (_, i) => `内容行 ${i}`).join('\n') + '\n' : ''
  return fm + body
}

interface ScriptJsonResult {
  threshold: number
  prdDir: string
  totalChecked: number
  totalSkipped: number
  skippedShardedIndex: string[]
  skippedNoFrontmatter: string[]
  checkedFiles: { file: string; lines: number }[]
  violations: { file: string; lines: number }[]
  passed: boolean
}

function runScript(dir: string, extraArgs: string[] = []): string {
  const args = [dir, ...extraArgs]
  try {
    return execFileSync('node', [scriptPath, ...args], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string }
    return (err.stdout ?? '') + (err.stderr ?? '')
  }
}

function parseJson(output: string): ScriptJsonResult {
  const jsonStart = output.indexOf('---JSON---')
  expect(jsonStart).toBeGreaterThanOrEqual(0)
  const jsonStr = output.slice(jsonStart + '---JSON---'.length).trim()
  return JSON.parse(jsonStr) as ScriptJsonResult
}

describe('check-prd-lines 脚本', () => {
  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  beforeEach(() => {
    // 每个测试前清空目录，保证隔离
    rmSync(tmpDir, { recursive: true, force: true })
    mkdirSync(tmpDir, { recursive: true })
  })

  describe('frontmatter 判断文件类型', () => {
    it('type: prd, sharded: false 的独立主文件被校验', () => {
      makeFile('prd.md', makeStandalonePrdFile(50, 'test-topic'))
      const json = parseJson(runScript(tmpDir))
      const checked = json.checkedFiles.map((f) => f.file)
      expect(checked).toContain('prd.md')
      expect(json.violations).toHaveLength(0)
    })

    it('type: prd, sharded: true 的分片索引主文件被豁免', () => {
      makeFile('prd.md', makeShardedIndexFile(500, 'test-topic'))
      const json = parseJson(runScript(tmpDir))
      expect(json.skippedShardedIndex).toContain('prd.md')
      expect(json.checkedFiles.map((f) => f.file)).not.toContain('prd.md')
    })

    it('type: prd-shard 的分片子文件被校验', () => {
      makeFile('module-a.md', makePrdShardFile(50, 'module-a'))
      makeFile('module-b.md', makePrdShardFile(50, 'module-b'))
      const json = parseJson(runScript(tmpDir))
      const checked = json.checkedFiles.map((f) => f.file)
      expect(checked).toContain('module-a.md')
      expect(checked).toContain('module-b.md')
      expect(json.violations).toHaveLength(0)
    })

    it('无 frontmatter 的文件被跳过', () => {
      makeFile('README.md', makeLines(10))
      const json = parseJson(runScript(tmpDir))
      expect(json.skippedNoFrontmatter).toContain('README.md')
      expect(json.checkedFiles).toHaveLength(0)
    })

    it('type 非 prd/prd-shard 的文件被跳过', () => {
      const fm = `---\ntype: design\nstatus: drafted\n---\n`
      makeFile('design.md', fm + '设计内容\n')
      const json = parseJson(runScript(tmpDir))
      expect(json.skippedNoFrontmatter).toContain('design.md')
      expect(json.checkedFiles).toHaveLength(0)
    })
  })

  describe('countLines 尾换行处理', () => {
    it('文件以换行结尾时行数不偏移', () => {
      makeFile('prd.md', makeStandalonePrdFile(300, 'test-topic'))
      const json = parseJson(runScript(tmpDir))
      const prd = json.checkedFiles.find((f) => f.file === 'prd.md')
      expect(prd?.lines).toBe(300)
      expect(json.violations).toHaveLength(0)
    })
  })

  describe('--threshold 参数校验', () => {
    it('NaN 值回退默认值', () => {
      makeFile('prd.md', makeStandalonePrdFile(50, 'test-topic'))
      const out = runScript(tmpDir, ['--threshold', 'abc'])
      expect(out).toContain('警告')
      const json = parseJson(out)
      expect(json.threshold).toBe(300)
    })

    it('负数回退默认值', () => {
      makeFile('prd.md', makeStandalonePrdFile(50, 'test-topic'))
      const out = runScript(tmpDir, ['--threshold', '-5'])
      expect(out).toContain('警告')
      const json = parseJson(out)
      expect(json.threshold).toBe(300)
    })

    it('自定义有效阈值生效', () => {
      makeFile('prd.md', makeStandalonePrdFile(50, 'test-topic'))
      const json = parseJson(runScript(tmpDir, ['--threshold', '10']))
      expect(json.threshold).toBe(10)
      expect(json.violations.length).toBeGreaterThan(0)
    })
  })

  describe('分片索引主文件豁免', () => {
    it('sharded: true 的主文件即使超 300 行也不报违规', () => {
      makeFile('prd.md', makeShardedIndexFile(500, 'test-topic'))
      makeFile('module-a.md', makePrdShardFile(50, 'module-a'))
      const json = parseJson(runScript(tmpDir))
      expect(json.skippedShardedIndex).toContain('prd.md')
      expect(json.totalChecked).toBe(1)
      expect(json.passed).toBe(true)
    })
  })

  describe('空目录', () => {
    it('无 .md 文件时通过且检查数为 0', () => {
      const emptyDir = join(tmpDir, 'empty')
      mkdirSync(emptyDir, { recursive: true })
      const json = parseJson(runScript(emptyDir))
      expect(json.passed).toBe(true)
      expect(json.totalChecked).toBe(0)
    })
  })

  describe('退出码', () => {
    it('无违规时 passed=true', () => {
      makeFile('prd.md', makeStandalonePrdFile(50, 'test-topic'))
      const json = parseJson(runScript(tmpDir))
      expect(json.passed).toBe(true)
      expect(json.violations).toHaveLength(0)
    })

    it('独立主文件超标时 passed=false', () => {
      makeFile('prd.md', makeStandalonePrdFile(301, 'test-topic'))
      const json = parseJson(runScript(tmpDir))
      expect(json.passed).toBe(false)
      expect(json.violations.length).toBeGreaterThan(0)
    })

    it('分片子文件超标时 passed=false', () => {
      makeFile('module-a.md', makePrdShardFile(301, 'module-a'))
      const json = parseJson(runScript(tmpDir))
      expect(json.passed).toBe(false)
      expect(json.violations.length).toBeGreaterThan(0)
    })

    it('分片索引主文件超标但子文件正常时 passed=true', () => {
      makeFile('prd.md', makeShardedIndexFile(500, 'test-topic'))
      makeFile('module-a.md', makePrdShardFile(50, 'module-a'))
      makeFile('module-b.md', makePrdShardFile(50, 'module-b'))
      const json = parseJson(runScript(tmpDir))
      expect(json.passed).toBe(true)
      expect(json.violations).toHaveLength(0)
    })
  })

  describe('混合场景', () => {
    it('独立主文件 + 分片子文件共存时都被校验', () => {
      makeFile('prd.md', makeStandalonePrdFile(50, 'test-topic'))
      makeFile('module-a.md', makePrdShardFile(50, 'module-a'))
      const json = parseJson(runScript(tmpDir))
      expect(json.totalChecked).toBe(2)
      expect(json.passed).toBe(true)
    })

    it('分片索引 + 多个分片子文件混合，索引豁免子文件校验', () => {
      makeFile('prd.md', makeShardedIndexFile(500, 'test-topic'))
      makeFile('module-a.md', makePrdShardFile(100, 'module-a'))
      makeFile('module-b.md', makePrdShardFile(200, 'module-b'))
      const json = parseJson(runScript(tmpDir))
      expect(json.skippedShardedIndex).toContain('prd.md')
      expect(json.totalChecked).toBe(2)
      expect(json.passed).toBe(true)
    })
  })
})
