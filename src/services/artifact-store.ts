import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { Effect } from 'effect'

import type { RuntimeAssetManifest } from './runtime-asset-manifest.js'
import { parseFrontmatter } from '../utils/frontmatter.js'

export interface ArtifactRecord {
  path: string
  body: string
  type: 'brainstorm' | 'plan' | 'work' | 'review'
  frontmatter: Record<string, string>
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
      return []
    }

    throw error
  }
}

const CONTEXT_DIR_TYPE_MAP: Record<'work' | 'review', string> = {
  work: 'work',
  review: 'ae-review',
}

function getArtifactDirectory(manifest: RuntimeAssetManifest, type: 'brainstorm' | 'plan' | 'work' | 'review'): string {
  if (type === 'brainstorm') {
    return join(manifest.repoRoot, 'docs', 'brainstorms')
  }

  if (type === 'plan') {
    return join(manifest.repoRoot, 'docs', 'plans')
  }

  return join(manifest.repoRoot, '.context', 'ae', CONTEXT_DIR_TYPE_MAP[type])
}

export function listArtifacts(
  manifest: RuntimeAssetManifest,
  type: 'brainstorm' | 'plan' | 'work' | 'review',
): ArtifactRecord[] {
  const dir = getArtifactDirectory(manifest, type)

  return Effect.runSync(
    Effect.try({
      try: () =>
        readMarkdownFiles(dir).map((path) => {
          const content = readFileSync(path, 'utf8')
          const parsed = parseFrontmatter(content)

          return {
            path,
            body: parsed.body,
            type,
            frontmatter: parsed.data,
          }
        }),
      catch: (error) => (error instanceof Error ? error : new Error(String(error))),
    }),
  )
}
