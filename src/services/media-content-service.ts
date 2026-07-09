import { promises as fs } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { loadDocumentFile } from './document-file-loader.js'

/**
 * 媒体内容（参考 opencode FileSystem.Content 格式）。
 * - uri: file URL，如 file:///path/to/image.png
 * - name: 文件名
 * - content: base64 编码的文件内容
 * - encoding: 固定 base64
 * - mime: 通过 magic bytes 检测的 MIME 类型
 */
export interface MediaContent {
  uri: string
  name: string
  content: string
  encoding: 'base64'
  mime: string
}

export type MediaKind = 'image' | 'audio' | 'video'

/**
 * 媒体摄取大小上限（参考 opencode read-filesystem.ts:13 MAX_MEDIA_INGEST_BYTES）。
 */
const MAX_MEDIA_INGEST_BYTES = 20 * 1024 * 1024

/**
 * 构造 data URL（参考 opencode read.ts:56 toModelOutput）。
 */
export function buildDataUrl(content: MediaContent): string {
  return `data:${content.mime};base64,${content.content}`
}

// ─── Magic bytes 检测（参考 opencode read-filesystem.ts:135-142） ───

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  if (bytes.length < prefix.length) return false
  return prefix.every((value, index) => bytes[index] === value)
}

/**
 * 图片 magic bytes 检测（参考 opencode read-filesystem.ts:136-142）。
 * 支持 PNG/JPEG/GIF/WebP。
 */
function detectImageMime(bytes: Uint8Array): string | undefined {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return 'image/gif'
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50])) {
    return 'image/webp'
  }
  return undefined
}

/**
 * 音频 magic bytes 检测。
 * 支持 MP3/WAV/OGG/FLAC/M4A/AAC。
 */
function detectAudioMime(bytes: Uint8Array): string | undefined {
  // ID3 tag (MP3)
  if (startsWith(bytes, [0x49, 0x44, 0x33])) return 'audio/mpeg'
  // MPEG frame sync (MP3)
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] === 0xfb || bytes[1] === 0xf3 || bytes[1] === 0xfa)) {
    return 'audio/mpeg'
  }
  // RIFF + WAVE (WAV)
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes.subarray(8), [0x57, 0x41, 0x56, 0x45])) {
    return 'audio/wav'
  }
  // OggS (OGG)
  if (startsWith(bytes, [0x4f, 0x67, 0x67, 0x53])) return 'audio/ogg'
  // fLaC (FLAC)
  if (startsWith(bytes, [0x66, 0x4c, 0x61, 0x43])) return 'audio/flac'
  // ADTS (AAC)
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] === 0xf1 || bytes[1] === 0xf9)) {
    return 'audio/aac'
  }
  // M4A: ftyp box at offset 4 + major brand
  if (startsWith(bytes.subarray(4), [0x66, 0x74, 0x79, 0x70])) {
    const brand = bytes.subarray(8, 12)
    if (startsWith(brand, [0x4d, 0x34, 0x41, 0x20]) || startsWith(brand, [0x6d, 0x70, 0x34, 0x32])) {
      return 'audio/mp4'
    }
  }
  return undefined
}

/**
 * 视频 magic bytes 检测。
 * 支持 MP4/WebM/AVI/MOV/MKV/FLV。
 *
 * 兼容性提示：MKV/FLV/AVI 等容器格式可能被部分模型拒绝，
 * 调用方应在错误信息中提示用户转码。
 */
function detectVideoMime(bytes: Uint8Array): string | undefined {
  // ftyp box at offset 4 (MP4/MOV)
  if (startsWith(bytes.subarray(4), [0x66, 0x74, 0x79, 0x70])) {
    return 'video/mp4'
  }
  // EBML (WebM/MKV)
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) {
    return 'video/webm'
  }
  // RIFF + AVI
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes.subarray(8), [0x41, 0x56, 0x49, 0x20])) {
    return 'video/x-msvideo'
  }
  // FLV
  if (startsWith(bytes, [0x46, 0x4c, 0x56])) {
    return 'video/x-flv'
  }
  return undefined
}

/**
 * 扩展名 fallback（当 magic bytes 无法识别时）。
 */
