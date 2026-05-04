import { mkdir } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'

import { type FigmaAssetToolArgs } from '../schemas/figma-asset-schema.js'
import { parseFigmaSource } from './figma-source-utils.js'
import { createRunId, FigmaAssetError, formatSummary } from './figma-result-formatter.js'
import { ensureSafeDirectoryPath, ensureSafeOutputRoot, resolveWorkspacePath } from './figma-path-safety.js'
import { validateLatestManifest, writeManifests } from './figma-manifest-repo.js'
import { runApiMode } from './figma-api-mode.js'
import { runCollectMode } from './figma-collect-mode.js'
import { runBrowserMode, type BrowserModeOptions } from './figma-browser-mode.js'

export type { FigmaAssetError } from './figma-result-formatter.js'

const DEFAULT_OUTPUT_DIR = '.figma'

export interface RunFigmaAssetToolOptions {
  browser?: BrowserModeOptions
}

export async function runFigmaAssetTool(
  args: FigmaAssetToolArgs,
  workspaceRoot: string,
  options: RunFigmaAssetToolOptions = {},
): Promise<string> {
  const parsed = parseFigmaSource(args.source)
  const outputRoot = await resolveWorkspacePath(workspaceRoot, args.outputDir ?? DEFAULT_OUTPUT_DIR)
  ensureManagedOutputDir(workspaceRoot, outputRoot)
  await ensureSafeOutputRoot(workspaceRoot, outputRoot)

  if (args.mode === 'validate') {
    return validateLatestManifest(workspaceRoot, outputRoot)
  }

  const runId = createRunId()
  const runRoot = join(outputRoot, 'runs', runId)
  const runAssetsDir = join(runRoot, 'assets')
  await ensureSafeDirectoryPath(workspaceRoot, outputRoot, runAssetsDir)
  await mkdir(runAssetsDir, { recursive: true })
  await ensureSafeDirectoryPath(workspaceRoot, outputRoot, runAssetsDir)

  if (args.mode === 'collect') {
    const manifest = await runCollectMode(args, parsed, workspaceRoot, outputRoot, runId, runAssetsDir)
    await writeManifests(workspaceRoot, outputRoot, runRoot, manifest)
    return formatSummary(manifest, workspaceRoot, outputRoot)
  }

  if (args.mode === 'browser') {
    const { manifest, error } = await runBrowserMode(args, parsed, workspaceRoot, runId, runAssetsDir, options.browser)
    await writeManifests(workspaceRoot, outputRoot, runRoot, manifest)
    if (manifest.status === 'failed') {
      throw error ?? new Error('browser 模式执行失败。')
    }
    return formatSummary(manifest, workspaceRoot, outputRoot)
  }

  const { manifest, authMode, authSource, error } = await runApiMode(args, parsed, workspaceRoot, runId, runAssetsDir)
  await writeManifests(workspaceRoot, outputRoot, runRoot, manifest)
  if (manifest.status === 'failed') {
    throw error ?? new Error('API 模式执行失败。')
  }
  return formatSummary(manifest, workspaceRoot, outputRoot, undefined, { authMode, authSource })
}

function ensureManagedOutputDir(workspaceRoot: string, outputRoot: string): void {
  const resolvedWorkspace = resolve(workspaceRoot)
  const resolvedOutput = resolve(outputRoot)
  const name = basename(resolvedOutput).toLowerCase()
  if (resolvedOutput === resolvedWorkspace || !name.includes('figma')) {
    throw new FigmaAssetError('outputDir 必须是专用 Figma 输出目录，例如 .figma 或 custom-figma。', 'invalid_output_dir')
  }
}
