import { promises as fs } from 'node:fs'
import path from 'node:path'

import { SwaggerError } from './swagger-errors.js'
import { fetchRemoteSwagger } from './swagger-remote-transport.js'
import { decodeRemoteResponse } from './swagger-remote-response-budget.js'

const MAX_LOCAL_BYTES = 5 * 1024 * 1024

export interface SwaggerSourceResult {
  sourceType: 'local' | 'remote'
  content: string
  realPath?: string
  documentDir?: string
  workspaceRoot?: string
}

function isRemoteSource(source: string): boolean {
  return /^https?:\/\//i.test(source)
}

function rejectWindowsSpecialPath(source: string): void {
  if (source.startsWith('\\\\') || source.startsWith('\\\\?\\') || /:[^\\/]+$/.test(source.replace(/^[a-zA-Z]:/, ''))) {
    throw new SwaggerError('path_outside_root', '路径越界：不允许 UNC、扩展长度路径或备用数据流路径。')
  }
}

export async function loadSwaggerSource(source: string, worktree: string): Promise<SwaggerSourceResult> {
  if (!source.trim()) {
    throw new SwaggerError('input_empty', '输入为空：请提供本地 JSON 路径或 HTTP(S) URL。')
  }

  if (isRemoteSource(source)) {
    const response = await fetchRemoteSwagger(source)
    const encoding = Array.isArray(response.headers['content-encoding'])
      ? response.headers['content-encoding'][0]
      : response.headers['content-encoding']
    const content = decodeRemoteResponse(response.body, encoding)
    if (!content.trim()) {
      throw new SwaggerError('remote_empty_response', '远程响应为空：当前无法读取该远程规格。')
    }
    return { sourceType: 'remote', content }
  }

  rejectWindowsSpecialPath(source)
  const root = await fs.realpath(worktree)
  const target = path.resolve(root, source)
  let realTarget: string
  try {
    realTarget = await fs.realpath(target)
  } catch {
    throw new SwaggerError('path_not_found', '路径不存在：请确认 Swagger/OpenAPI JSON/YAML 文件位于当前工作区。')
  }

  const relative = path.relative(root, realTarget)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new SwaggerError('path_outside_root', '路径越界：只能读取当前工作区内的 JSON/YAML 文件。')
  }

  const stat = await fs.stat(realTarget)
  if (!stat.isFile()) {
    throw new SwaggerError('path_not_file', '路径不是文件：请提供 Swagger/OpenAPI JSON/YAML 文件路径。')
  }
  if (stat.size > MAX_LOCAL_BYTES) {
    throw new SwaggerError('file_too_large', '文件过大：仅支持 5 MB 以内的 Swagger/OpenAPI JSON/YAML。')
  }

  const content = await fs.readFile(realTarget, 'utf8')
  if (!content.trim()) {
    throw new SwaggerError('file_empty', '文件为空：请提供有效的 Swagger/OpenAPI JSON/YAML。')
  }
  return { sourceType: 'local', content, realPath: realTarget, documentDir: path.dirname(realTarget), workspaceRoot: root }
}