function fallbackMimeByExtension(filePath: string, kind: MediaKind, format?: string): string {
  if (format) {
    const fmt = format.toLowerCase()
    if (kind === 'image') {
      if (fmt === 'png') return 'image/png'
      if (fmt === 'jpg' || fmt === 'jpeg') return 'image/jpeg'
      if (fmt === 'gif') return 'image/gif'
      if (fmt === 'webp') return 'image/webp'
      if (fmt === 'bmp') return 'image/bmp'
    }
    if (kind === 'audio') {
      if (fmt === 'mp3') return 'audio/mpeg'
      if (fmt === 'wav') return 'audio/wav'
      if (fmt === 'ogg') return 'audio/ogg'
      if (fmt === 'flac') return 'audio/flac'
      if (fmt === 'm4a') return 'audio/mp4'
      if (fmt === 'aac') return 'audio/aac'
    }
    if (kind === 'video') {
      if (fmt === 'mp4') return 'video/mp4'
      if (fmt === 'webm') return 'video/webm'
      if (fmt === 'avi') return 'video/x-msvideo'
      if (fmt === 'mov') return 'video/quicktime'
      if (fmt === 'mkv') return 'video/x-matroska'
      if (fmt === 'flv') return 'video/x-flv'
    }
  }

  const lower = filePath.toLowerCase()
  if (kind === 'image') {
    if (lower.endsWith('.png')) return 'image/png'
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
    if (lower.endsWith('.gif')) return 'image/gif'
    if (lower.endsWith('.webp')) return 'image/webp'
    if (lower.endsWith('.bmp')) return 'image/bmp'
    return 'image/jpeg'
  }
  if (kind === 'audio') {
    if (lower.endsWith('.mp3')) return 'audio/mpeg'
    if (lower.endsWith('.wav')) return 'audio/wav'
    if (lower.endsWith('.ogg')) return 'audio/ogg'
    if (lower.endsWith('.flac')) return 'audio/flac'
    if (lower.endsWith('.m4a')) return 'audio/mp4'
    if (lower.endsWith('.aac')) return 'audio/aac'
    return 'audio/mpeg'
  }
  // video
  if (lower.endsWith('.mp4')) return 'video/mp4'
  if (lower.endsWith('.webm')) return 'video/webm'
  if (lower.endsWith('.avi')) return 'video/x-msvideo'
  if (lower.endsWith('.mov')) return 'video/quicktime'
  if (lower.endsWith('.mkv')) return 'video/x-matroska'
  if (lower.endsWith('.flv')) return 'video/x-flv'
  return 'video/mp4'
}

function detectMime(bytes: Uint8Array, kind: MediaKind): string | undefined {
  if (kind === 'image') return detectImageMime(bytes)
  if (kind === 'audio') return detectAudioMime(bytes)
  return detectVideoMime(bytes)
}

const KIND_LABEL: Record<MediaKind, string> = {
  image: '图片',
  audio: '音频',
  video: '视频',
}

/**
 * 读取媒体文件并返回 MediaContent（参考 opencode read-filesystem.ts 的读取流程）。
 *
 * 流程：
 * 1. 通过 loadDocumentFile 读取文件（路径安全校验 + 大小限制）
 * 2. magic bytes 检测 MIME，失败时用扩展名 fallback
 * 3. 转为 base64 + file URL
 *
 * @param file 用户输入的文件路径
 * @param worktree 当前工作区
 * @param kind 媒体类型
 * @param format 显式指定格式（可选，用于 fallback）
 */
export async function readMediaContent(
  file: string,
  worktree: string,
  kind: MediaKind,
  format?: string,
): Promise<MediaContent> {
  const label = KIND_LABEL[kind]
  const { buffer, filePath } = await loadDocumentFile(file, worktree, label)

  if (buffer.length > MAX_MEDIA_INGEST_BYTES) {
    throw new Error(
      `${label}过大（${(buffer.length / 1024 / 1024).toFixed(1)} MB），媒体识别上限为 ${MAX_MEDIA_INGEST_BYTES / 1024 / 1024} MB。`,
    )
  }

  if (buffer.length === 0) {
    throw new Error(`${label}读取失败：文件为空。`)
  }

  const mime = detectMime(buffer, kind) ?? fallbackMimeByExtension(filePath, kind, format)
  const content = buffer.toString('base64')
  const uri = pathToFileURL(filePath).href
  const name = path.basename(filePath)

  return { uri, name, content, encoding: 'base64', mime }
}
