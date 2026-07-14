import { describe, it, expect, afterAll, beforeEach } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'

const scriptPath = join(process.cwd(), 'src', 'assets', 'skills', 'ae-design', 'scripts', 'merge-design-shards.mjs')
const tmpDir = mkdtempSync(join(tmpdir(), 'merge-design-shards-test-'))

function makeFile(name: string, content: string): void {
  writeFileSync(join(tmpDir, name), content, 'utf-8')
}

function makeLines(n: number): string {
  return Array.from({ length: n }, (_, i) => `line ${i}`).join('\n') + '\n'
}

/** 生成 sub_split: true 的引用清单文件 */
function makeRefListFile(dimName: string, subFiles: string[]): string {
  const fm = `---\nsection: "${dimName}"\nparent: "design.md"\nsub_split: true\n---\n`
  const body = `# ${dimName}\n\n> 本维度已按章节二级拆分：\n\n` + subFiles.map((sf) => `- [${sf}](${sf})`).join('\n') + '\n'
  return fm + body
}

/** 生成二级子文件（parent 指向维度文件名） */
function makeSubFile(sectionName: string, parentDim: string, bodyLines: number): string {
  const fm = `---\nsection: "${sectionName}"\nparent: "${parentDim}.md"\n---\n`
  const body = `### ${sectionName}\n` + Array.from({ length: bodyLines }, (_, i) => `内容行 ${i}`).join('\n') + '\n'
  return fm + body
}

interface MergeJsonResult {
  threshold: number
  designDir: string
  merged: { into: string; absorbed: string[]; linesAfter: number }[]
  skipped: { file: string; reason: string }[]
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

function parseJson(output: string): MergeJsonResult {
  const jsonStart = output.indexOf('---JSON---')
  expect(jsonStart).toBeGreaterThanOrEqual(0)
  const jsonStr = output.slice(jsonStart + '---JSON---'.length).trim()
  return JSON.parse(jsonStr) as MergeJsonResult
}

describe('merge-design-shards 脚本', () => {
  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  beforeEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    mkdirSync(tmpDir, { recursive: true })
  })

  describe('基础合并功能（扁平结构）', () => {
    it('合并后行数 ≤ threshold 时合并回父文件并删除子文件', () => {
      makeFile('api.md', makeRefListFile('api', ['api-endpoints.md', 'api-auth.md']))
      makeFile('api-endpoints.md', makeSubFile('endpoints', 'api', 20))
      makeFile('api-auth.md', makeSubFile('auth', 'api', 20))
      const json = parseJson(runScript(tmpDir))
      expect(json.merged).toHaveLength(1)
      expect(json.merged[0].into).toBe('api.md')
      expect(json.merged[0].absorbed).toContain('api-auth.md')
      expect(json.merged[0].absorbed).toContain('api-endpoints.md')
      expect(existsSync(join(tmpDir, 'api.md'))).toBe(true)
      expect(existsSync(join(tmpDir, 'api-endpoints.md'))).toBe(false)
      expect(existsSync(join(tmpDir, 'api-auth.md'))).toBe(false)
    })

    it('合并后行数 > threshold 时保持拆分', () => {
      makeFile('api.md', makeRefListFile('api', ['api-endpoints.md', 'api-auth.md']))
      makeFile('api-endpoints.md', makeSubFile('endpoints', 'api', 200))
      makeFile('api-auth.md', makeSubFile('auth', 'api', 200))
      const json = parseJson(runScript(tmpDir, ['--threshold', '100']))
      expect(json.skipped).toHaveLength(1)
      expect(json.merged).toHaveLength(0)
      expect(existsSync(join(tmpDir, 'api-endpoints.md'))).toBe(true)
      expect(existsSync(join(tmpDir, 'api-auth.md'))).toBe(true)
    })

    it('无 sub_split 维度时跳过', () => {
      const fm = `---\nsection: "database"\nparent: "design.md"\nsub_split: false\n---\n`
      makeFile('database.md', fm + makeLines(50))
      const json = parseJson(runScript(tmpDir))
      expect(json.merged).toHaveLength(0)
    })
  })

