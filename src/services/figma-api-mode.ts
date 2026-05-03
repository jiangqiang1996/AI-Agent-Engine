import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { type FigmaAssetManifest, type FigmaAssetToolArgs } from '../schemas/figma-asset-schema.js'
import { normalizeNodeId, type ParsedFigmaSource } from './figma-source-utils.js'
import { FigmaAssetError } from './figma-result-formatter.js'
import { downloadImageBytes, requestFigmaImageUrl, resolveAuth, type AuthMode } from './figma-api-client.js'
import { buildFigmaSource, buildManifestItem, createRunSalt, defaultEvidence, hashSourceId } from './figma-manifest-repo.js'

export interface ApiModeResult {
  manifest: FigmaAssetManifest
  authMode: AuthMode
  authSource: string
  error?: FigmaAssetError
}

export async function runApiMode(
  args: FigmaAssetToolArgs,
  parsed: ParsedFigmaSource,
  workspaceRoot: string,
  runId: string,
  runAssetsDir: string,
): Promise<ApiModeResult> {
  const fileKey = args.fileKey ?? parsed.fileKey
  const nodeId = normalizeNodeId(args.nodeId ?? parsed.nodeId)
  if (!fileKey) {
    throw new FigmaAssetError('API 模式需要提供 fileKey，或提供可解析 fileKey 的 Figma URL。', 'missing_file_key')
  }
  if (!nodeId) {
    throw new FigmaAssetError('API 模式需要提供 nodeId，或提供包含 node-id 参数的 Figma URL。', 'missing_node_id')
  }

  const { token, mode: authMode, source: authSource } = await resolveAuth(args, workspaceRoot)
  const format = args.format ?? 'png'
  const scale = args.scale ?? 1
  const runSalt = createRunSalt()
  const startedAt = new Date().toISOString()

  try {
    const imageUrl = await requestFigmaImageUrl(fileKey, nodeId, format, scale, token, authMode)
    const bytes = await downloadImageBytes(imageUrl)
    const sourceIdHash = hashSourceId(nodeId, runSalt)
    const safeFileName = `${sourceIdHash}.${format}`
    const assetPath = join(runAssetsDir, safeFileName)
    await writeFile(assetPath, bytes)
    const completedAt = new Date().toISOString()

    return {
      manifest: {
        schemaVersion: 2,
        mode: 'api',
        runId,
        startedAt,
        completedAt,
        status: 'success',
        source: buildFigmaSource(parsed.redactedSource, fileKey, [nodeId], runSalt),
        evidence: defaultEvidence(),
        warnings: [],
        failures: [],
        assets: [await buildManifestItem(workspaceRoot, assetPath, sourceIdHash, format)],
      },
      authMode,
      authSource,
    }
  } catch (error) {
    const figmaError = error instanceof FigmaAssetError
      ? error
      : new FigmaAssetError('API 模式执行失败。', 'api_mode_failed')
    const completedAt = new Date().toISOString()
    return {
      manifest: {
        schemaVersion: 2,
        mode: 'api',
        runId,
        startedAt,
        completedAt,
        status: 'failed',
        source: buildFigmaSource(parsed.redactedSource, fileKey, [nodeId], runSalt),
        evidence: defaultEvidence(),
        warnings: [],
        failures: [{ code: figmaError.code, message: figmaError.message }],
        assets: [],
      },
      authMode,
      authSource,
      error: figmaError,
    }
  }
}
