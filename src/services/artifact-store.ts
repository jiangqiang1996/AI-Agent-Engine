import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { Effect } from 'effect'

import type { RuntimeAssetManifest } from './runtime-asset-manifest.js'
import { ARTIFACT_KIND, isShardArtifactKind, type ArtifactKind } from '../schemas/artifact-schema.js'
import { docsAePath, DOCS_AE_SUBDIRS } from '../schemas/docs-ae-paths.js'
import { parseFrontmatter, type FrontmatterData } from '../utils/frontmatter.js'

/** 产物目录中单个 Markdown 文件的解析结果。 */
export interface ArtifactRecord {
  path: string
  body: string
  type: ArtifactKind
  frontmatter: FrontmatterData
}

function readMarkdownFiles(dir: string): string[] {
  try {
    return Effect.runSync(
      Effect.try({
        try: () =>
          readdirSync(dir)
            .filter((entry) => entry.endsWith('.md'))
            .map((entry) => join(dir, entry))
            .filter((path) => statSync(path).isFile()),
        catch: (error) => {
          if (typeof error === 'object' && error && 'code' in error && error.code === 'ENOENT') {
            return new Error('ENOENT')
          }
          return error instanceof Error ? error : new Error(String(error))
        },
      }),
    )
  } catch (error) {
    if (error instanceof Error && error.message === 'ENOENT') {
      // 上游阶段可能尚未产生目录；恢复流程应把它视为无候选，而不是读目录失败。
      return []
    }
    throw error
  }
}

/** 产物类型到 AE 产物子目录名的映射，用于定位产物存储位置。 */
const CONTEXT_DIR_TYPE_MAP: Partial<Record<ArtifactKind, string>> = {
  [ARTIFACT_KIND.PRD]: DOCS_AE_SUBDIRS.PRDS,
  [ARTIFACT_KIND.DESIGN]: DOCS_AE_SUBDIRS.DESIGNS,
  [ARTIFACT_KIND.WORK]: DOCS_AE_SUBDIRS.WORK,
  [ARTIFACT_KIND.REVIEW]: DOCS_AE_SUBDIRS.REVIEW,
}

/** 返回指定产物类型在仓库中的绝对目录路径。 */
function getArtifactDirectory(
  manifest: RuntimeAssetManifest,
  type: ArtifactKind,
): string {
  const directory = CONTEXT_DIR_TYPE_MAP[type]
  if (!directory || isShardArtifactKind(type)) {
    throw new Error(`产物类型 ${type} 不作为顶层 AE 产物扫描`)
  }
  return join(manifest.repoRoot, docsAePath(directory))
}

/**
 * 列出指定类型的所有产物记录。
 * 目录不存在时返回空数组，不会抛出异常。
 */
export function listArtifacts(
  manifest: RuntimeAssetManifest,
  type: ArtifactKind,
): ArtifactRecord[] {
  const dir = getArtifactDirectory(manifest, type)
  const files = readMarkdownFiles(dir)

  return Effect.runSync(
    Effect.try({
      try: () =>
        files.map((path) => {
          const content = readFileSync(path, 'utf8')
          const parsed = parseFrontmatter(content)
          return {
            path,
            body: parsed.body,
            type,
            frontmatter: parsed.data,
          }
        }),
      // 文件已被枚举后仍可能被用户或其他代理修改/删除，此处保留为真实读取错误交给上层恢复逻辑处理。
      catch: (error) => (error instanceof Error ? error : new Error(String(error))),
    }),
  )
}
