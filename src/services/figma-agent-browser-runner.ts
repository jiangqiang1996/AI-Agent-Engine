import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { EVAL_SCRIPTS, isValidScriptId, type FigmaBrowserEvalScriptId } from './figma-browser-eval-scripts.js'
import { FigmaAssetError } from './figma-result-formatter.js'

const execFileAsync = promisify(execFile)
const COMMAND_TIMEOUT_MS = 60_000

export interface BrowserDiscoveryResult {
  sessionIdHash: string
  pageUrlHash: string
  targetNodeId?: string

  scriptId: FigmaBrowserEvalScriptId
  capturedAt: string
  eventType: 'page_eval'
  resourceUrls: string[]
}

export interface FigmaAgentBrowserRunner {
  open: (sessionId: string, url: string) => Promise<void>
  snapshotInteractive: (sessionId: string) => Promise<string>
  discoverResources: (sessionId: string, pageUrl: string, nodeId: string, scriptId: string) => Promise<BrowserDiscoveryResult>
  close: (sessionId: string) => Promise<void>
}

export const defaultFigmaAgentBrowserRunner: FigmaAgentBrowserRunner = {
  open: async (sessionId, url) => {
    await runAgentBrowser(['--session', sessionId, 'open', url])
  },
  snapshotInteractive: async (sessionId) => runAgentBrowser(['--session', sessionId, 'snapshot', '-i']),
  discoverResources: async (sessionId, _pageUrl, _nodeId, scriptId) => {
    if (!isValidScriptId(scriptId)) {
      throw new FigmaAssetError('预定义浏览器脚本 ID 无效。', 'invalid_eval_script_id')
    }
    const stdout = await runAgentBrowser(['--session', sessionId, 'eval', EVAL_SCRIPTS[scriptId]])
    const result = parseDiscoveryOutput(stdout)
    return {
      sessionIdHash: hashPrefix(sessionId),
      pageUrlHash: hashPrefix(result.pageUrl),
      targetNodeId: _nodeId,
      scriptId,
      capturedAt: new Date().toISOString(),
      eventType: 'page_eval',
      resourceUrls: result.resourceUrls,
    }
  },
  close: async (sessionId) => {
    await runAgentBrowser(['--session', sessionId, 'close'])
  },
}

export function hashPrefix(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16)
}

export function classifyFigmaPageState(snapshot: string): 'node_exportable' | 'login_required' | 'access_denied' | 'file_not_found' | 'page_load_failed' | 'page_state_unknown' {
  const lower = snapshot.toLowerCase()
  if (!snapshot.trim()) {
    return 'page_load_failed'
  }
  if (lower.includes('sign in') || lower.includes('log in')) {
    return 'login_required'
  }
  if (lower.includes('request access') || lower.includes('access denied')) {
    return 'access_denied'
  }
  if (lower.includes('file not found') || lower.includes('404')) {
    return 'file_not_found'
  }
  if (lower.includes('export')) {
    return 'node_exportable'
  }
  return 'page_state_unknown'
}

async function runAgentBrowser(args: string[]): Promise<string> {
  try {
    const result = await execFileAsync(agentBrowserCommand(), args, {
      timeout: COMMAND_TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    })
    return result.stdout
  } catch (error) {
    throw new FigmaAssetError(`agent-browser 执行失败：${redactAgentBrowserError(error)}`, 'agent_browser_failed')
  }
}

function agentBrowserCommand(): string {
  return process.platform === 'win32' ? 'agent-browser.cmd' : 'agent-browser'
}

function parseDiscoveryOutput(stdout: string): { pageUrl: string; resourceUrls: string[] } {
  const parsed = JSON.parse(stdout) as unknown
  if (!isDiscoveryOutput(parsed)) {
    return { pageUrl: '', resourceUrls: [] }
  }
  return {
    pageUrl: parsed.pageUrl,
    resourceUrls: parsed.resourceUrls.filter((item): item is string => typeof item === 'string'),
  }
}

function isDiscoveryOutput(value: unknown): value is { pageUrl: string; resourceUrls: unknown[] } {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { pageUrl?: unknown }).pageUrl === 'string'
    && Array.isArray((value as { resourceUrls?: unknown }).resourceUrls)
}

function redactAgentBrowserError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message
    .replace(/[a-z][a-z0-9+.-]*:\/\/\S+/gi, '<redacted-url>')
    .replace(/[A-Za-z0-9_-]{24,}/g, '<redacted>')
}
