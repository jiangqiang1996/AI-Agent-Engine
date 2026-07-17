import { describe, expect, it } from 'vitest'

import { AGENT } from '../../src/schemas/ae-asset-schema.js'

type ScopeAnalyzeArgs = {
  files: string[]
  reviewMode: 'changes' | 'full'
  goals?: string
  contextHint?: string
  worktree?: string
}

async function callTool(args: ScopeAnalyzeArgs): Promise<Record<string, unknown>> {
  const { aeReviewScopeAnalyzeTool } = await import('../../src/tools/ae-review-scope-analyze.tool.js')
  const result = await aeReviewScopeAnalyzeTool.execute(
    args,
    {
      metadata: () => {},
      ask: async () => ({ confirmed: true }),
      abort: { signal: new AbortController().signal },
    } as unknown as Parameters<typeof aeReviewScopeAnalyzeTool.execute>[1],
  )
  return JSON.parse(result as string)
}

describe('ae-review-scope-analyze 工具', () => {
  describe('基础分类', () => {
    it('代码文件应激活 ocr-reviewer', async () => {
      const result = await callTool({
        files: ['src/app.ts', 'src/main.js'],
        reviewMode: 'changes',
      })
      const agents = result.agents as string[]
      expect(agents).toContain(AGENT.OCR_REVIEWER)
    })

    it('文档文件应激活 document-reviewer', async () => {
      const result = await callTool({
        files: ['README.md', 'docs/guide.txt'],
        reviewMode: 'changes',
      })
      const agents = result.agents as string[]
      expect(agents).toContain(AGENT.DOCUMENT_REVIEWER)
    })

    it('代码和文档混合应同时激活 ocr-reviewer 和 document-reviewer', async () => {
      const result = await callTool({
        files: ['src/app.ts', 'README.md'],
        reviewMode: 'changes',
      })
      const agents = result.agents as string[]
      expect(agents).toContain(AGENT.OCR_REVIEWER)
      expect(agents).toContain(AGENT.DOCUMENT_REVIEWER)
    })

    it('排除文件应出现在 excludedFiles 中', async () => {
      const result = await callTool({
        files: ['src/app.ts', 'photo.png', 'data.xlsx'],
        reviewMode: 'changes',
      })
      const excluded = result.excludedFiles as string[]
      expect(excluded).toContain('photo.png')
      expect(excluded).toContain('data.xlsx')
    })
  })

  describe('OCR 支持的文件格式', () => {
    it('.sql 文件应激活 ocr-reviewer', async () => {
      const result = await callTool({
        files: ['migrations/001.sql'],
        reviewMode: 'changes',
      })
      const agents = result.agents as string[]
      expect(agents).toContain(AGENT.OCR_REVIEWER)
    })

    it('.sh 脚本文件应激活 ocr-reviewer', async () => {
      const result = await callTool({
        files: ['scripts/deploy.sh'],
        reviewMode: 'changes',
      })
      const agents = result.agents as string[]
      expect(agents).toContain(AGENT.OCR_REVIEWER)
    })

    it('.tf Terraform 文件应激活 ocr-reviewer', async () => {
      const result = await callTool({
        files: ['infra/main.tf'],
        reviewMode: 'changes',
      })
      const agents = result.agents as string[]
      expect(agents).toContain(AGENT.OCR_REVIEWER)
    })

    it('Dockerfile 无扩展名应激活 ocr-reviewer', async () => {
      const result = await callTool({
        files: ['Dockerfile'],
        reviewMode: 'changes',
      })
      const agents = result.agents as string[]
      expect(agents).toContain(AGENT.OCR_REVIEWER)
    })

    it('Makefile 无扩展名应激活 ocr-reviewer', async () => {
      const result = await callTool({
        files: ['Makefile'],
        reviewMode: 'changes',
      })
      const agents = result.agents as string[]
      expect(agents).toContain(AGENT.OCR_REVIEWER)
    })

    it('.vue 文件应激活 ocr-reviewer', async () => {
      const result = await callTool({
        files: ['src/App.vue'],
        reviewMode: 'changes',
      })
      const agents = result.agents as string[]
      expect(agents).toContain(AGENT.OCR_REVIEWER)
    })

    it('.dart 文件应激活 ocr-reviewer', async () => {
      const result = await callTool({
        files: ['lib/main.dart'],
        reviewMode: 'changes',
      })
      const agents = result.agents as string[]
      expect(agents).toContain(AGENT.OCR_REVIEWER)
    })

    it('.css 文件应激活 ocr-reviewer', async () => {
      const result = await callTool({
        files: ['styles/main.css'],
        reviewMode: 'changes',
      })
      const agents = result.agents as string[]
      expect(agents).toContain(AGENT.OCR_REVIEWER)
    })
  })

  describe('兜底路由', () => {
    it('不匹配任何路由的文件应同时放入 codeFiles 和 docFiles（兜底）', async () => {
      const result = await callTool({
        files: ['unknown.xyz'],
        reviewMode: 'changes',
      })
      const stats = result.stats as Record<string, number>
      expect(stats.codeFiles).toBeGreaterThan(0)
      expect(stats.docFiles).toBeGreaterThan(0)
      const agents = result.agents as string[]
      expect(agents).toContain(AGENT.OCR_REVIEWER)
      expect(agents).toContain(AGENT.DOCUMENT_REVIEWER)
    })
  })

  describe('双重分类', () => {
    it('.json 文件应同时激活 ocr-reviewer 和 document-reviewer', async () => {
      const result = await callTool({
        files: ['config/settings.json'],
        reviewMode: 'changes',
      })
      const agents = result.agents as string[]
      expect(agents).toContain(AGENT.OCR_REVIEWER)
      expect(agents).toContain(AGENT.DOCUMENT_REVIEWER)
    })

    it('.yaml 文件应同时激活 ocr-reviewer 和 document-reviewer', async () => {
      const result = await callTool({
        files: ['docker-compose.yml'],
        reviewMode: 'changes',
      })
      const agents = result.agents as string[]
      expect(agents).toContain(AGENT.OCR_REVIEWER)
      expect(agents).toContain(AGENT.DOCUMENT_REVIEWER)
    })
  })

  describe('goal-alignment-reviewer 激活逻辑', () => {
    it('有显式 goals 时应激活 goal-alignment-reviewer', async () => {
      const result = await callTool({
        files: ['src/app.ts'],
        reviewMode: 'changes',
        goals: '验证功能正确性',
      })
      const agents = result.agents as string[]
      expect(agents).toContain(AGENT.GOAL_ALIGNMENT_REVIEWER)
    })

    it('无 goals + changes 模式应自动生成 goals 并激活 goal-alignment-reviewer', async () => {
      const result = await callTool({
        files: ['src/app.ts'],
        reviewMode: 'changes',
      })
      const agents = result.agents as string[]
      expect(agents).toContain(AGENT.GOAL_ALIGNMENT_REVIEWER)
      const goals = result.goals as string
      expect(goals.length).toBeGreaterThan(0)
    })

    it('无 goals + full 模式应自动生成 goals 并激活 goal-alignment-reviewer', async () => {
      const result = await callTool({
        files: ['src/app.ts'],
        reviewMode: 'full',
      })
      const agents = result.agents as string[]
      expect(agents).toContain(AGENT.GOAL_ALIGNMENT_REVIEWER)
      const goals = result.goals as string
      expect(goals.length).toBeGreaterThan(0)
    })

    it('无 goals + changes + contextHint 应将 contextHint 纳入自动生成的 goals', async () => {
      const result = await callTool({
        files: ['src/app.ts'],
        reviewMode: 'changes',
        contextHint: '会话变更审查',
      })
      const agents = result.agents as string[]
      expect(agents).toContain(AGENT.GOAL_ALIGNMENT_REVIEWER)
      const goals = result.goals as string
      expect(goals).toContain('会话变更审查')
    })

    it('无 goals + contextHint 应将 contextHint 纳入生成的 goals', async () => {
      const result = await callTool({
        files: ['src/app.ts', 'README.md'],
        reviewMode: 'changes',
        contextHint: '修复登录 bug',
      })
      const goals = result.goals as string
      expect(goals).toContain('修复登录 bug')
    })

    it('无 goals + 混合文件应生成代码与文档一致性验证目标', async () => {
      const result = await callTool({
        files: ['src/app.ts', 'README.md'],
        reviewMode: 'changes',
      })
      const goals = result.goals as string
      expect(goals).toContain('代码实现与文档描述的一致性')
    })

    it('无 goals + 测试文件应生成测试覆盖验证目标', async () => {
      const result = await callTool({
        files: ['src/app.ts', 'tests/app.test.ts'],
        reviewMode: 'changes',
      })
      const goals = result.goals as string
      expect(goals).toContain('测试覆盖')
    })

    it('无 goals + 无测试文件应生成遗漏测试覆盖验证目标', async () => {
      const result = await callTool({
        files: ['src/app.ts'],
        reviewMode: 'changes',
      })
      const goals = result.goals as string
      expect(goals).toContain('遗漏的测试覆盖')
    })

    it('无 goals + 设计文档应生成设计维度覆盖目标', async () => {
      const result = await callTool({
        files: ['ae/designs/feature-x/architecture.md', 'ae/designs/feature-x/api.md'],
        reviewMode: 'changes',
      })
      const goals = result.goals as string
      expect(goals).toContain('设计文档涉及')
      expect(goals).toContain('维度')
    })

    it('无 goals + 配置文件应生成配置验证目标', async () => {
      const result = await callTool({
        files: ['src/config.json', 'src/app.ts'],
        reviewMode: 'changes',
      })
      const goals = result.goals as string
      expect(goals).toContain('配置文件')
      expect(goals).toContain('向后兼容性')
    })

    it('无 goals + 多模块文件应生成模块影响分析目标', async () => {
      const result = await callTool({
        files: ['src/services/auth.ts', 'src/tools/review.ts'],
        reviewMode: 'changes',
      })
      const goals = result.goals as string
      expect(goals).toContain('受影响模块')
    })

    it('无 goals + full 模式应生成完整内容验证目标', async () => {
      const result = await callTool({
        files: ['src/app.ts'],
        reviewMode: 'full',
      })
      const goals = result.goals as string
      expect(goals).toContain('完整内容')
      expect(goals).toContain('架构一致性')
    })
  })

  describe('返回结构完整性', () => {
    it('应返回 agents、tasks、agentReasons、reviewFiles、excludedFiles、goals、extraPrompt、stats', async () => {
      const result = await callTool({
        files: ['src/app.ts', 'README.md'],
        reviewMode: 'changes',
        goals: '测试目标',
      })
      expect(result).toHaveProperty('agents')
      expect(result).toHaveProperty('tasks')
      expect(result).toHaveProperty('agentReasons')
      expect(result).toHaveProperty('reviewFiles')
      expect(result).toHaveProperty('excludedFiles')
      expect(result).toHaveProperty('goals')
      expect(result).toHaveProperty('extraPrompt')
      expect(result).toHaveProperty('stats')
    })

    it('tasks 中每个元素应包含 agent、prompt、files', async () => {
      const result = await callTool({
        files: ['src/app.ts'],
        reviewMode: 'changes',
      })
      const tasks = result.tasks as Array<Record<string, unknown>>
      expect(tasks.length).toBeGreaterThan(0)
      for (const task of tasks) {
        expect(task).toHaveProperty('agent')
        expect(task).toHaveProperty('prompt')
        expect(task).toHaveProperty('files')
        expect(typeof task.prompt).toBe('string')
        expect(Array.isArray(task.files)).toBe(true)
      }
    })

    it('stats 应包含 totalFiles、codeFiles、docFiles、excludedFiles、agentCount', async () => {
      const result = await callTool({
        files: ['src/app.ts', 'README.md', 'photo.png'],
        reviewMode: 'changes',
      })
      const stats = result.stats as Record<string, number>
      expect(stats).toHaveProperty('totalFiles')
      expect(stats).toHaveProperty('codeFiles')
      expect(stats).toHaveProperty('docFiles')
      expect(stats).toHaveProperty('excludedFiles')
      expect(stats).toHaveProperty('agentCount')
      expect(stats.totalFiles).toBe(3)
      expect(stats.excludedFiles).toBe(1)
    })

    it('agents 数量应等于 tasks 数量', async () => {
      const result = await callTool({
        files: ['src/app.ts', 'README.md'],
        reviewMode: 'changes',
        goals: '目标',
      })
      const agents = result.agents as string[]
      const tasks = result.tasks as unknown[]
      expect(agents.length).toBe(tasks.length)
    })
  })
})
