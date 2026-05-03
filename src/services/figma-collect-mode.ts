import { readdir, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'

import { type FigmaAssetManifest, type FigmaAssetManifestItem, type FigmaAssetToolArgs } from '../schemas/figma-asset-schema.js'
import { type ParsedFigmaSource } from './figma-source-utils.js'
import { createUniqueFileName, FigmaAssetError, sanitizeFileName } from './figma-result-formatter.js'
import {
  ensureFileWithinSizeLimit,
  ensureNoSymlink,
  assertOpenSourceFileUnchanged,
  openStableSourceFile,
  resolveExistingWorkspacePath,
} from './figma-path-safety.js'
import { buildFigmaSource, buildManifestItem, createRunSalt, defaultEvidence, hashSourceId } from './figma-manifest-repo.js'
import { isInsideRoot } from '../utils/path-utils.js'

const ALLOWED_MANUAL_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif'])

export async function runCollectMode(
  args: FigmaAssetToolArgs,
  parsed: ParsedFigmaSource,
  workspaceRoot: string,
  outputRoot: string,
  runId: string,
  runAssetsDir: string,
): Promise<FigmaAssetManifest> {
  if (!args.manualSourceDir) {
    throw new FigmaAssetError('collect 模式需要提供 manualSourceDir。', 'missing_manual_source_dir')
  }

  const sourceDir = await resolveExistingWorkspacePath(workspaceRoot, args.manualSourceDir)
  if (sourceDir === outputRoot || isInsideRoot(outputRoot, sourceDir)) {
    throw new FigmaAssetError('manualSourceDir 不能位于输出目录内部，避免重复收集。', 'invalid_manual_source_dir')
  }

  const entries = await readdir(sourceDir, { withFileTypes: true })
  const assets: FigmaAssetManifestItem[] = []
  const sourceIds: string[] = []
  const runSalt = createRunSalt()
  const usedFileNames = new Set<string>()
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue
    }
    const ext = extname(entry.name).toLowerCase()
    if (!ALLOWED_MANUAL_EXTENSIONS.has(ext)) {
      continue
    }
    const sourcePath = join(sourceDir, entry.name)
    const sourceId = basename(entry.name, ext)
    await ensureNoSymlink(sourcePath)
    await ensureFileWithinSizeLimit(sourcePath)
    const targetPath = join(runAssetsDir, createUniqueFileName(sanitizeFileName(entry.name), usedFileNames))
    const sourceFile = await openStableSourceFile(sourcePath)
    try {
      await writeFile(targetPath, await sourceFile.handle.readFile())
      await assertOpenSourceFileUnchanged(sourcePath, sourceFile)
    } finally {
      await sourceFile.handle.close()
    }
    sourceIds.push(sourceId)
    assets.push(await buildManifestItem(workspaceRoot, targetPath, hashSourceId(sourceId, runSalt), ext.slice(1)))
  }

  if (assets.length === 0) {
    throw new FigmaAssetError('manualSourceDir 中没有可收集的图片素材。', 'no_manual_assets')
  }

  const now = new Date().toISOString()
  return {
    schemaVersion: 2,
    mode: 'collect',
    runId,
    startedAt: now,
    completedAt: now,
    status: 'success',
    source: parsed.redactedSource ? buildFigmaSource(parsed.redactedSource, parsed.fileKey, sourceIds, runSalt) : {
      type: 'manual',
      nodeIdHashes: sourceIds.map((sourceId) => hashSourceId(sourceId, runSalt)),
    },
    evidence: defaultEvidence(),
    warnings: [],
    failures: [],
    assets,
  }
}
