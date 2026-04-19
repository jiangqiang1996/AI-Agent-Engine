import { join } from 'node:path'

import type { RuntimeAssetManifest } from './runtime-asset-manifest.js'
import { toPosixPath } from '../utils/path-utils.js'

interface InstructionsConfig {
  instructions?: string[]
}

/**
 * 将插件 rules/ 目录下的规范文件注册到 opencode 的 instructions 中。
 *
 * 无论插件是全局安装还是项目级安装，都会将 rulesDir 的 glob 路径
 * 追加到 config.instructions，opencode 在运行时读取并注入到系统提示词。
 */
export function registerRulesInstructions(config: InstructionsConfig, manifest: RuntimeAssetManifest): void {
  const rulesGlob = toPosixPath(join(manifest.rulesDir, '**', '*.md'))

  config.instructions = [...new Set([...(config.instructions ?? []), rulesGlob])]
}
