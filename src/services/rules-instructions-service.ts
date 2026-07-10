import { join } from 'node:path'

import type { RuntimeAssetManifest } from './runtime-asset-manifest.js'
import { getOpencodeGlobalConfigDir } from './opencode-path-service.js'
import { toPosixPath } from '../utils/path-utils.js'

interface InstructionsConfig {
  instructions?: string[]
}

/**
 * 向 opencode 的 config.instructions 追加规则路径。
 *
 * 去重机制说明（opencode 源码 packages/opencode/src/session/instruction.ts）：
 *
 * 1. config.instructions 中的每个条目会被 glob 展开为绝对文件路径数组。
 *    参考 systemPaths 实现（约第 120-157 行）：
 *    - 对每个 instruction 条目调用 fs.glob 展开
 *    - 展开结果统一用 path.resolve 转为绝对路径
 *    - 所有绝对路径加入 Set，Set 按绝对路径自动去重
 *
 * 2. 因此以下场景不会导致重复加载：
 *    - 用户在 opencode.json 中配置了具体文件路径如 ".opencode/rules/1.md"
 *    - 本函数注入了同目录的通配符模式
 *    - 两条目分别 glob 展开后，1.md 的绝对路径相同，Set 只保留一份
 *
 * 3. config 层合并也做了去重（packages/opencode/src/config/config.ts 第 52-53 行）：
 *    全局配置和项目配置的 instructions 数组合并时，完全相同的字符串条目
 *    也会被 Set 去重。合并方式为 Array.from(new Set(...))
 *
 * 4. 本函数用 Set 对 instructions 数组做去重，确保注入的 glob 字符串本身不重复；
 *    但不同 glob pattern 展开后指向同一文件的去重由 opencode 运行时保证，无需插件侧处理。
 */
export function registerRulesInstructions(config: InstructionsConfig, manifest: RuntimeAssetManifest): void {
  const projectRuleGlobs = ['.opencode/rules/**/*.md']
  const globalRulesGlob = toPosixPath(join(getOpencodeGlobalConfigDir(), 'rules', '**', '*.md'))
  const builtinRulesGlob = toPosixPath(join(manifest.rulesDir, '**', '*.md'))
  config.instructions = [...new Set([...(config.instructions ?? []), builtinRulesGlob, ...projectRuleGlobs, globalRulesGlob])]
}
