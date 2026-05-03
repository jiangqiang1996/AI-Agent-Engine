import { join, parse } from 'node:path'

import type { FigmaAssetManifest } from '../schemas/figma-asset-schema.js'
import { toRepoRelativePath } from '../utils/path-utils.js'

export class FigmaAssetError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message)
    this.name = 'FigmaAssetError'
  }
}

export function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._:-]/g, '_').replace(/:/g, '-')
}

export function createUniqueFileName(fileName: string, usedFileNames: Set<string>): string {
  if (!usedFileNames.has(fileName)) {
    usedFileNames.add(fileName)
    return fileName
  }

  const parsed = parse(fileName)
  let index = 2
  while (true) {
    const candidate = `${parsed.name}-${index}${parsed.ext}`
    if (!usedFileNames.has(candidate)) {
      usedFileNames.add(candidate)
      return candidate
    }
    index += 1
  }
}

export function createRunId(): string {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 17)
  const suffix = Math.random().toString(36).slice(2, 8)
  return `${timestamp}-${suffix}`
}

import type { AuthMode } from './figma-api-client.js'

export function formatSummary(
  manifest: FigmaAssetManifest,
  workspaceRoot: string,
  outputRoot: string,
  title = '导出完成',
  auth?: { authMode: AuthMode; authSource: string },
): string {
  const authLine = auth ? `- 认证：${auth.authMode}（${auth.authSource}）` : ''
  return [
    `# Figma 素材${title}`,
    '',
    `- 模式：${manifest.mode}`,
    `- 状态：${manifest.status}`,
    `- 运行 ID：${manifest.runId}`,
    `- 素材数量：${manifest.assets.length}`,
    `- 输出目录：${toRepoRelativePath(workspaceRoot, outputRoot)}`,
    `- Manifest：${toRepoRelativePath(workspaceRoot, join(outputRoot, 'manifest.json'))}`,
    `- Evidence：saved=${manifest.evidence.saved}`,
    ...(authLine ? [authLine] : []),
    '',
    ...manifest.assets.map((asset) => `- ${asset.relativePath} (${asset.bytes} bytes, sha256:${asset.sha256.slice(0, 12)}...)`),
    ...(manifest.warnings.length > 0 ? ['', '## Warnings', ...manifest.warnings.map((warning) => `- ${warning.code}: ${warning.message}`)] : []),
    ...(manifest.failures.length > 0 ? ['', '## Failures', ...manifest.failures.map((failure) => `- ${failure.code}: ${failure.message}`)] : []),
    '',
    '提示：.figma/ 可能包含私有设计资产；如 .gitignore 未覆盖，请勿直接提交。',
  ].join('\n')
}

export function formatFigmaAssetError(error: unknown): string {
  if (error instanceof FigmaAssetError) {
    return `Figma 素材处理失败：${error.message}`
  }
  if (error instanceof Error) {
    return 'Figma 素材处理失败：执行过程中发生未预期错误，请检查输入后重试。'
  }
  return 'Figma 素材处理失败：未知错误。'
}
