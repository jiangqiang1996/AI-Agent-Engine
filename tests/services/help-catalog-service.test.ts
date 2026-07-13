import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/services/ae-catalog.js', () => ({
  getPhaseOneEntries: vi.fn(),
  getAllAgentDefinitions: vi.fn(),
}))

vi.mock('../../src/services/command-registration.js', () => ({
  buildCommandConfig: vi.fn(),
}))

vi.mock('../../src/services/agent-registration.js', () => ({
  buildAgentConfig: vi.fn(),
}))

vi.mock('../../src/services/asset-model-routing-catalog.js', () => ({
  getAssetModelRoutingEntries: vi.fn(() => []),
}))

vi.mock('../../src/services/runtime-asset-manifest.js', () => ({
  createRuntimeAssetManifest: vi.fn(() => ({
    repoRoot: '/runtime-repo',
    skillsDir: '/runtime-repo/dist/src/assets/skills',
    agentsDir: '/runtime-repo/dist/src/assets/agents',
    commandsDir: '/runtime-repo/dist/src/assets/commands',
  })),
  createRuntimeAssetManifestFromRoot: vi.fn((repoRoot: string) => ({
    repoRoot,
    skillsDir: `${repoRoot}/src/assets/skills`,
    agentsDir: `${repoRoot}/src/assets/agents`,
    commandsDir: `${repoRoot}/src/assets/commands`,
  })),
}))

import * as aeCatalog from '../../src/services/ae-catalog.js'
import * as commandRegistration from '../../src/services/command-registration.js'
import * as agentRegistration from '../../src/services/agent-registration.js'
import * as assetModelRoutingCatalog from '../../src/services/asset-model-routing-catalog.js'
import * as runtimeAssetManifest from '../../src/services/runtime-asset-manifest.js'
import { COMMAND, SKILL } from '../../src/schemas/ae-asset-schema.js'