  describe('子目录结构支持', () => {
    it('子目录中的引用清单和子文件被正确收集和合并', () => {
      mkdirSync(join(tmpDir, 'api'), { recursive: true })
      writeFileSync(join(tmpDir, 'api', 'api.md'), makeRefListFile('api', ['api-endpoints.md', 'api-auth.md']))
      writeFileSync(join(tmpDir, 'api', 'api-endpoints.md'), makeSubFile('endpoints', 'api', 20))
      writeFileSync(join(tmpDir, 'api', 'api-auth.md'), makeSubFile('auth', 'api', 20))
      const json = parseJson(runScript(tmpDir))
      expect(json.merged).toHaveLength(1)
      expect(json.merged[0].into).toBe('api/api.md')
      expect(json.merged[0].absorbed).toContain('api/api-endpoints.md')
      expect(json.merged[0].absorbed).toContain('api/api-auth.md')
      expect(existsSync(join(tmpDir, 'api', 'api.md'))).toBe(true)
      expect(existsSync(join(tmpDir, 'api', 'api-endpoints.md'))).toBe(false)
      expect(existsSync(join(tmpDir, 'api', 'api-auth.md'))).toBe(false)
    })

    it('多个维度子目录同时合并', () => {
      mkdirSync(join(tmpDir, 'api'), { recursive: true })
      mkdirSync(join(tmpDir, 'database'), { recursive: true })
      writeFileSync(join(tmpDir, 'api', 'api.md'), makeRefListFile('api', ['api-endpoints.md']))
      writeFileSync(join(tmpDir, 'api', 'api-endpoints.md'), makeSubFile('endpoints', 'api', 20))
      writeFileSync(join(tmpDir, 'database', 'database.md'), makeRefListFile('database', ['database-tables.md']))
      writeFileSync(join(tmpDir, 'database', 'database-tables.md'), makeSubFile('tables', 'database', 20))
      const json = parseJson(runScript(tmpDir))
      expect(json.merged).toHaveLength(2)
      const intoFiles = json.merged.map((m) => m.into)
      expect(intoFiles).toContain('api/api.md')
      expect(intoFiles).toContain('database/database.md')
    })

    it('basename 匹配：子文件 parent 为文件名而非路径', () => {
      mkdirSync(join(tmpDir, 'api'), { recursive: true })
      writeFileSync(join(tmpDir, 'api', 'api.md'), makeRefListFile('api', ['api-endpoints.md']))
      writeFileSync(join(tmpDir, 'api', 'api-endpoints.md'), makeSubFile('endpoints', 'api', 20))
      const json = parseJson(runScript(tmpDir))
      expect(json.merged).toHaveLength(1)
      expect(json.merged[0].absorbed).toContain('api/api-endpoints.md')
    })

    it('子目录中合并后内容包含子文件正文', () => {
      mkdirSync(join(tmpDir, 'api'), { recursive: true })
      writeFileSync(join(tmpDir, 'api', 'api.md'), makeRefListFile('api', ['api-endpoints.md']))
      writeFileSync(join(tmpDir, 'api', 'api-endpoints.md'), makeSubFile('endpoints', 'api', 10))
      parseJson(runScript(tmpDir))
      const mergedContent = readFileSync(join(tmpDir, 'api', 'api.md'), 'utf-8')
      expect(mergedContent).toContain('sub_split: false')
      expect(mergedContent).toContain('### endpoints')
    })
  })

  describe('边界情况', () => {
    it('无 .md 文件时正常退出', () => {
      const json = parseJson(runScript(tmpDir))
      expect(json.merged).toHaveLength(0)
      expect(json.passed).toBe(true)
    })

    it('引用清单无子文件时跳过', () => {
      makeFile('api.md', makeRefListFile('api', []))
      const json = parseJson(runScript(tmpDir))
      expect(json.skipped).toHaveLength(1)
      expect(json.skipped[0].reason).toBe('no_sub_files')
    })
  })
})
