import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { ToolContext } from '@opencode-ai/plugin'

export const GRAPH_BUILD_STATE_BASE = {
  schemaVersion: 1,
  startedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  worktreeKey: '.',
  scopeRoot: '.',
  requestFingerprint: 'old',
  requestSummary: {
    scopeRoot: '.',
    depth: 'shallow',
    requestedMode: 'full',
    effectiveMode: 'full',
    includeRules: [],
    excludeRules: [],
    changedFilesDigest: 'old',
    configDigest: 'old',
  },
}

const tempRoots: string[] = []

export function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ae-graph-build-'))
  tempRoots.push(root)
  return root
}

export function write(root: string, relativePath: string, content: string): void {
  const absolutePath = join(root, relativePath)
  mkdirSync(join(absolutePath, '..'), { recursive: true })
  writeFileSync(absolutePath, content)
}

export function createMockContext(worktree: string) {
  return {
    worktree,
    directory: worktree,
    sessionID: 'test-session',
    messageID: 'test-message',
    agent: 'test-agent',
    abort: new AbortController().signal,
    metadata: () => undefined,
    ask: (input: { patterns?: string[] }) => {
      if (input.patterns?.some((pattern) => pattern.endsWith(join('.opencode', 'ae.jsonc')))) {
        throw new Error('denied')
      }
      return Promise.resolve()
    },
  } as unknown as ToolContext
}

export function createAllowExcludeContext(worktree: string) {
  return {
    ...createMockContext(worktree),
    ask: () => Promise.resolve(),
  } as unknown as ToolContext
}

export function createCaptureAskContext(worktree: string, asked: unknown[]) {
  return {
    ...createMockContext(worktree),
    ask: (input: unknown) => {
      asked.push(input)
      return Promise.resolve()
    },
  } as unknown as ToolContext
}

export function previewIndexReferencesExistingAssets(root: string): boolean {
  const indexPath = join(root, 'ae', 'graphs', 'index.html')
  if (!existsSync(indexPath)) {
    return false
  }
  const html = readFileSync(indexPath, 'utf8')
  const scriptMatch = html.match(/<script[^>]+src="\.\/assets\/([^"]+\.js)"/)
  const stylesheetMatch = html.match(/<link[^>]+rel="stylesheet"[^>]+href="\.\/assets\/([^"]+\.css)"/)
  if (!scriptMatch || !stylesheetMatch) {
    return false
  }
  const scriptName = scriptMatch[1]
  const stylesheetName = stylesheetMatch[1]
  if (
    !scriptName ||
    !stylesheetName ||
    scriptName.includes('/') ||
    scriptName.includes('\\') ||
    stylesheetName.includes('/') ||
    stylesheetName.includes('\\')
  ) {
    return false
  }
  const assetDir = join(root, 'ae', 'graphs', 'assets')
  return existsSync(join(assetDir, scriptName)) && existsSync(join(assetDir, stylesheetName))
}

export function removeTempRoot(root: string): void {
  try {
    rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (process.platform === 'win32' && (code === 'EPERM' || code === 'EBUSY' || code === 'ENOTEMPTY')) {
      return
    }
    throw error
  }
}

export function cleanupTempRoots(): void {
  for (const root of tempRoots.splice(0)) {
    removeTempRoot(root)
  }
}
