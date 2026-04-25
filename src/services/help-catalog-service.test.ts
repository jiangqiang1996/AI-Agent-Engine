import { describe, it, expect, vi, beforeEach } from 'vitest'

// mock ae-catalog —— 提供技能/代理/命令定义
vi.mock('./ae-catalog.js', () => ({
  getPhaseOneEntries: vi.fn(),
  getPhaseOnePoEntries: vi.fn(),
  getPhaseOnePaEntries: vi.fn(),
  getAllAgentDefinitions: vi.fn(),
}))

// mock command-registration
vi.mock('./command-registration.js', () => ({
  buildCommandConfig: vi.fn(),
}))

// mock agent-registration
vi.mock('./agent-registration.js', () => ({
  buildAgentConfig: vi.fn(),
}))

// mock runtime-asset-manifest
vi.mock('./runtime-asset-manifest.js', () => ({
  createRuntimeAssetManifestFromRoot: () => ({
    repoRoot: '/repo',
    skillsDir: '/repo/src/assets/skills',
    agentsDir: '/repo/src/assets/agents',
    commandsDir: '/repo/src/assets/commands',
  }),
}))

import * as aeCatalog from './ae-catalog.js'
import * as commandRegistration from './command-registration.js'
import * as agentRegistration from './agent-registration.js'

import {
  buildHelpCatalog,
  filterCatalog,
  formatHelpCatalog,
  generateHelpText,
  skillToCommand,
  matchesQuery,
} from './help-catalog-service.js'

