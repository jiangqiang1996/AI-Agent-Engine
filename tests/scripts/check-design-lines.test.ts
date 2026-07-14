import { describe, it, expect, afterAll, beforeEach } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'

const scriptPath = join(process.cwd(), 'src', 'assets', 'skills', 'ae-design', 'scripts', 'check-design-lines.mjs')
const tmpDir = mkdtempSync(join(tmpdir(), 'check-design-lines-test-'))

function makeFile(name: string, content: string): void {
  writeFileSync(join(tmpDir, name), content, 'utf-8')
}

function makeLines(n: number): string {
  return Array.from({ length: n }, (_, i) => `line ${i}`).join('\n') + '\n'
}

/** 生成带 frontmatter 的一级拆分文件内容（parent: design.md） */
function makeDimensionFile(lines: number, dimName: string): string {
  const fm = `---\ndesign_name: "test"\ndesign_version: "1.0"\nsection: "${dimName}"\nparent: "design.md"\nsub_split: false\nlast_updated: "2026-07-07"\n---\n`
  // fm 占 8 行，body 占 lines - 8 行
  const bodyLines = Math.max(0, lines - 8)
  const body = bodyLines > 0 ? Array.from({ length: bodyLines }, (_, i) => `内容行 ${i}`).join('\n') + '\n' : ''
  return fm + body
}

/** 生成带 frontmatter 的二级子文件内容（parent 指向非 design.md） */
function makeSectionFile(lines: number, sectionName: string, parentDim: string): string {
  const fm = `---\ndesign_name: "test"\ndesign_version: "1.0"\nsection: "${sectionName}"\nparent: "${parentDim}.md"\ndimension: "${parentDim}"\nlast_updated: "2026-07-07"\n---\n`
  // fm 占 9 行，body 占 lines - 9 行
  const bodyLines = Math.max(0, lines - 9)
  const body = bodyLines > 0 ? Array.from({ length: bodyLines }, (_, i) => `内容行 ${i}`).join('\n') + '\n' : ''
  return fm + body
}

