import { createHash, randomBytes } from 'node:crypto'
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'

import {
  FigmaAssetManifestSchema,
  type FigmaAssetManifest,
  type FigmaAssetManifestItem,
  type FigmaAssetSource,
} from '../schemas/figma-asset-schema.js'
import { formatSummary } from './figma-result-formatter.js'
import {
  ensureFileWithinSizeLimit,
  ensureNoSymlink,
  ensureNoSymlinkInExistingAncestors,
  ensureSafeDirectoryPath,
  ensureSafePathBeforeDelete,
} from './figma-path-safety.js'
import { isInsideRoot, toRepoRelativePath } from '../utils/path-utils.js'

export async function writeManifests(
  workspaceRoot: string,
  outputRoot: string,
  runRoot: string,
  manifest: FigmaAssetManifest,
): Promise<void> {
  const validated = FigmaAssetManifestSchema.parse(manifest)
  const manifestJson = `${JSON.stringify(validated, null, 2)}\n`
  await writeFile(join(runRoot, 'manifest.json'), manifestJson)

  const latestAssetsDir = join(outputRoot, 'assets')
  await ensureSafePathBeforeDelete(workspaceRoot, latestAssetsDir)
  await ensureNoSymlinkInExistingAncestors(workspaceRoot, latestAssetsDir)
  await rm(latestAssetsDir, { recursive: true, force: true })
  await ensureSafeDirectoryPath(workspaceRoot, outputRoot, latestAssetsDir)
  await mkdir(latestAssetsDir, { recursive: true })
  await ensureSafeDirectoryPath(workspaceRoot, outputRoot, latestAssetsDir)
  const latestAssets: FigmaAssetManifestItem[] = []
  for (const asset of validated.assets) {
    const sourcePath = resolve(workspaceRoot, asset.relativePath)
    const targetPath = join(latestAssetsDir, asset.fileName)
    await ensureNoSymlinkInExistingAncestors(workspaceRoot, targetPath)
    await copyFile(sourcePath, targetPath)
    await ensureSafeDirectoryPath(workspaceRoot, outputRoot, latestAssetsDir)
    latestAssets.push(await buildManifestItem(workspaceRoot, targetPath, asset.sourceIdHash, asset.format))
  }

  await writeFile(join(outputRoot, 'manifest.json'), `${JSON.stringify({ ...validated, assets: latestAssets }, null, 2)}\n`)
}

export async function validateLatestManifest(workspaceRoot: string, outputRoot: string): Promise<string> {
  const manifestPath = join(outputRoot, 'manifest.json')
  const latestManifest = await readManifestFile(manifestPath)
  if (isLegacyManifest(latestManifest)) {
    return '# Figma 素材校验失败\n\n- manifest 结构为旧版 version: 1，请重新执行 api 或 collect 生成 schemaVersion: 2。'
  }
  const latest = FigmaAssetManifestSchema.parse(latestManifest)
  const runManifestPath = join(outputRoot, 'runs', latest.runId, 'manifest.json')
  const runManifest = FigmaAssetManifestSchema.parse(await readManifestFile(runManifestPath))
  if (runManifest.runId !== latest.runId) {
    return '# Figma 素材校验失败\n\n- run manifest 与 latest manifest 的 runId 不一致'
  }
  if (latest.status === 'failed' || runManifest.status === 'failed') {
    const failures = latest.status === 'failed' ? latest.failures : runManifest.failures
    return [`# Figma 素材校验失败`, '', ...failures.map((failure) => `- ${failure.code}: ${failure.message}`)].join('\n')
  }
  const mismatches: string[] = []
  await collectAssetMismatches(workspaceRoot, join(outputRoot, 'assets'), latest.assets, 'latest assets', mismatches)
  await collectAssetMismatches(
    workspaceRoot,
    join(outputRoot, 'runs', runManifest.runId, 'assets'),
    runManifest.assets,
    '本次运行 assets',
    mismatches,
  )

  if (mismatches.length > 0) {
    return [`# Figma 素材校验失败`, '', ...mismatches.map((item) => `- ${item}`)].join('\n')
  }
  return formatSummary(latest, workspaceRoot, outputRoot, '校验通过')
}

async function collectAssetMismatches(
  workspaceRoot: string,
  expectedRoot: string,
  assets: FigmaAssetManifestItem[],
  rootLabel: string,
  mismatches: string[],
): Promise<void> {
  for (const asset of assets) {
    const assetPath = resolve(workspaceRoot, asset.relativePath)
    if (!isInsideRoot(expectedRoot, assetPath)) {
      mismatches.push(`${asset.relativePath}: 路径不在${rootLabel}目录内`)
      continue
    }
    let actual: FigmaAssetManifestItem
    try {
      await ensureNoSymlink(assetPath)
      actual = await buildManifestItem(workspaceRoot, assetPath, asset.sourceIdHash, asset.format)
    } catch {
      mismatches.push(`${asset.relativePath}: 文件不存在或无法读取`)
      continue
    }
    if (actual.sha256 !== asset.sha256 || actual.bytes !== asset.bytes) {
      mismatches.push(`${asset.relativePath}: checksum 或大小不匹配`)
    }
  }
}

async function readManifestFile(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown
}

function isLegacyManifest(value: unknown): value is { version: 1 } {
  return typeof value === 'object'
    && value !== null
    && 'version' in value
    && (value as { version?: unknown }).version === 1
}

export async function buildManifestItem(
  workspaceRoot: string,
  filePath: string,
  sourceIdHash: string,
  format: string,
): Promise<FigmaAssetManifestItem> {
  await ensureFileWithinSizeLimit(filePath)
  const data = await readFile(filePath)
  return {
    sourceIdHash,
    fileName: basename(filePath),
    relativePath: toRepoRelativePath(workspaceRoot, filePath),
    format,
    bytes: data.byteLength,
    sha256: createHash('sha256').update(data).digest('hex'),
  }
}

export function createRunSalt(): string {
  return randomBytes(16).toString('hex')
}

export function hashSourceId(value: string, runSalt: string): string {
  return createHash('sha256').update(`${runSalt}:${value}`).digest('hex').slice(0, 16)
}

export function defaultEvidence(): FigmaAssetManifest['evidence'] {
  return { agentBrowserUsed: false, saved: false, types: [], paths: [] }
}

export function buildFigmaSource(
  redactedSource: string | undefined,
  fileKey: string | undefined,
  nodeIds: string[],
  runSalt: string,
): FigmaAssetSource | undefined {
  if (!redactedSource && !fileKey && nodeIds.length === 0) {
    return undefined
  }
  const host = redactedSource ? new URL(redactedSource).hostname : undefined
  return {
    type: 'figma_url',
    host,
    fileKeyHash: fileKey ? hashSourceId(fileKey, runSalt) : undefined,
    nodeIdHashes: nodeIds.map((nodeId) => hashSourceId(nodeId, runSalt)),
  }
}