describe('help-catalog-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('matchesQuery', () => {
    it('应该对包含关键词的文本返回 true', () => {
      expect(matchesQuery('ae:brainstorm', 'brain')).toBe(true)
    })

    it('应该对不包含关键词的文本返回 false', () => {
      expect(matchesQuery('ae:brainstorm', 'plan')).toBe(false)
    })

    it('应该支持不区分大小写匹配', () => {
      expect(matchesQuery('AE:Brainstorm', 'brain')).toBe(true)
    })
  })

  describe('skillToCommand', () => {
    it('应该将 ae:xxx 转换为 ae-xxx', () => {
      expect(skillToCommand('ae:brainstorm')).toBe('ae-brainstorm')
    })

    it('非 ae: 前缀应原样返回', () => {
      expect(skillToCommand('custom')).toBe('custom')
    })
  })

  describe('buildHelpCatalog', () => {
    it('应该复用 ae-catalog、command-registration 和 agent-registration 的数据', () => {
      vi.mocked(aeCatalog.getPhaseOneEntries).mockReturnValue([
        {
          skillName: 'ae:ideate',
          skillSlug: 'ae-ideate',
          commandName: 'ae-ideate',
          description: '生成想法',
          argumentHint: '[主题]',
          defaultEntry: false,
          skillFile: 'src/assets/skills/ae-ideate/SKILL.md',
        },
        {
          skillName: 'ae:work',
          skillSlug: 'ae-work',
          commandName: 'ae-work',
          description: '执行工作',
          argumentHint: '[计划]',
          defaultEntry: false,
          skillFile: 'src/assets/skills/ae-work/SKILL.md',
        },
      ] as ReturnType<typeof aeCatalog.getPhaseOneEntries>)

      vi.mocked(aeCatalog.getPhaseOnePoEntries).mockReturnValue([
        {
          skillName: 'ae:prompt-optimize',
          skillSlug: 'ae-prompt-optimize',
          commandName: 'ae-ideate-po',
          description: '先优化提示词，再用生成想法',
          argumentHint: '[主题]',
          defaultEntry: false,
          skillFile: 'src/assets/skills/ae-prompt-optimize/SKILL.md',
        },
      ] as ReturnType<typeof aeCatalog.getPhaseOnePoEntries>)

      vi.mocked(aeCatalog.getPhaseOnePaEntries).mockReturnValue([
        {
          skillName: 'ae:prompt-optimize',
          skillSlug: 'ae-prompt-optimize',
          commandName: 'ae-ideate-pa',
          description: '先优化提示词（auto 模式），再用生成想法',
          argumentHint: '[主题]',
          defaultEntry: false,
          skillFile: 'src/assets/skills/ae-prompt-optimize/SKILL.md',
        },
      ] as ReturnType<typeof aeCatalog.getPhaseOnePaEntries>)

      vi.mocked(aeCatalog.getAllAgentDefinitions).mockReturnValue([
        {
          name: 'correctness-reviewer',
          stage: 'review',
          tier: 'required',
          description: '审查逻辑错误',
          path: 'src/assets/agents/review/correctness-reviewer.md',
        },
      ] as ReturnType<typeof aeCatalog.getAllAgentDefinitions>)

      vi.mocked(commandRegistration.buildCommandConfig).mockReturnValue({
        'ae-ideate': { template: '使用 `ae:ideate` 技能...', description: '生成想法' },
        'ae-work': { template: '使用 `ae:work` 技能...', description: '执行工作' },
        'ae-ideate-po': { template: '先使用 `ae:prompt-optimize` 技能...', description: '先优化提示词，再用生成想法' },
        'ae-ideate-pa': { template: '先使用 `ae:prompt-optimize` 技能...', description: '先优化提示词（auto 模式），再用生成想法' },
      })

      vi.mocked(agentRegistration.buildAgentConfig).mockReturnValue({
        'correctness-reviewer': {
          description: '审查逻辑错误',
          prompt: 'prompt content',
          mode: 'subagent',
        },
      })

      const catalog = buildHelpCatalog('/repo')

      // 技能去重后应有 2 个
      expect(catalog.skills).toHaveLength(2)
      expect(catalog.skills[0].name).toBe('ae:ideate')
      expect(catalog.skills[1].name).toBe('ae:work')

      // 命令应有 4 个（基础 + po + pa）
      expect(catalog.commands).toHaveLength(4)
      const poCmd = catalog.commands.find((c) => c.name === 'ae-ideate-po')
      expect(poCmd).toBeDefined()
      expect(poCmd!.category).toBe('提示词优化')
      const paCmd = catalog.commands.find((c) => c.name === 'ae-ideate-pa')
      expect(paCmd).toBeDefined()
      expect(paCmd!.category).toBe('提示词优化（自动）')

      // 代理应有 1 个
      expect(catalog.agents).toHaveLength(1)
      expect(catalog.agents[0].name).toBe('correctness-reviewer')
      expect(catalog.agents[0].stage).toBe('review')
    })

    it('应该对技能去重（同一技能多个命令只保留一个）', () => {
      vi.mocked(aeCatalog.getPhaseOneEntries).mockReturnValue([
        {
          skillName: 'ae:prompt-optimize',
          skillSlug: 'ae-prompt-optimize',
          commandName: 'ae-prompt-optimize',
          description: '提示词优化',
          argumentHint: '',
          defaultEntry: false,
          skillFile: 'src/assets/skills/ae-prompt-optimize/SKILL.md',
        },
        {
          skillName: 'ae:prompt-optimize',
          skillSlug: 'ae-prompt-optimize',
          commandName: 'ae-prompt-optimize-auto',
          description: '提示词优化（auto）',
          argumentHint: '',
          defaultEntry: false,
          skillFile: 'src/assets/skills/ae-prompt-optimize/SKILL.md',
        },
      ] as ReturnType<typeof aeCatalog.getPhaseOneEntries>)

      vi.mocked(aeCatalog.getPhaseOnePoEntries).mockReturnValue([])
      vi.mocked(aeCatalog.getPhaseOnePaEntries).mockReturnValue([])
      vi.mocked(aeCatalog.getAllAgentDefinitions).mockReturnValue([])
      vi.mocked(commandRegistration.buildCommandConfig).mockReturnValue({
        'ae-prompt-optimize': { template: '', description: '提示词优化' },
        'ae-prompt-optimize-auto': { template: '', description: '提示词优化（auto）' },
      })
      vi.mocked(agentRegistration.buildAgentConfig).mockReturnValue({})

      const catalog = buildHelpCatalog('/repo')
      expect(catalog.skills).toHaveLength(1)
      expect(catalog.skills[0].name).toBe('ae:prompt-optimize')
    })
  })

  describe('filterCatalog', () => {
    const catalog = {
      skills: [
        { name: 'ae:brainstorm', description: '头脑风暴', argumentHint: '', commandName: 'ae-brainstorm', defaultEntry: false },
        { name: 'ae:plan', description: '制定计划', argumentHint: '', commandName: 'ae-plan', defaultEntry: false },
      ],
      commands: [
        { name: 'ae-brainstorm', description: '头脑风暴', category: '基础命令' },
        { name: 'ae-brainstorm-po', description: '先优化提示词', category: '提示词优化', baseCommand: 'ae-brainstorm' },
        { name: 'ae-brainstorm-pa', description: '先优化提示词（auto）', category: '提示词优化（自动）', baseCommand: 'ae-brainstorm' },
      ],
      agents: [
        { name: 'correctness-reviewer', stage: 'review', description: '审查逻辑' },
        { name: 'web-researcher', stage: 'research', description: '网络研究' },
      ],
    }

    it('无 query 时应返回完整目录', () => {
      const result = filterCatalog(catalog)
      expect(result.skills).toHaveLength(2)
      expect(result.commands).toHaveLength(3)
      expect(result.agents).toHaveLength(2)
    })

    it('应该按名称过滤技能', () => {
      const result = filterCatalog(catalog, 'brain')
      expect(result.skills).toHaveLength(1)
      expect(result.skills[0].name).toBe('ae:brainstorm')
      expect(result.agents).toHaveLength(0)
    })

    it('应该按命令名过滤技能', () => {
      const result = filterCatalog(catalog, 'ae-plan')
      expect(result.skills).toHaveLength(1)
      expect(result.skills[0].name).toBe('ae:plan')
    })

    it('应该按描述过滤代理', () => {
      const result = filterCatalog(catalog, '网络')
      expect(result.agents).toHaveLength(1)
      expect(result.agents[0].name).toBe('web-researcher')
    })

    it('应该按 stage 过滤代理', () => {
      const result = filterCatalog(catalog, 'review')
      expect(result.agents).toHaveLength(1)
      expect(result.agents[0].name).toBe('correctness-reviewer')
    })

    it('应该按 baseCommand 过滤命令别名', () => {
      const result = filterCatalog(catalog, 'ae-brainstorm')
      expect(result.commands).toHaveLength(3)
    })

    it('空字符串 query 应视为无过滤', () => {
      const result = filterCatalog(catalog, '   ')
      expect(result.skills).toHaveLength(2)
    })
  })

  describe('formatHelpCatalog', () => {
    it('应该生成包含技能、命令和代理的 Markdown', () => {
      const catalog = {
        skills: [{ name: 'ae:ideate', description: '生成想法', argumentHint: '[主题]', commandName: 'ae-ideate', defaultEntry: false }],
        commands: [
          { name: 'ae-ideate', description: '生成想法', category: '基础命令' },
          { name: 'ae-ideate-po', description: '先优化提示词', category: '提示词优化', baseCommand: 'ae-ideate' },
        ],
        agents: [{ name: 'correctness-reviewer', stage: 'review', description: '审查逻辑' }],
      }

      const text = formatHelpCatalog(catalog)
      expect(text).toContain('# AE 帮助信息')
      expect(text).toContain('## 技能')
      expect(text).toContain('ae:ideate')
      expect(text).toContain('## 命令')
      expect(text).toContain('/ae-ideate-po')
      expect(text).toContain('## 代理')
      expect(text).toContain('@correctness-reviewer')
    })

    it('无结果时应提示未找到', () => {
      const catalog = { skills: [], commands: [], agents: [] }
      const text = formatHelpCatalog(catalog, 'xxx')
      expect(text).toContain('未找到匹配的结果')
    })

    it('有过滤条件时应在标题中显示', () => {
      const catalog = { skills: [], commands: [], agents: [] }
      const text = formatHelpCatalog(catalog, 'test')
      expect(text).toContain('过滤条件: "test"')
    })
  })

  describe('generateHelpText', () => {
    it('应该整合扫描和格式化输出', () => {
      vi.mocked(aeCatalog.getPhaseOneEntries).mockReturnValue([])
      vi.mocked(aeCatalog.getPhaseOnePoEntries).mockReturnValue([])
      vi.mocked(aeCatalog.getPhaseOnePaEntries).mockReturnValue([])
      vi.mocked(aeCatalog.getAllAgentDefinitions).mockReturnValue([])
      vi.mocked(commandRegistration.buildCommandConfig).mockReturnValue({})
      vi.mocked(agentRegistration.buildAgentConfig).mockReturnValue({})

      const text = generateHelpText()
      expect(text).toContain('# AE 帮助信息')
    })
  })
})
