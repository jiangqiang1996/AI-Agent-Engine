/**
 * AE 产物路径约定（零依赖，可复制到任意技能内部使用）
 *
 * 约定：
 *   - 持久产物：<cwd>/ae/<skill-slug>/
 *   - 临时产物：<cwd>/ae/<skill-slug>/tmp/
 *   - 日志：    <cwd>/ae/logs/<skill-slug>/
 *
 * <skill-slug> = 技能目录名去掉 "ae-" 前缀，例如 ae-pdf → pdf。
 *
 * 共享真源：tools/shared/ae-paths.mjs
 * 同步到：skills/<skill>/scripts/lib/ae-paths.mjs（由 tools/sync-shared.mjs 分发）
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

/** 产物根目录名 */
export const AE_ROOT_DIR = 'ae'

/** 日志根目录名（ae/logs） */
export const LOGS_DIR = 'logs'

/**
 * 把技能名转成产物子目录名。
 * "ae-pdf" → "pdf"，"ocr-code-review" → "ocr-code-review"
 */
export function skillSlug(skillName) {
  const name = String(skillName ?? '').trim()
  return name.startsWith('ae-') ? name.slice(3) : name
}

/**
 * 解析产物根目录绝对路径。
 * @param {string} [cwd] 默认 process.cwd()
 */
export function resolveAeRoot(cwd = process.cwd()) {
  return join(resolve(cwd), AE_ROOT_DIR)
}

/**
 * 技能的持久产物目录。
 */
export function skillArtifactDir(skillName, cwd = process.cwd()) {
  return join(resolveAeRoot(cwd), skillSlug(skillName))
}

/**
 * 技能的临时产物目录。
 */
export function skillTempDir(skillName, cwd = process.cwd()) {
  return join(skillArtifactDir(skillName, cwd), 'tmp')
}

/**
 * 技能的日志目录（统一在 ae/logs/<slug>）。
 */
export function skillLogDir(skillName, cwd = process.cwd()) {
  return join(resolveAeRoot(cwd), LOGS_DIR, skillSlug(skillName))
}

/**
 * 确保目录存在并返回其绝对路径。
 */
export function ensureDir(dirPath) {
  mkdirSync(dirPath, { recursive: true })
  return dirPath
}

/**
 * 生成 YYYYMMDD-HHMMSS 时间戳。
 */
export function timestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('')
}

/**
 * 生成带时间戳的文件名片段。
 */

/**
 * 去掉文件名扩展名（不做正则，避免模板字面量中的转义问题）。
 */
export function stripExtension(fileName) {
  const name = basename(fileName)
  const index = name.lastIndexOf('.')
  return index > 0 ? name.slice(0, index) : name
}
export function timestampedName(prefix, extension = '', date = new Date()) {
  const normalized = extension.startsWith('.') ? extension.slice(1) : extension
  const suffix = normalized ? '.' + normalized : ''
  return prefix + '-' + timestamp(date) + suffix
}
/**
 * 在技能日志目录写入一份日志，返回写入的绝对路径。
 *
 * @param {string} skillName 技能名
 * @param {string} label 日志标签
 * @param {string} content 日志内容
 * @param {object} [options]
 * @param {string} [options.cwd]
 * @returns {string} 日志文件绝对路径
 */
export function writeSkillLog(skillName, label, content, options = {}) {
  const dir = ensureDir(skillLogDir(skillName, options.cwd ?? process.cwd()))
  const safeLabel = String(label ?? 'log').replace(/[^a-zA-Z0-9._-]+/g, '-')
  const filePath = join(dir, `${timestamp()}-${safeLabel}.log`)
  writeFileSync(filePath, content ?? '', 'utf8')
  return filePath
}
