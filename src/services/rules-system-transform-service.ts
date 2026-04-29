import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'

import type { RuntimeAssetManifest } from './runtime-asset-manifest.js'
import { toPosixPath } from '../utils/path-utils.js'

/**
 * experimental.chat.system.transform hook 的 output 结构。
 *
 * opencode 源码中，system transform 的 output.system 是一个 string 数组，
 * 每个元素会被拼接为 system prompt 的独立段落。
 * 参考 packages/opencode/src/session/prompt.ts（约第 1442-1448 行）：
 *   const [skills, env, instructions, modelMsgs] = yield* Effect.all([...])
 *   const system = [...env, ...(skills ? [skills] : []), ...instructions]
 * 最终通过 llm.ts（约第 144 行）合并为完整 system prompt：
 *   options.instructions = system.join("\n")
 */
interface SystemTransformOutput {
  system: string[]
}

interface RuleFile {
  path: string
  relativePath: string
}

let cachedRules: string[] | undefined
let cachedRulesDir: string | undefined

async function collectRuleFiles(root: string, dir = root): Promise<RuleFile[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const files: RuleFile[] = []

  for (const entry of entries) {
    const entryPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...await collectRuleFiles(root, entryPath))
      continue
    }

    if (!entry.isFile() || !entry.name.endsWith('.md')) {
      continue
    }

    files.push({
      path: entryPath,
      relativePath: toPosixPath(relative(root, entryPath)),
    })
  }

  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
}

async function loadBuiltinRuleInstructions(manifest: RuntimeAssetManifest): Promise<string[]> {
  if (cachedRules && cachedRulesDir === manifest.rulesDir) {
    return cachedRules
  }

  const dirStat = await stat(manifest.rulesDir).catch(() => undefined)
  if (!dirStat?.isDirectory()) {
    cachedRules = []
    cachedRulesDir = manifest.rulesDir
    return cachedRules
  }

  const files = await collectRuleFiles(manifest.rulesDir)
  cachedRules = (await Promise.all(files.map(async (file) => {
    const content = await readFile(file.path, 'utf8').catch(() => '')
    if (!content.trim()) {
      return undefined
    }
    return `Instructions from AE builtin rule: ${file.relativePath}\n${content}`
  }))).filter((item): item is string => Boolean(item))
  cachedRulesDir = manifest.rulesDir
  return cachedRules
}

/**
 * 将插件内置规则直接注入 system prompt，避免依赖使用方项目是否显式配置规则路径。
 *
 * 实现原理：
 * 本服务通过 experimental.chat.system.transform hook 在每次对话时将内置规则
 * 文件内容追加到 output.system 数组，与 opencode 自身的 instruction 体系并行生效。
 *
 * 与 config.instructions 的区别：
 * - config.instructions：追加 glob 路径，由 opencode 运行时展开并加载（懒加载）
 * - system transform：直接追加已读取的规则文本内容（立即注入），确保内置规则
 *   无论使用方项目是否配置了 instructions 都会进入 system prompt
 *
 * 去重保证：
 * opencode 的 instruction.ts 中 systemPaths 使用 Set 按绝对路径去重，
 * 但 system transform 注入的是文本内容而非文件路径，走的是不同的注入通道，
 * 因此如果同一个规则文件同时被 config.instructions 和 system transform 加载，
 * 内容可能会重复。这是有意设计：内置规则必须强制注入，重复注入的影响仅为
 * token 消耗增加，不影响行为正确性。
 */
export async function injectBuiltinRulesIntoSystem(
  manifest: RuntimeAssetManifest,
  output: SystemTransformOutput,
): Promise<void> {
  const rules = await loadBuiltinRuleInstructions(manifest)
  output.system.push(...rules)
}
