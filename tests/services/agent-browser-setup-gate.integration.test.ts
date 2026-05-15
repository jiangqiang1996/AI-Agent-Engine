import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const SCAN_ROOTS = [
  'src/assets/skills',
  'src/assets/agents',
  'src/assets/commands',
  'src/tools',
  'src/services',
  'docs/usage-guide.md',
]

const SETUP_PATH = 'src/assets/skills/ae-setup/SKILL.md'
const CANONICAL_RULE_PATH = 'src/assets/rules/setup-gate-rule.md'

const REQUIRED_SETUP_FILES = [
  'src/assets/rules/setup-gate-rule.md',
  'src/assets/skills/ae-test-browser/SKILL.md',
  'src/assets/skills/ae-test-browser/references/login-detection.md',
  'src/assets/skills/ae-frontend-design/SKILL.md',
  'src/assets/skills/ae-lfg/SKILL.md',
  'src/assets/skills/ae-lfg/references/pipeline.md',
  'src/assets/skills/ae-prompt-optimize/SKILL.md',
  'src/assets/agents/workflow/design-iterator.md',
  'src/assets/agents/workflow/figma-design-sync.md',
  'src/services/ae-catalog.ts',
  'docs/usage-guide.md',
]

const TRIGGER_PATTERNS = [
  'agent-browser',
  'snapshot -i',
  'screenshot',
  'open <url>',
  '浏览器验收',
  '截图证据',
  '登录检测',
  '可见页面状态确认',
  '使用 ae:test-browser',
  '@design-iterator',
  '@figma-design-sync',
]

const ANTI_PATTERNS = [
  'command -v agent-browser',
  'Get-Command agent-browser',
  'where agent-browser',
  'agent-browser 已安装，运行',
  'agent-browser 未安装，跳过',
  '未安装则提示用户运行 /ae-setup',
  '用户已安装',
  '已经安装即可继续',
  '已安装则直接运行 agent-browser',
]

const ANTI_PATTERN_REGEXES = [
  /如已安装\s*agent-browser.{0,20}(直接|即可|继续|跳过|无需\s*setup)/,
  /CLI\s*可用时.{0,20}(跳过|无需|直接).{0,10}setup/,
  /agent-browser\s*(已安装|可用).{0,20}(无需|跳过|直接|即可).{0,10}(setup|\/ae-setup)/,
  /(command\s*-v|Get-Command|where)\s*agent-browser/,
]

const COPYABLE_COMMAND_PATTERN =
  /agent-browser\s+(open|snapshot|screenshot|click|fill|type|press|wait|--headed|scrollintoview)/g

const SETUP_GATE_PATTERN = /ae:setup|\/ae-setup|setup 前置|SKILL\.SETUP/
const EXECUTION_BAN_PATTERN =
  /未.*setup.*不得执行|未通过 proof 校验前不得执行|执行任何 `agent-browser` 命令前/

const FILE_LEVEL_GATE_FILES = new Set([
  'src/assets/skills/ae-test-browser/SKILL.md',
  'src/assets/skills/ae-test-browser/references/login-detection.md',
  'src/assets/agents/workflow/design-iterator.md',
  'src/assets/agents/workflow/figma-design-sync.md',
])

function listFiles(target: string): string[] {
  const stat = readdirSync('.', { withFileTypes: true }).find((entry) => entry.name === target)

  if (target.endsWith('.md') || target.endsWith('.ts')) {
    return [target]
  }

  if (!stat && target.includes('/')) {
    const entries = readdirSync(target, { withFileTypes: true })
    return entries.flatMap((entry) => {
      const path = join(target, entry.name).replaceAll('\\', '/')
      if (entry.isDirectory()) {
        return listFiles(path)
      }
      return path.endsWith('.md') || path.endsWith('.ts') ? [path] : []
    })
  }

  return []
}

function scannedFiles(): string[] {
  return SCAN_ROOTS.flatMap((root) => listFiles(root))
}

function lineNumberAt(content: string, index: number): number {
  return content.slice(0, index).split('\n').length
}

