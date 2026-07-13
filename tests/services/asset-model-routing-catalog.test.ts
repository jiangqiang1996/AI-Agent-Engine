import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { COMMAND } from '../../src/schemas/ae-asset-schema.js'
import { MODEL_SCENARIO } from '../../src/schemas/model-scenario-schema.js'
import { getPhaseOneEntries } from '../../src/services/ae-catalog.js'
import {
  getAssetModelRoutingEntries,
  getCommandModelScenario,
} from '../../src/services/asset-model-routing-catalog.js'
import { createRuntimeAssetManifestFromRoot } from '../../src/services/runtime-asset-manifest.js'
import { getFrontmatterString, parseFrontmatter } from '../../src/utils/frontmatter.js'

describe('asset-model-routing-catalog', () => {
  it('应该为所有内置命令提供路由状态', () => {
    const entries = getAssetModelRoutingEntries().filter((entry) => entry.type === 'command')
    const routedNames = new Set(entries.map((entry) => entry.name))

    for (const command of getPhaseOneEntries()) {
      expect(routedNames.has(command.commandName)).toBe(true)
    }
  })

  it('复杂规划和审查命令不应该落到 quick', () => {
    for (const command of [COMMAND.DESIGN, COMMAND.WORK, COMMAND.REVIEW]) {
      expect(getCommandModelScenario(command)).toBe(MODEL_SCENARIO.DEEP)
    }
  })

  it('skill-creator 命令应该引用 standard 场景且旧入口无路由', () => {
    expect(getCommandModelScenario(COMMAND.SKILL_CREATOR)).toBe(MODEL_SCENARIO.STANDARD)
    expect(getCommandModelScenario('ae-save-session-flow')).toBeUndefined()
    expect(getCommandModelScenario('ae-asset-debug')).toBeUndefined()
  })

  it('work-report 命令应该引用 standard 场景', () => {
    expect(getCommandModelScenario(COMMAND.WORK_REPORT)).toBe(MODEL_SCENARIO.STANDARD)
  })

  it('prompt-optimize 命令应该引用 standard 场景', () => {
    expect(getCommandModelScenario(COMMAND.PROMPT_OPTIMIZE)).toBe(MODEL_SCENARIO.STANDARD)
  })

  it('image 命令应该引用 standard 场景', () => {
    expect(getCommandModelScenario(COMMAND.IMAGE)).toBe(MODEL_SCENARIO.STANDARD)
  })

  it('视觉相关命令应该引用 vision 场景', () => {
    expect(getCommandModelScenario(COMMAND.CHROME_DEVTOOLS)).toBe(MODEL_SCENARIO.VISION)
  })

  it('web-forge 命令应该引用 deep 场景', () => {
    expect(getCommandModelScenario(COMMAND.WEB_FORGE)).toBe(MODEL_SCENARIO.DEEP)
  })

  it('应该从 agent frontmatter 读取模型路由状态', () => {
    const manifest = {
      ...createRuntimeAssetManifestFromRoot(process.cwd()),
      agentsDir: join(process.cwd(), 'src', 'assets', 'agents'),
    }

    const entries = getAssetModelRoutingEntries(manifest).filter((entry) => entry.type === 'agent')
    const uiArchitectRoute = entries.find((entry) => entry.name === 'ui-architect')

    expect(uiArchitectRoute?.scenario).toBe(MODEL_SCENARIO.VISION)
  })

  it('内置 agent 路由状态应该与 frontmatter model 保持一致', () => {
    const manifest = {
      ...createRuntimeAssetManifestFromRoot(process.cwd()),
      agentsDir: join(process.cwd(), 'src', 'assets', 'agents'),
    }
    const entries = getAssetModelRoutingEntries(manifest).filter((entry) => entry.type === 'agent')

    for (const entry of entries) {
      const stage = ['review', 'research', 'workflow'].find((value) =>
        existsSync(join(manifest.agentsDir, value, `${entry.name}.md`)),
      )
      if (!stage) {
        continue
      }
      const content = readFileSync(join(manifest.agentsDir, stage, `${entry.name}.md`), 'utf8')
      const modelReference = getFrontmatterString(parseFrontmatter(content).data, 'model')
      expect(modelReference).toBeDefined()
      if (!modelReference) {
        throw new Error(`缺少 agent model frontmatter: ${entry.name}`)
      }
      expect(entry.scenario).toBe(modelReference.startsWith('$') ? modelReference.slice(1) : modelReference)
    }
  })
})
