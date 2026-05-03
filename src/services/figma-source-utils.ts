const ALLOWED_DOWNLOAD_SUFFIXES = ['.figma.com', '.figma.net', '.figmausercontent.com']

export interface ParsedFigmaSource {
  fileKey?: string
  nodeId?: string
  redactedSource?: string
}

export function parseFigmaSource(source?: string): ParsedFigmaSource {
  if (!source) {
    return {}
  }

  try {
    const url = new URL(source)
    if (!isFigmaHost(url.hostname)) {
      return {}
    }
    const fileKey = url.pathname.match(/\/file\/([^/]+)|\/design\/([^/]+)/)?.slice(1).find(Boolean)
    const nodeId = url.searchParams.get('node-id') ?? undefined
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''
    return { fileKey, nodeId, redactedSource: url.toString() }
  } catch {
    return {}
  }
}

export function normalizeNodeId(nodeId?: string): string | undefined {
  return nodeId?.replaceAll('-', ':')
}

export function isFigmaHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return ALLOWED_DOWNLOAD_SUFFIXES.some((suffix) => host === suffix.slice(1) || host.endsWith(suffix))
}
