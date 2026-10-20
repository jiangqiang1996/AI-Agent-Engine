/**
 * AE 配置读取（零依赖，可复制到任意技能内部使用）
 *
 * 查找顺序：
 *   1. 环境变量 AE_CONFIG 指向的文件（显式覆盖，命中后不再继续查找）
 *   2. <cwd>/ae.jsonc
 *   3. 从 <cwd> 逐级向上查找 ae.jsonc（最近者胜）
 *   4. ~/.ae.jsonc
 *
 * 每个技能只读取自己在 ae.jsonc 中的顶层 key，互不干扰。
 *
 * 共享真源：tools/shared/ae-config.mjs
 * 同步到：skills/<skill>/scripts/lib/ae-config.mjs（由 tools/sync-shared.mjs 分发）
 */

import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'

/** 项目级配置文件名 */
export const CONFIG_FILENAME = 'ae.jsonc'

/**
 * 剥离 JSONC 注释与尾随逗号，输出标准 JSON 文本。
 * 字符串字面量内的行注释、块注释起始符和逗号都会被完整保留。
 */
export function stripJsonComments(text) {
  let out = ''
  let inString = false
  let inLineComment = false
  let inBlockComment = false
  let escaped = false

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    const next = text[i + 1]

    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false
        out += ch
      }
      continue
    }

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false
        i += 1
      } else if (ch === '\n') {
        out += ch
      }
      continue
    }

    if (inString) {
      out += ch
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === '"') {
        inString = false
      }
      continue
    }

    if (ch === '"') {
      inString = true
      out += ch
      continue
    }

    if (ch === '/' && next === '/') {
      inLineComment = true
      i += 1
      continue
    }

    if (ch === '/' && next === '*') {
      inBlockComment = true
      i += 1
      continue
    }

    out += ch
  }

  // 去掉对象/数组结尾的尾随逗号
  return out.replace(/,(\s*[}\]])/g, '$1')
}

/**
 * 解析 JSONC 文本。解析失败返回 null，不抛异常。
 *
 * 会剥离 UTF-8 BOM —— Windows 编辑器保存的 JSONC 常带 BOM，
 * 若不剥离，JSON.parse 会失败并静默退化成"空配置"。
 */
export function parseJsonc(text) {
  if (typeof text !== 'string') {
    return null
  }
  let source = text
  if (source.charCodeAt(0) === 0xfeff) {
    source = source.slice(1)
  }
  if (source.trim() === '') {
    return null
  }
  try {
    return JSON.parse(stripJsonComments(source))
  } catch {
    return null
  }
}

/**
 * 定位配置文件路径。
 * @param {object} [options]
 * @param {string} [options.cwd] 起始工作目录，默认 process.cwd()
 * @param {string} [options.env] 环境变量对象，默认 process.env
 * @returns {string|null} 命中的配置文件绝对路径；未找到返回 null
 */
export function resolveConfigPath(options = {}) {
  const cwd = resolve(options.cwd ?? process.cwd())
  const env = options.env ?? process.env

  const override = env.AE_CONFIG
  if (override && override.trim() !== '') {
    const overridePath = isAbsolute(override) ? override : resolve(cwd, override)
    return existsSync(overridePath) ? overridePath : null
  }

  const localCandidate = join(cwd, CONFIG_FILENAME)
  if (existsSync(localCandidate)) {
    return localCandidate
  }

  // 逐级向上查找
  let current = cwd
  for (;;) {
    const parent = dirname(current)
    if (parent === current) {
      break
    }
    current = parent
    const candidate = join(current, CONFIG_FILENAME)
    if (existsSync(candidate)) {
      return candidate
    }
  }

  const homeCandidate = join(homedir(), CONFIG_FILENAME)
  if (existsSync(homeCandidate)) {
    return homeCandidate
  }

  return null
}

/**
 * 读取 AE 配置。
 * @returns {{ config: object, configPath: string|null, source: 'env'|'project'|'home'|'default', parseError: string|null }}
 */
export function loadAeConfig(options = {}) {
  const cwd = resolve(options.cwd ?? process.cwd())
  const env = options.env ?? process.env
  const configPath = resolveConfigPath({ cwd, env })

  if (!configPath) {
    return { config: {}, configPath: null, source: 'default', parseError: null }
  }

  let source = 'project'
  if (env.AE_CONFIG && resolve(env.AE_CONFIG) === configPath) {
    source = 'env'
  } else if (configPath === join(homedir(), CONFIG_FILENAME)) {
    source = 'home'
  }

  let raw = ''
  try {
    raw = readFileSync(configPath, 'utf8')
  } catch (error) {
    return { config: {}, configPath, source, parseError: `读取失败：${error.message}` }
  }

  const parsed = parseJsonc(raw)
  if (!parsed) {
    return {
      config: {},
      configPath,
      source,
      parseError: '配置文件不是合法的 JSONC（注意尾随逗号与注释是否正确闭合）',
    }
  }
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { config: {}, configPath, source, parseError: '配置文件顶层必须是对象' }
  }

  return { config: parsed, configPath, source, parseError: null }
}

/**
 * 读取某个技能自己的配置分片。
 *
 * @param {string} skillKey 技能在 ae.jsonc 中的顶层 key，例如 "ae-xxx"
 * @param {object} [options] 透传给 loadAeConfig
 * @returns {{ value: object, configPath: string|null, source: string }}
 */
export function getSkillConfig(skillKey, options = {}) {
  const { config, configPath, source, parseError } = loadAeConfig(options)
  const raw = skillKey ? config[skillKey] : undefined
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  return { value, configPath, source, parseError }
}

/**
 * 读取技能配置里的单个字段，支持默认值与类型兜底。
 */
export function configValue(skillKey, field, fallback, options = {}) {
  const { value } = getSkillConfig(skillKey, options)
  const raw = value[field]
  if (raw === undefined || raw === null || raw === '') {
    return fallback
  }
  return raw
}

/**
 * 解析"命令名或路径"配置：若配置值是裸命令名，则尝试定位其可执行文件绝对路径。
 * 用于 ffmpeg / tesseract / whisper 等外部工具。
 */
export function resolveExternalCommand(commandName, env = process.env) {
  if (!commandName || typeof commandName !== 'string') {
    return null
  }
  if (commandName.includes('/') || commandName.includes('\\')) {
    return existsSync(commandName) ? commandName : null
  }
  const pathValue = env.PATH || ''
  const separator = pathValue.includes(';') ? ';' : ':'
  const extensions = process.platform === 'win32'
    ? (env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';')
    : ['']

  for (const dir of pathValue.split(separator)) {
    if (!dir) {
      continue
    }
    for (const extension of extensions) {
      const candidate = join(dir, `${commandName}${extension}`)
      if (existsSync(candidate)) {
        return candidate
      }
    }
  }
  return null
}