import {
  buildHelpCatalog,
  filterCatalog,
  formatHelpCatalog,
  generateHelpText,
  skillToCommand,
  matchesQuery,
  resolveDetail,
  formatDetailEntry,
} from '../../src/services/help-catalog-service.js'

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
          skillName: 'ae:brainstorm',
          commandName: 'ae-brainstorm',
          description: '头脑风暴',
          argumentHint: '[主题]',
          skillFile: 'src/assets/skills/ae-brainstorm/SKILL.md',
        },
        {
          skillName: 'ae:work',
          commandName: 'ae-work',
          description: '执行工作',
          argumentHint: '[设计]',
          skillFile: 'src/assets/skills/ae-work/SKILL.md',
        },
      ] as ReturnType<typeof aeCatalog.getPhaseOneEntries>)

      vi.mocked(aeCatalog.getAllAgentDefinitions).mockReturnValue([
        {
          name: 'correctness-reviewer',
          stage: 'review',
          tier: 'required',
          description: '审查逻辑错误',
          path: 'domains/review/specialists/correctness-reviewer.md',
        },
      ] as ReturnType<typeof aeCatalog.getAllAgentDefinitions>)

      vi.mocked(commandRegistration.buildCommandConfig).mockReturnValue({
        'ae-brainstorm': { template: '使用 `ae:brainstorm` 技能...', description: '头脑风暴' },
        'ae-work': { template: '使用 `ae:work` 技能...', description: '执行工作' },
      })

      vi.mocked(agentRegistration.buildAgentConfig).mockReturnValue({
        'correctness-reviewer': {
          description: '审查逻辑错误',
          prompt: 'prompt content',
          mode: 'subagent',
        },
      })

      const catalog = buildHelpCatalog('/repo')

      expect(catalog.skills).toHaveLength(2)
      expect(catalog.skills[0].name).toBe('ae:brainstorm')
      expect(catalog.skills[1].name).toBe('ae:work')

      expect(catalog.commands).toHaveLength(2)
      const brainstormCmd = catalog.commands.find((c) => c.name === 'ae-brainstorm')
      expect(brainstormCmd).toBeDefined()
      expect(brainstormCmd!.category).toBe('基础命令')

      expect(catalog.agents).toHaveLength(1)
      expect(catalog.agents[0].name).toBe('correctness-reviewer')
      expect(catalog.agents[0].stage).toBe('review')
      expect(assetModelRoutingCatalog.getAssetModelRoutingEntries).toHaveBeenCalledWith(
        expect.objectContaining({ repoRoot: '/repo' }),
      )
    })

    it('应该将调用方 repoRoot 传递给 agent-registration', () => {
      vi.mocked(aeCatalog.getPhaseOneEntries).mockReturnValue([])
      vi.mocked(aeCatalog.getAllAgentDefinitions).mockReturnValue([])
      vi.mocked(commandRegistration.buildCommandConfig).mockReturnValue({})
      vi.mocked(agentRegistration.buildAgentConfig).mockReturnValue({})

      buildHelpCatalog('/custom-repo')

      expect(runtimeAssetManifest.createRuntimeAssetManifestFromRoot).toHaveBeenCalledWith('/custom-repo')
      expect(agentRegistration.buildAgentConfig).toHaveBeenCalledWith(
        expect.objectContaining({ repoRoot: '/custom-repo' }),
      )
    })

    it('未传 repoRoot 时应使用运行时资产清单', () => {
      vi.mocked(aeCatalog.getPhaseOneEntries).mockReturnValue([])
      vi.mocked(aeCatalog.getAllAgentDefinitions).mockReturnValue([])
      vi.mocked(commandRegistration.buildCommandConfig).mockReturnValue({})
      vi.mocked(agentRegistration.buildAgentConfig).mockReturnValue({})

      buildHelpCatalog()

      expect(runtimeAssetManifest.createRuntimeAssetManifest).toHaveBeenCalled()
      expect(agentRegistration.buildAgentConfig).toHaveBeenCalledWith(
        expect.objectContaining({ commandsDir: '/runtime-repo/dist/src/assets/commands' }),
      )
    })
  })

  describe('filterCatalog', () => {
    const catalog = {
      skills: [
        { name: 'ae:brainstorm', description: '头脑风暴', argumentHint: '', commandName: 'ae-brainstorm', tier: 'core' },
        { name: 'ae:design', description: '制定设计', argumentHint: '', commandName: 'ae-design', tier: 'core' },
      ],
      commands: [
        { name: 'ae-brainstorm', description: '头脑风暴', category: '基础命令' },
        { name: 'ae-design', description: '制定设计', category: '基础命令' },
      ],
      agents: [
        { name: 'correctness-reviewer', stage: 'review', description: '审查逻辑' },
        { name: 'web-researcher', stage: 'research', description: '网络研究' },
      ],
    }

    it('无 query 时应返回完整目录', () => {
      const result = filterCatalog(catalog)
      expect(result.skills).toHaveLength(2)
      expect(result.commands).toHaveLength(2)
      expect(result.agents).toHaveLength(2)
    })

    it('应该按名称过滤技能', () => {
      const result = filterCatalog(catalog, 'brain')
      expect(result.skills).toHaveLength(1)
      expect(result.skills[0].name).toBe('ae:brainstorm')
      expect(result.agents).toHaveLength(0)
    })

    it('应该按命令名过滤技能', () => {
      const result = filterCatalog(catalog, 'ae-design')
      expect(result.skills).toHaveLength(1)
      expect(result.skills[0].name).toBe('ae:design')
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

    it('应该按 refactor 查询返回技能和命令', () => {
      const result = filterCatalog(
        {
          skills: [
            {
              name: SKILL.DESIGN,
              description: '设计阶段：支持 refactor=true 彻底重构',
              argumentHint: '[需求文档路径|旧 design|裸描述] [dimensions=architecture,database] [refactor=true]',
              commandName: COMMAND.DESIGN,
              tier: 'core',
            },
          ],
          commands: [
            { name: COMMAND.DESIGN, description: '设计阶段：支持 refactor=true 彻底重构', category: '基础命令' },
          ],
          agents: [],
        },
        'refactor',
      )

      expect(result.skills).toHaveLength(1)
      expect(result.skills[0].name).toBe(SKILL.DESIGN)
      expect(result.commands.map((command) => command.name)).toEqual([COMMAND.DESIGN])
    })

    it('应该从目录和命令配置构建 refactor 帮助项', () => {
      vi.mocked(aeCatalog.getPhaseOneEntries).mockReturnValue([
        {
          skillName: SKILL.DESIGN,
          commandName: COMMAND.DESIGN,
          description: '设计阶段：支持 refactor=true 彻底重构',
          argumentHint: '[需求文档路径|旧 design|裸描述] [dimensions=architecture,database] [refactor=true]',
          skillFile: 'src/assets/skills/ae-design/SKILL.md',
        },
      ] as ReturnType<typeof aeCatalog.getPhaseOneEntries>)
      vi.mocked(aeCatalog.getAllAgentDefinitions).mockReturnValue([])
      vi.mocked(commandRegistration.buildCommandConfig).mockReturnValue({
        [COMMAND.DESIGN]: { template: '', description: '设计阶段：支持 refactor=true 彻底重构' },
      })
      vi.mocked(agentRegistration.buildAgentConfig).mockReturnValue({})

      const result = filterCatalog(buildHelpCatalog('/repo'), 'refactor')

      expect(result.skills.map((skill) => skill.name)).toEqual([SKILL.DESIGN])
      expect(result.commands.map((command) => command.name)).toEqual([COMMAND.DESIGN])
    })

    it('空字符串 query 应视为无过滤', () => {
      const result = filterCatalog(catalog, '   ')
      expect(result.skills).toHaveLength(2)
    })
  })

  describe('formatHelpCatalog', () => {
    it('应该生成包含技能、命令和代理的 Markdown', () => {
      const catalog = {
        skills: [{ name: 'ae:brainstorm', description: '头脑风暴', argumentHint: '[主题|范围]', commandName: 'ae-brainstorm', tier: 'core' }],
        commands: [
          { name: 'ae-brainstorm', description: '头脑风暴', category: '基础命令' },
        ],
        agents: [{ name: 'correctness-reviewer', stage: 'review', description: '审查逻辑' }],
        modelRoutes: [{ type: 'command' as const, name: 'ae-brainstorm', scenario: 'standard' as const, applyMode: 'direct' as const, reason: '内置命令声明 standard 场景' }],
      }

      const text = formatHelpCatalog(catalog)
      expect(text).toContain('# AE 帮助信息')
      expect(text).toContain('## 技能')
      expect(text).toContain('ae:brainstorm')
      expect(text).toContain('`[主题\\|范围]`')
      expect(text).toContain('## 命令')
      expect(text).toContain('/ae-brainstorm')
      expect(text).toContain('## 代理')
      expect(text).toContain('@correctness-reviewer')
      expect(text).toContain('## 模型路由')
      expect(text).toContain('modelScenarios')
    })

    it('应该为空参数技能显示占位符', () => {
      const catalog = {
        skills: [{ name: 'ae:help', description: '查看帮助', argumentHint: '', commandName: 'ae-help', tier: 'core' }],
        commands: [],
        agents: [],
      }

      const text = formatHelpCatalog(catalog)

      expect(text).toContain('| `ae:help` | `/ae-help` | `—` | 查看帮助 |')
    })

    it('应该显示 save-experience 且不显示旧 save-rules 入口', () => {
      const catalog = {
        skills: [{ name: SKILL.SAVE_EXPERIENCE, description: '统一经验沉淀入口', argumentHint: '[经验摘要|保存目标]', commandName: COMMAND.SAVE_EXPERIENCE, tier: 'tools' }],
        commands: [{ name: COMMAND.SAVE_EXPERIENCE, description: '统一经验沉淀入口', category: '基础命令' }],
        agents: [],
      }

      const text = formatHelpCatalog(catalog)

      expect(text).toContain('ae:save-experience')
      expect(text).toContain('/ae-save-experience')
      expect(text).not.toContain('ae:save-rules')
      expect(text).not.toContain('/ae-save-rules')
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
      vi.mocked(aeCatalog.getAllAgentDefinitions).mockReturnValue([])
      vi.mocked(commandRegistration.buildCommandConfig).mockReturnValue({})
      vi.mocked(agentRegistration.buildAgentConfig).mockReturnValue({})

      const text = generateHelpText()
      expect(text).toContain('# AE 帮助信息')
    })

    it('精确匹配技能名时应返回详情视图', () => {
      vi.mocked(aeCatalog.getPhaseOneEntries).mockReturnValue([
        {
          skillName: 'ae:design',
          commandName: 'ae-design',
          description: '制定设计',
          argumentHint: '[目标]',
          skillFile: 'src/assets/skills/ae-design/SKILL.md',
        },
      ] as ReturnType<typeof aeCatalog.getPhaseOneEntries>)
      vi.mocked(aeCatalog.getAllAgentDefinitions).mockReturnValue([])
      vi.mocked(commandRegistration.buildCommandConfig).mockReturnValue({
        'ae-design': { template: '', description: '制定设计' },
      })
      vi.mocked(agentRegistration.buildAgentConfig).mockReturnValue({})

      const text = generateHelpText('ae:design')
      expect(text).toContain('# 技能：ae:design')
      expect(text).toContain('制定设计')
      expect(text).toContain('/ae-design')
    })

    it('精确匹配命令名时应返回详情视图', () => {
      vi.mocked(aeCatalog.getPhaseOneEntries).mockReturnValue([
        {
          skillName: 'ae:brainstorm',
          commandName: 'ae-brainstorm',
          description: '头脑风暴',
          argumentHint: '[主题]',
          skillFile: 'src/assets/skills/ae-brainstorm/SKILL.md',
        },
      ] as ReturnType<typeof aeCatalog.getPhaseOneEntries>)
      vi.mocked(aeCatalog.getAllAgentDefinitions).mockReturnValue([])
      vi.mocked(commandRegistration.buildCommandConfig).mockReturnValue({
        'ae-brainstorm': { template: '', description: '头脑风暴' },
      })
      vi.mocked(agentRegistration.buildAgentConfig).mockReturnValue({})

      const text = generateHelpText('ae-brainstorm')
      expect(text).toContain('# 技能：ae:brainstorm')
      expect(text).toContain('头脑风暴')
    })

    it('精确匹配代理名时应返回详情视图', () => {
      vi.mocked(aeCatalog.getPhaseOneEntries).mockReturnValue([])
      vi.mocked(aeCatalog.getAllAgentDefinitions).mockReturnValue([
        {
          name: 'correctness-reviewer',
          stage: 'review',
          tier: 'required',
          description: '审查逻辑错误',
          path: 'domains/review/specialists/correctness-reviewer.md',
        },
      ] as ReturnType<typeof aeCatalog.getAllAgentDefinitions>)
      vi.mocked(commandRegistration.buildCommandConfig).mockReturnValue({})
      vi.mocked(agentRegistration.buildAgentConfig).mockReturnValue({
        'correctness-reviewer': { description: '审查逻辑错误', prompt: '', mode: 'subagent' },
      })

      const text = generateHelpText('correctness-reviewer')
      expect(text).toContain('# 代理：correctness-reviewer')
      expect(text).toContain('审查逻辑错误')
      expect(text).toContain('@correctness-reviewer')
    })

    it('带前缀 / 的查询应返回详情视图', () => {
      vi.mocked(aeCatalog.getPhaseOneEntries).mockReturnValue([
        {
          skillName: 'ae:design',
          commandName: 'ae-design',
          description: '制定设计',
          argumentHint: '[目标]',
          skillFile: 'src/assets/skills/ae-design/SKILL.md',
        },
      ] as ReturnType<typeof aeCatalog.getPhaseOneEntries>)
      vi.mocked(aeCatalog.getAllAgentDefinitions).mockReturnValue([])
      vi.mocked(commandRegistration.buildCommandConfig).mockReturnValue({
        'ae-design': { template: '', description: '制定设计' },
      })
      vi.mocked(agentRegistration.buildAgentConfig).mockReturnValue({})

      const text = generateHelpText('/ae-design')
      expect(text).toContain('# 技能：ae:design')
    })

    it('带前缀 @ 的查询应返回代理详情视图', () => {
      vi.mocked(aeCatalog.getPhaseOneEntries).mockReturnValue([])
      vi.mocked(aeCatalog.getAllAgentDefinitions).mockReturnValue([
        {
          name: 'web-researcher',
          stage: 'research',
          tier: 'required',
          description: '网络研究',
          path: 'research/web-researcher.md',
        },
      ] as ReturnType<typeof aeCatalog.getAllAgentDefinitions>)
      vi.mocked(commandRegistration.buildCommandConfig).mockReturnValue({})
      vi.mocked(agentRegistration.buildAgentConfig).mockReturnValue({
        'web-researcher': { description: '网络研究', prompt: '', mode: 'subagent' },
      })

      const text = generateHelpText('@web-researcher')
      expect(text).toContain('# 代理：web-researcher')
    })

    it('非精确匹配时应回退到子串过滤列表', () => {
      vi.mocked(aeCatalog.getPhaseOneEntries).mockReturnValue([
        {
          skillName: 'ae:brainstorm',
          commandName: 'ae-brainstorm',
          description: '头脑风暴',
          argumentHint: '[主题]',
          skillFile: 'src/assets/skills/ae-brainstorm/SKILL.md',
          tier: 'core',
        },
      ] as ReturnType<typeof aeCatalog.getPhaseOneEntries>)
      vi.mocked(aeCatalog.getAllAgentDefinitions).mockReturnValue([])
      vi.mocked(commandRegistration.buildCommandConfig).mockReturnValue({
        'ae-brainstorm': { template: '', description: '头脑风暴' },
      })
      vi.mocked(agentRegistration.buildAgentConfig).mockReturnValue({})

      const text = generateHelpText('brain')
      expect(text).toContain('# AE 帮助信息')
      expect(text).toContain('ae:brainstorm')
    })
  })

  describe('resolveDetail', () => {
    const catalog = {
      skills: [
        { name: 'ae:design', description: '制定设计', argumentHint: '[目标]', commandName: 'ae-design', tier: 'core' },
        { name: 'ae:brainstorm', description: '头脑风暴', argumentHint: '[主题]', commandName: 'ae-brainstorm', tier: 'core' },
      ],
      commands: [
        { name: 'ae-design', description: '制定设计', category: '基础命令' },
        { name: 'ae-brainstorm', description: '头脑风暴', category: '基础命令' },
        { name: 'ae-commit', description: '智能提交', category: '基础命令' },
      ],
      agents: [
        { name: 'correctness-reviewer', stage: 'review', description: '审查逻辑' },
        { name: 'web-researcher', stage: 'research', description: '网络研究' },
      ],
      modelRoutes: [
        { type: 'command' as const, name: 'ae-design', scenario: 'deep' as const, applyMode: 'direct' as const, reason: '内置命令声明 deep 场景' },
      ],
    }

    it('按技能名精确查找应返回技能详情', () => {
      const detail = resolveDetail(catalog, 'ae:design')
      expect(detail).not.toBeNull()
      expect(detail!.type).toBe('skill')
      expect(detail!.name).toBe('ae:design')
      expect(detail!.description).toBe('制定设计')
      expect(detail!.properties).toContainEqual({ label: '命令', value: '/ae-design' })
      expect(detail!.properties).toContainEqual({ label: '参数', value: '[目标]' })
    })

    it('按命令名精确查找应返回技能详情', () => {
      const detail = resolveDetail(catalog, 'ae-design')
      expect(detail).not.toBeNull()
      expect(detail!.type).toBe('skill')
      expect(detail!.name).toBe('ae:design')
    })

    it('按代理名精确查找应返回代理详情', () => {
      const detail = resolveDetail(catalog, 'correctness-reviewer')
      expect(detail).not.toBeNull()
      expect(detail!.type).toBe('agent')
      expect(detail!.name).toBe('correctness-reviewer')
      expect(detail!.properties).toContainEqual({ label: '阶段', value: '审查' })
    })

    it('带 @ 前缀查找代理应正常工作', () => {
      const detail = resolveDetail(catalog, '@correctness-reviewer')
      expect(detail).not.toBeNull()
      expect(detail!.type).toBe('agent')
    })

    it('带 / 前缀查找命令应正常工作', () => {
      const detail = resolveDetail(catalog, '/ae-design')
      expect(detail).not.toBeNull()
      expect(detail!.type).toBe('skill')
    })

    it('名称同时匹配技能和模型路由时应优先返回技能详情', () => {
      const detail = resolveDetail(catalog, 'ae-design')
      expect(detail).not.toBeNull()
      expect(detail!.type).toBe('skill')
    })

    it('仅在模型路由中存在的名称应返回模型路由详情', () => {
      const catalogWithOnlyRoute = {
        skills: [],
        commands: [],
        agents: [],
        modelRoutes: [
          { type: 'command' as const, name: 'ae-custom', scenario: 'deep' as const, applyMode: 'direct' as const, reason: '自定义命令' },
        ],
      }
      const detail = resolveDetail(catalogWithOnlyRoute, 'ae-custom')
      expect(detail).not.toBeNull()
      expect(detail!.type).toBe('modelRoute')
      expect(detail!.name).toBe('ae-custom')
    })

    it('不存在的名称应返回 null', () => {
      const detail = resolveDetail(catalog, 'nonexistent')
      expect(detail).toBeNull()
    })

    it('技能详情应包含关联命令和模型路由', () => {
      const detail = resolveDetail(catalog, 'ae:design')
      expect(detail).not.toBeNull()
      const commandRelated = detail!.related.find((r) => r.type === 'command' && r.name === 'ae-design')
      expect(commandRelated).toBeDefined()
      const routeRelated = detail!.related.find((r) => r.type === 'modelRoute' && r.name === 'ae-design')
      expect(routeRelated).toBeDefined()
    })

    it('非技能命令详情不应包含关联技能', () => {
      const detail = resolveDetail(catalog, 'ae-commit')
      expect(detail).not.toBeNull()
      expect(detail!.type).toBe('command')
      const skillRelated = detail!.related.find((r) => r.type === 'skill')
      expect(skillRelated).toBeUndefined()
    })
  })

  describe('formatDetailEntry', () => {
    it('应该格式化技能详情', () => {
      const entry = {
        type: 'skill' as const,
        name: 'ae:design',
        description: '制定设计',
        properties: [
          { label: '命令', value: '/ae-design' },
          { label: '参数', value: '[目标]' },
        ],
        related: [
          { type: 'command' as const, name: 'ae-design', description: '制定设计' },
        ],
      }
      const text = formatDetailEntry(entry)
      expect(text).toContain('# 技能：ae:design')
      expect(text).toContain('制定设计')
      expect(text).toContain('- **命令**：/ae-design')
      expect(text).toContain('## 关联')
      expect(text).toContain('**命令** `/ae-design`')
    })

    it('应该格式化代理详情', () => {
      const entry = {
        type: 'agent' as const,
        name: 'web-researcher',
        description: '网络研究',
        properties: [
          { label: '调用方式', value: '@web-researcher' },
          { label: '阶段', value: '研究' },
        ],
        related: [],
      }
      const text = formatDetailEntry(entry)
      expect(text).toContain('# 代理：web-researcher')
      expect(text).toContain('- **调用方式**：@web-researcher')
      expect(text).not.toContain('## 关联')
    })

    it('应该格式化命令详情', () => {
      const entry = {
        type: 'command' as const,
        name: 'ae-design',
        description: '制定设计',
        properties: [
          { label: '命令', value: '/ae-design' },
          { label: '分类', value: '基础命令' },
        ],
        related: [
          { type: 'skill' as const, name: 'ae:design', description: '制定设计' },
        ],
      }
      const text = formatDetailEntry(entry)
      expect(text).toContain('# 命令：ae-design')
      expect(text).toContain('## 关联')
      expect(text).toContain('**技能** `ae:design`')
    })

    it('应该格式化模型路由详情', () => {
      const entry = {
        type: 'modelRoute' as const,
        name: 'ae-design',
        description: '内置命令声明 deep 场景',
        properties: [
          { label: '类型', value: '命令' },
          { label: '场景', value: 'deep' },
          { label: '应用方式', value: '直接声明' },
        ],
        related: [
          { type: 'skill' as const, name: 'ae:design', description: '制定设计' },
        ],
      }
      const text = formatDetailEntry(entry)
      expect(text).toContain('# 模型路由：ae-design')
      expect(text).toContain('- **类型**：命令')
      expect(text).toContain('- **场景**：deep')
      expect(text).toContain('## 关联')
      expect(text).toContain('**技能** `ae:design`')
    })
  })
})