interface ScriptJsonResult {
  threshold: number
  designDir: string
  totalChecked: number
  totalSkipped: number
  skippedDesign: string[]
  skippedSection: string[]
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

describe('check-design-lines 脚本', () => {
  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  beforeEach(() => {
    // 每个测试前清空目录，保证隔离
    rmSync(tmpDir, { recursive: true, force: true })
    mkdirSync(tmpDir, { recursive: true })
  })

  describe('frontmatter 判断文件类型', () => {
    it('parent 为 design.md 的一级文件被校验', () => {
      makeFile('architecture.md', makeDimensionFile(50, 'architecture'))
      makeFile('ui-ux.md', makeDimensionFile(50, 'ui-ux'))
      const json = parseJson(runScript(tmpDir))
      const checked = json.checkedFiles.map((f) => f.file)
      expect(checked).toContain('architecture.md')
      expect(checked).toContain('ui-ux.md')
      expect(json.violations).toHaveLength(0)
    })

    it('parent 指向非 design.md 的二级子文件被跳过', () => {
      makeFile('api-endpoints.md', makeSectionFile(301, 'api-endpoints', 'api'))
      makeFile('database-tables.md', makeSectionFile(301, 'database-tables', 'database'))
      const json = parseJson(runScript(tmpDir))
      expect(json.skippedSection).toContain('api-endpoints.md')
      expect(json.skippedSection).toContain('database-tables.md')
      expect(json.checkedFiles).toHaveLength(0)
    })

    it('无 frontmatter 的文件被跳过', () => {
      makeFile('README.md', makeLines(10))
      const json = parseJson(runScript(tmpDir))
      expect(json.skippedNoFrontmatter).toContain('README.md')
      expect(json.checkedFiles).toHaveLength(0)
    })

    it('引用清单（parent=design.md, sub_split=true）仍被校验', () => {
      const fm = `---\nsection: "api"\nparent: "design.md"\nsub_split: true\n---\n`
      makeFile('api.md', fm + '引用清单内容\n')
      const json = parseJson(runScript(tmpDir))
      expect(json.checkedFiles.map((f) => f.file)).toContain('api.md')
    })
  })

  describe('countLines 尾换行处理', () => {
    it('文件以换行结尾时行数不偏移', () => {
      makeFile('architecture.md', makeDimensionFile(300, 'architecture'))
      const json = parseJson(runScript(tmpDir))
      const arch = json.checkedFiles.find((f) => f.file === 'architecture.md')
      expect(arch?.lines).toBe(300)
      expect(json.violations).toHaveLength(0)
    })
  })

  describe('--threshold 参数校验', () => {
    it('NaN 值回退默认值', () => {
      makeFile('architecture.md', makeDimensionFile(50, 'architecture'))
      const out = runScript(tmpDir, ['--threshold', 'abc'])
      expect(out).toContain('警告')
      const json = parseJson(out)
      expect(json.threshold).toBe(300)
    })

    it('负数回退默认值', () => {
      makeFile('architecture.md', makeDimensionFile(50, 'architecture'))
      const out = runScript(tmpDir, ['--threshold', '-5'])
      expect(out).toContain('警告')
      const json = parseJson(out)
      expect(json.threshold).toBe(300)
    })

    it('自定义有效阈值生效', () => {
      makeFile('architecture.md', makeDimensionFile(50, 'architecture'))
      const json = parseJson(runScript(tmpDir, ['--threshold', '10']))
      expect(json.threshold).toBe(10)
      expect(json.violations.length).toBeGreaterThan(0)
    })
  })

  describe('design.md 豁免', () => {
    it('design.md 被跳过校验', () => {
      writeFileSync(join(tmpDir, 'design.md'), makeLines(500))
      const json = parseJson(runScript(tmpDir))
      expect(json.skippedDesign).toContain('design.md')
      expect(json.checkedFiles.map((f) => f.file)).not.toContain('design.md')
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

  describe('子目录递归收集', () => {
    it('子目录中的一级维度文件被正确收集和校验', () => {
      mkdirSync(join(tmpDir, 'api'), { recursive: true })
      mkdirSync(join(tmpDir, 'architecture'), { recursive: true })
      writeFileSync(join(tmpDir, 'api', 'api.md'), makeDimensionFile(50, 'api'))
      writeFileSync(join(tmpDir, 'architecture', 'architecture.md'), makeDimensionFile(50, 'architecture'))
      const json = parseJson(runScript(tmpDir))
      const checked = json.checkedFiles.map((f) => f.file)
      expect(checked).toContain('api/api.md')
      expect(checked).toContain('architecture/architecture.md')
      expect(json.violations).toHaveLength(0)
    })

    it('子目录中的二级子文件被正确跳过', () => {
      mkdirSync(join(tmpDir, 'api'), { recursive: true })
      writeFileSync(join(tmpDir, 'api', 'api.md'), makeDimensionFile(50, 'api'))
      writeFileSync(join(tmpDir, 'api', 'api-endpoints.md'), makeSectionFile(301, 'api-endpoints', 'api'))
      writeFileSync(join(tmpDir, 'api', 'api-auth.md'), makeSectionFile(301, 'api-auth', 'api'))
      const json = parseJson(runScript(tmpDir))
      expect(json.checkedFiles.map((f) => f.file)).toContain('api/api.md')
      expect(json.skippedSection).toContain('api/api-endpoints.md')
      expect(json.skippedSection).toContain('api/api-auth.md')
    })

    it('design.md 在根目录而维度文件在子目录时正常工作', () => {
      writeFileSync(join(tmpDir, 'design.md'), makeLines(500))
      mkdirSync(join(tmpDir, 'api'), { recursive: true })
      mkdirSync(join(tmpDir, 'database'), { recursive: true })
      writeFileSync(join(tmpDir, 'api', 'api.md'), makeDimensionFile(50, 'api'))
      writeFileSync(join(tmpDir, 'database', 'database.md'), makeDimensionFile(50, 'database'))
      const json = parseJson(runScript(tmpDir))
      expect(json.skippedDesign).toContain('design.md')
      const checked = json.checkedFiles.map((f) => f.file)
      expect(checked).toContain('api/api.md')
      expect(checked).toContain('database/database.md')
    })

    it('空子目录不影响收集', () => {
      mkdirSync(join(tmpDir, 'empty-dim'), { recursive: true })
      makeFile('architecture.md', makeDimensionFile(50, 'architecture'))
      const json = parseJson(runScript(tmpDir))
      expect(json.checkedFiles.map((f) => f.file)).toContain('architecture.md')
      expect(json.passed).toBe(true)
    })

    it('子目录中无 frontmatter 的文件被跳过', () => {
      mkdirSync(join(tmpDir, 'api'), { recursive: true })
      writeFileSync(join(tmpDir, 'api', 'README.md'), makeLines(10))
      const json = parseJson(runScript(tmpDir))
      expect(json.skippedNoFrontmatter).toContain('api/README.md')
      expect(json.checkedFiles).toHaveLength(0)
    })
  })

  describe('退出码', () => {
    it('无违规时 passed=true', () => {
      makeFile('architecture.md', makeDimensionFile(50, 'architecture'))
      const json = parseJson(runScript(tmpDir))
      expect(json.passed).toBe(true)
      expect(json.violations).toHaveLength(0)
    })

    it('有违规时 passed=false', () => {
      makeFile('api.md', makeDimensionFile(301, 'api'))
      const json = parseJson(runScript(tmpDir))
      expect(json.passed).toBe(false)
      expect(json.violations.length).toBeGreaterThan(0)
    })
  })
})