function nearbyContent(lines: string[], lineNumber: number, radius: number): string {
  const start = Math.max(0, lineNumber - radius - 1)
  const end = Math.min(lines.length, lineNumber + radius)
  return lines.slice(start, end).join('\n')
}

describe('agent-browser setup 前置门禁', () => {
  it('应该让所有已知浏览器消费方包含 setup 前置语义', () => {
    for (const file of REQUIRED_SETUP_FILES) {
      const content = readFileSync(file, 'utf8')

      expect(content, file).toMatch(/ae:setup|\/ae-setup|setup 前置|先完成 ae:setup|SKILL\.SETUP/)
    }
  })

  it('非 ae:setup 文件不应该保留手写 agent-browser 安装检查反模式', () => {
    for (const file of scannedFiles()) {
      const content = readFileSync(file, 'utf8')
      if (file === SETUP_PATH) {
        continue
      }

      for (const pattern of ANTI_PATTERNS) {
        expect(content.includes(pattern), `${file} contains ${pattern}`).toBe(false)
      }

      for (const regex of ANTI_PATTERN_REGEXES) {
        expect(regex.test(content), `${file} matches ${regex.source}`).toBe(false)
      }
    }
  })

  it('包含可复制 agent-browser 命令的段落应该声明未完成 setup 前不得执行', () => {
    for (const file of scannedFiles()) {
      if (file === SETUP_PATH) {
        continue
      }

      const content = readFileSync(file, 'utf8')

      if (FILE_LEVEL_GATE_FILES.has(file)) {
        expect(content, file).toMatch(SETUP_GATE_PATTERN)
        expect(content, file).toMatch(EXECUTION_BAN_PATTERN)
        continue
      }

      const lines = content.split('\n')
      const matches = [...content.matchAll(COPYABLE_COMMAND_PATTERN)]

      for (const match of matches) {
        const lineNumber = lineNumberAt(content, match.index ?? 0)
        const nearby = nearbyContent(lines, lineNumber, 8)

        expect(nearby, `${file}:${lineNumber}`).toMatch(SETUP_GATE_PATTERN)
        expect(nearby, `${file}:${lineNumber}`).toMatch(EXECUTION_BAN_PATTERN)
      }
    }
  })

  it('公开使用指南的截图代理流程应该声明 setup 前置', () => {
    const content = readFileSync('docs/usage-guide.md', 'utf8')
    const rows = content.split('\n').filter((line) => line.startsWith('| `@'))

    for (const row of rows) {
      if (row.includes('@figma-design-sync') || row.includes('@design-iterator')) {
        expect(row).toContain('setup proof')
      }
    }
  })

  it('公开文档和引用链不应该把已安装或 CLI 可用作为 setup 替代证据', () => {
    for (const file of scannedFiles()) {
      const content = readFileSync(file, 'utf8')
      if (!TRIGGER_PATTERNS.some((pattern) => content.includes(pattern))) {
        continue
      }

      expect(content, file).not.toContain('agent-browser 可用')
      expect(content, file).not.toContain('用户声称已安装即可继续')
    }
  })

  it('ae:setup 技能应该包含完整的验证步骤', () => {
    const content = readFileSync(SETUP_PATH, 'utf8')
    
    expect(content).toContain('agent-browser --version')
    expect(content).toContain('agent-browser install --help')
    expect(content).toContain('验证安装状态')
    expect(content).toContain('备选方案')
  })

  it('canonical setup-gate-rule.md 应存在且覆盖所有场景类型', () => {
    const content = readFileSync(CANONICAL_RULE_PATH, 'utf8')

    expect(content).toContain('全局硬约束')
    expect(content).toContain('ae:setup 是唯一前置入口')
    expect(content).toContain('已有安装不能替代 proof')
    expect(content).toContain('setup 可跨会话复用')
    expect(content).toContain('未完成 proof 校验前禁止执行')
    expect(content).toContain('setup 失败时的降级路径')
    expect(content).toContain('bash')
    expect(content).toContain('子代理')
    expect(content).toContain('MCP')
    expect(content).toContain('prompt optimize')
    expect(content).toContain('未来新增')
    expect(content).toContain('新增消费方时的检查项')
  })
})
