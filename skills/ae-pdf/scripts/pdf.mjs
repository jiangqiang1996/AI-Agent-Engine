#!/usr/bin/env node
/**
 * ae-pdf — PDF 处理 CLI（ae-pdf 技能自带脚本，零宿主依赖）
 *
 * 用法：node scripts/pdf.mjs <operation> [options]
 *
 * 操作：create / merge / split / extract-text / fill-form / rotate-pages /
 *      delete-pages / add-watermark / add-pages / update-page / to-markdown / to-image
 *
 * 输出契约：
 *   - stdout：单个 JSON 对象（成功含 ok:true，失败含 ok:false + error）
 *   - stderr：一行人类可读摘要（成功时）/ 一行错误信息（失败时）；--json 时不输出成功摘要
 *   - 产物：<cwd>/ae/pdf/      日志：<cwd>/ae/logs/pdf/
 *
 * 依赖（pdf-lib / @pdf-lib/fontkit / pdfjs-dist / @napi-rs/canvas / turndown /
 * mdast-util-from-markdown）一律从技能目录自身的 node_modules 解析，技能可独立拷走使用。
 */

import { randomBytes } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

/* ------------------------------------------------------------------ *
 * 常量与路径
 * ------------------------------------------------------------------ */

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const SKILL_DIR = path.dirname(SCRIPT_DIR)
/** 依赖解析基准：技能目录自身的 node_modules（技能独立安装时依然可用） */
const SKILL_REQUIRE = createRequire(path.join(SKILL_DIR, 'package.json'))

/** 产物目录（相对当前工作目录） */
const ARTIFACT_DIR = path.join(process.cwd(), 'ae', 'pdf')
/** 日志目录（相对当前工作目录） */
const LOG_DIR = path.join(process.cwd(), 'ae', 'logs', 'pdf')

const OPERATIONS = [
  'create',
  'merge',
  'split',
  'extract-text',
  'fill-form',
  'rotate-pages',
  'delete-pages',
  'add-watermark',
  'add-pages',
  'update-page',
  'to-markdown',
  'to-image',
]

/** extract-text 返回的最大字符数，超出截断 */
const PDF_EXTRACT_TEXT_MAX_CHARS = 8000
/** 单次调用允许的最大页数（超过请分批 add-pages） */
const MAX_PAGES_PER_CALL = 30

const PAGE_SIZES = {
  A4: [595.28, 841.89],
  Letter: [612, 792],
  Legal: [612, 1008],
}

const CJK_FONT_FILES = {
  NotoSansSC: ['NotoSansSC-VF.ttf', 'NotoSansCJKsc-Regular.ttf', 'NotoSansSC-Regular.otf', 'NotoSansSC-Regular.ttf'],
  NotoSansSCBold: ['NotoSansSC-Bold.ttf', 'NotoSansSC-Bold.otf', 'NotoSansCJKsc-Bold.ttf'],
  SimHei: ['simhei.ttf', 'SimHei.ttf'],
  MSYH: ['msyh.ttc', 'MSYH.TTC', 'msyh.ttf'],
  MSYHBD: ['msyhbd.ttc', 'MSYHBD.TTC', 'msyhbd.ttf'],
}

const SYSTEM_FONT_DIRS = (() => {
  const dirs = []
  const platform = process.platform
  if (platform === 'win32') {
    dirs.push('C:\\Windows\\Fonts')
    dirs.push(path.join(homedir(), 'AppData', 'Local', 'Microsoft', 'Windows', 'Fonts'))
  } else if (platform === 'darwin') {
    dirs.push('/System/Library/Fonts')
    dirs.push('/Library/Fonts')
    dirs.push(path.join(homedir(), 'Library', 'Fonts'))
  } else {
    dirs.push('/usr/share/fonts')
    dirs.push('/usr/local/share/fonts')
    dirs.push(path.join(homedir(), '.local', 'share', 'fonts'))
    dirs.push(path.join(homedir(), '.fonts'))
  }
  return dirs
})()

const CJK_CHAR_REGEX = /[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff00-\uffef\uac00-\ud7af\u3040-\u309f\u30a0-\u30ff]/

const DEFAULT_CJK_REGULAR = 'NotoSansSC'
const DEFAULT_CJK_BOLD = 'NotoSansSCBold'

/* ------------------------------------------------------------------ *
 * 错误类型
 * ------------------------------------------------------------------ */

/** 参数/用法错误 */
class UsageError extends Error {
  constructor(message) {
    super(message)
    this.name = 'UsageError'
  }
}

/** 依赖缺失（未执行 npm install） */
class DependencyError extends Error {
  constructor(specifier, cause) {
    const raw = cause?.message ?? String(cause)
    const brief = raw.split('\n')[0]
    super(
      `缺少依赖 "${specifier}"。请在技能目录执行一次安装：\n` +
        `  cd "${SKILL_DIR}"\n` +
        `  npm install            # 或 npm run setup\n` +
        `原始错误：${brief}`,
    )
    this.name = 'DependencyError'
    this.specifier = specifier
  }
}

/** 业务执行错误 */
class OperationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'OperationError'
  }
}

/* ------------------------------------------------------------------ *
 * 依赖加载（惰性：只有真正需要时才加载，便于无依赖环境做参数校验）
 * ------------------------------------------------------------------ */

const dependencyCache = new Map()

function requireDependency(specifier) {
  if (dependencyCache.has(specifier)) return dependencyCache.get(specifier)
  let loaded
  try {
    loaded = SKILL_REQUIRE(specifier)
  } catch (error) {
    throw new DependencyError(specifier, error)
  }
  dependencyCache.set(specifier, loaded)
  return loaded
}

async function importDependency(specifier) {
  if (dependencyCache.has(specifier)) return dependencyCache.get(specifier)
  let loaded
  try {
    loaded = await import(specifier)
  } catch (error) {
    throw new DependencyError(specifier, error)
  }
  dependencyCache.set(specifier, loaded)
  return loaded
}

function loadPdfLib() {
  return requireDependency('pdf-lib')
}

function loadFontkit() {
  const mod = requireDependency('@pdf-lib/fontkit')
  return mod?.default ?? mod
}

function getPdfjsDistRoot() {
  try {
    return path.dirname(SKILL_REQUIRE.resolve('pdfjs-dist/package.json'))
  } catch {
    return null
  }
}

function getStandardFontDataUrl() {
  const root = getPdfjsDistRoot()
  return root ? `${root.replace(/\\/g, '/')}/standard_fonts/` : ''
}

function getCmapUrl() {
  const root = getPdfjsDistRoot()
  return root ? `${root.replace(/\\/g, '/')}/cmaps/` : ''
}

let workerBootstrapPromise = null

/** pdfjs-dist 在 Node 下需要先加载 worker 模块（fake worker 模式） */
async function ensurePdfWorkerBootstrap() {
  if (globalThis.pdfjsWorker) return
  if (!workerBootstrapPromise) {
    workerBootstrapPromise = (async () => {
      const worker = await importDependency('pdfjs-dist/legacy/build/pdf.worker.mjs')
      globalThis.pdfjsWorker = worker
    })().catch((error) => {
      workerBootstrapPromise = null
      throw error
    })
  }
  return workerBootstrapPromise
}

/** 解析 pdfjs worker 文件路径（兼容 legacy/build、build、mjs、js 多种结构） */
function resolveWorkerPath() {
  const candidates = [
    'pdfjs-dist/legacy/build/pdf.worker.mjs',
    'pdfjs-dist/build/pdf.worker.mjs',
    'pdfjs-dist/legacy/build/pdf.worker.js',
    'pdfjs-dist/build/pdf.worker.js',
  ]
  for (const candidate of candidates) {
    try {
      const resolved = SKILL_REQUIRE.resolve(candidate)
      if (resolved && existsSync(resolved)) return resolved
    } catch {
      /* 继续尝试下一个候选路径 */
    }
  }
  for (const mainModule of ['pdfjs-dist/legacy/build/pdf.mjs', 'pdfjs-dist/build/pdf.mjs']) {
    try {
      const mainPath = SKILL_REQUIRE.resolve(mainModule)
      for (const workerName of ['pdf.worker.mjs', 'pdf.worker.js']) {
        const workerPath = path.join(path.dirname(mainPath), workerName)
        if (existsSync(workerPath)) return workerPath
      }
    } catch {
      /* 继续 */
    }
  }
  return null
}

/* ------------------------------------------------------------------ *
 * 参数解析
 * ------------------------------------------------------------------ */

const FLAG_TYPES = {
  file: 'string',
  files: 'variadic',
  output: 'string',
  'output-dir': 'string',
  title: 'string',
  pages: 'string',
  'pages-file': 'string',
  elements: 'string',
  'elements-file': 'string',
  fields: 'string',
  'fields-file': 'string',
  field: 'list',
  metadata: 'string',
  'metadata-file': 'string',
  watermark: 'string',
  'watermark-file': 'string',
  text: 'string',
  'font-size': 'number',
  color: 'string',
  opacity: 'number',
  rotation: 'number',
  'page-index': 'number',
  'page-indices': 'string',
  'image-pages': 'string',
  scale: 'number',
  'cjk-font-path': 'string',
  'max-chars': 'number',
  inline: 'boolean',
  json: 'boolean',
  quiet: 'boolean',
  help: 'boolean',
}

function parseArgs(argv) {
  const options = {}
  const positionals = []
  let index = 0

  while (index < argv.length) {
    const token = argv[index]

    if (token === '--') {
      positionals.push(...argv.slice(index + 1))
      break
    }

    if (!token.startsWith('--')) {
      positionals.push(token)
      index += 1
      continue
    }

    const eq = token.indexOf('=')
    const name = eq === -1 ? token.slice(2) : token.slice(2, eq)
    const type = FLAG_TYPES[name]
    if (!type) {
      throw new UsageError(`未知参数 --${name}。使用 --help 查看全部可用参数。`)
    }

    if (type === 'boolean') {
      if (eq !== -1) throw new UsageError(`参数 --${name} 不接受取值。`)
      options[name] = true
      index += 1
      continue
    }

    if (type === 'variadic') {
      const values = []
      if (eq !== -1) {
        values.push(token.slice(eq + 1))
        index += 1
      } else {
        index += 1
        while (index < argv.length && !argv[index].startsWith('--')) {
          values.push(argv[index])
          index += 1
        }
        if (values.length === 0) throw new UsageError(`参数 --${name} 缺少取值。`)
      }
      options[name] = [...(options[name] ?? []), ...values]
      continue
    }

    let value
    if (eq !== -1) {
      value = token.slice(eq + 1)
      index += 1
    } else {
      const next = argv[index + 1]
      if (next === undefined || next.startsWith('--')) {
        throw new UsageError(`参数 --${name} 缺少取值。`)
      }
      value = next
      index += 2
    }

    if (type === 'list') {
      options[name] = [...(options[name] ?? []), value]
    } else {
      if (options[name] !== undefined) throw new UsageError(`参数 --${name} 重复指定。`)
      options[name] = value
    }
  }

  return { positionals, options }
}

/* ------------------------------------------------------------------ *
 * 参数辅助
 * ------------------------------------------------------------------ */

function parseNumberOption(value, name) {
  const num = Number(value)
  if (!Number.isFinite(num)) {
    throw new UsageError(`参数 --${name} 需要数字，收到 "${value}"。`)
  }
  return num
}

function parseNumberList(value, name) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .map((item) => {
      const num = Number(item)
      if (!Number.isInteger(num)) {
        throw new UsageError(`参数 --${name} 需要整数列表（逗号分隔），收到 "${item}"。`)
      }
      return num
    })
}

function parseColorOption(value, name) {
  const raw = value.trim()
  if (raw.startsWith('#')) {
    const hex = raw.slice(1)
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
      throw new UsageError(`参数 --${name} 的十六进制颜色格式应为 #RRGGBB，收到 "${raw}"。`)
    }
    return {
      r: parseInt(hex.slice(0, 2), 16) / 255,
      g: parseInt(hex.slice(2, 4), 16) / 255,
      b: parseInt(hex.slice(4, 6), 16) / 255,
    }
  }
  const parts = raw.split(',').map((item) => Number(item.trim()))
  if (parts.length !== 3 || parts.some((item) => !Number.isFinite(item))) {
    throw new UsageError(`参数 --${name} 需要 3 个 0-1 之间的数值（如 1,0,0）或 #RRGGBB，收到 "${raw}"。`)
  }
  return { r: parts[0], g: parts[1], b: parts[2] }
}

/**
 * 宽松 JSON 解析：先按标准 JSON 解析；失败时把「字符串外的单引号」转成双引号再试一次。
 * 目的是兼容 PowerShell 等会把内联 JSON 的双引号吞掉的 shell。
 */
function parseJsonLoose(text) {
  try {
    return { value: JSON.parse(text) }
  } catch (error) {
    let converted = ''
    let inString = false
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i]
      if (char === '\\' && inString) {
        converted += char + (text[i + 1] ?? '')
        i += 1
        continue
      }
      if (char === '"') {
        inString = !inString
        converted += char
        continue
      }
      if (char === "'" && !inString) {
        converted += '"'
        continue
      }
      converted += char
    }
    try {
      return { value: JSON.parse(converted) }
    } catch {
      return { error: error.message }
    }
  }
}

function readJsonOption(options, key, fileKey) {
  const inline = options[key]
  const file = options[fileKey]
  if (inline !== undefined && file !== undefined) {
    throw new UsageError(`--${key} 与 --${fileKey} 只能二选一。`)
  }
  if (inline !== undefined) {
    const parsed = parseJsonLoose(inline)
    if (parsed.error) {
      throw new UsageError(`--${key} 不是合法 JSON：${parsed.error}`)
    }
    return parsed.value
  }
  if (file !== undefined) {
    if (!existsSync(file)) throw new UsageError(`文件不存在：${file}`)
    try {
      return JSON.parse(readFileSync(file, 'utf8'))
    } catch (error) {
      throw new UsageError(`无法解析 JSON 文件 ${file}：${error.message}`)
    }
  }
  return undefined
}

/**
 * 校验并返回 --file 参数。
 * 只做「参数是否给出」的校验，文件是否存在在各操作完成参数校验后再检查，
 * 这样用户能一次看到最直接的参数错误。
 */
function requireFileOption(options, operation) {
  const file = options.file
  if (!file) {
    throw new UsageError(`${operation} 操作需要 --file <路径> 指定输入 PDF。`)
  }
  return file
}

function assertFileExists(filePath) {
  if (!existsSync(filePath)) {
    throw new UsageError(`文件不存在：${filePath}`)
  }
  if (!statSync(filePath).isFile()) {
    throw new UsageError(`不是文件（可能是目录）：${filePath}`)
  }
}

/* ------------------------------------------------------------------ *
 * 输出辅助
 * ------------------------------------------------------------------ */

function formatTimestamp(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  )
}

/** 非 ASCII 字符替换为连字符，保证文件名跨平台安全 */
function sanitizeBaseName(baseName) {
  const sanitized = String(baseName ?? '')
    .replace(/[^\x20-\x7E]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return sanitized || 'output'
}

function generateOutputPath(dir, operation, extension, baseName) {
  const rawName = baseName ? path.basename(baseName, `.${extension}`) : operation
  const nameBase = sanitizeBaseName(rawName)
  const timestamp = formatTimestamp(new Date())
  const random = randomBytes(3).toString('hex')
  return path.join(dir, `${nameBase}-${operation}-${timestamp}-${random}.${extension}`)
}

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true })
}

/** 原地修改前备份，失败时回滚 */
function withBackup(filePath, operation) {
  if (!existsSync(filePath)) return operation()
  const backupPath = `${filePath}.bak`
  copyFileSync(filePath, backupPath)
  try {
    const result = operation()
    if (existsSync(backupPath)) unlinkSync(backupPath)
    return result
  } catch (error) {
    if (existsSync(backupPath)) {
      copyFileSync(backupPath, filePath)
      unlinkSync(backupPath)
    }
    throw error
  }
}

/**
 * 写出 PDF 字节：
 * - targetPath 与 sourceFile 相同 → 原地修改（自动备份/回滚）
 * - 否则 → 写入新文件
 */
function writePdfBytes(targetPath, bytes, sourceFile) {
  const buffer = Buffer.from(bytes)
  if (sourceFile && path.resolve(targetPath) === path.resolve(sourceFile)) {
    withBackup(sourceFile, () => writeFileSync(targetPath, buffer))
    return targetPath
  }
  ensureDir(path.dirname(targetPath))
  writeFileSync(targetPath, buffer)
  return targetPath
}

/* ------------------------------------------------------------------ *
 * 字体 / 颜色 / 元素绘制
 * ------------------------------------------------------------------ */

function hasCjkChar(text) {
  return CJK_CHAR_REGEX.test(text)
}

function isCjkFont(name) {
  return Object.prototype.hasOwnProperty.call(CJK_FONT_FILES, name)
}

function findSystemCjkFont(cjkName) {
  for (const dir of SYSTEM_FONT_DIRS) {
    for (const filename of CJK_FONT_FILES[cjkName]) {
      const fullPath = path.join(dir, filename)
      if (existsSync(fullPath)) return fullPath
    }
  }
  return null
}

/** 记录实际使用的 CJK 字体（发生降级时写进结果 meta，便于提示用户） */
const fontFallbacks = []

/**
 * 解析 CJK 字体文件：
 * 1. 优先使用指定字体自身的文件；
 * 2. 找不到时按 MSYH / MSYHBD / SimHei / NotoSansSC 顺序降级，保证开箱可用；
 * 3. 全部找不到才报错。
 */
function resolveCjkFontPath(cjkName, customCjkFontPath) {
  if (customCjkFontPath) {
    if (!existsSync(customCjkFontPath)) {
      throw new OperationError(`CJK 字体文件不存在：${customCjkFontPath}`)
    }
    return { fontPath: customCjkFontPath, used: cjkName, fallback: false }
  }

  const direct = findSystemCjkFont(cjkName)
  if (direct) return { fontPath: direct, used: cjkName, fallback: false }

  const candidates = cjkName.includes('Bold')
    ? ['MSYHBD', 'MSYH', 'SimHei', 'NotoSansSC']
    : ['MSYH', 'SimHei', 'NotoSansSC']
  for (const candidate of candidates) {
    if (candidate === cjkName) continue
    const found = findSystemCjkFont(candidate)
    if (found) return { fontPath: found, used: candidate, fallback: true }
  }
  return null
}

let standardFontMapCache = null

function buildStandardFontMap(StandardFonts) {
  if (standardFontMapCache) return standardFontMapCache
  standardFontMapCache = {
    Helvetica: StandardFonts.Helvetica,
    HelveticaBold: StandardFonts.HelveticaBold,
    HelveticaOblique: StandardFonts.HelveticaOblique,
    HelveticaBoldOblique: StandardFonts.HelveticaBoldOblique,
    TimesRoman: StandardFonts.TimesRoman,
    TimesRomanBold: StandardFonts.TimesRomanBold,
    TimesRomanItalic: StandardFonts.TimesRomanItalic,
    TimesRomanBoldItalic: StandardFonts.TimesRomanBoldItalic,
    Courier: StandardFonts.Courier,
    CourierBold: StandardFonts.CourierBold,
    CourierOblique: StandardFonts.CourierOblique,
    CourierBoldOblique: StandardFonts.CourierBoldOblique,
  }
  return standardFontMapCache
}

function toColor(color, rgb) {
  if (!color) return undefined
  const clamp = (v) => (v > 1 ? v / 255 : v < 0 ? 0 : v)
  return rgb(clamp(color.r), clamp(color.g), clamp(color.b))
}

function isJpg(bytes) {
  return bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8
}

function resolvePageSize(size) {
  if (Array.isArray(size) && size.length === 2) return size
  const key = size ?? 'A4'
  return PAGE_SIZES[key] ?? PAGE_SIZES.A4
}

async function getFont(doc, name, cache, customCjkFontPath, standardFonts, rgb) {
  if (cache[name]) return cache[name]

  if (isCjkFont(name)) {
    doc.registerFontkit(loadFontkit())
    const resolved = resolveCjkFontPath(name, customCjkFontPath)
    if (!resolved) {
      throw new OperationError(
        `找不到 CJK 字体 "${name}" 的文件（候选文件名：${CJK_FONT_FILES[name].join('、')}，` +
          `搜索目录：${SYSTEM_FONT_DIRS.join('、')}）。请安装对应字体，或用 --cjk-font-path 指定字体文件路径。`,
      )
    }
    if (resolved.fallback) {
      fontFallbacks.push({ requested: name, used: resolved.used, fontPath: resolved.fontPath })
    }
    cache[name] = await doc.embedFont(readFileSync(resolved.fontPath))
    return cache[name]
  }

  const standard = buildStandardFontMap(standardFonts)[name]
  if (!standard) {
    throw new UsageError(
      `不支持的字体 "${name}"。可用标准字体：${Object.keys(buildStandardFontMap(standardFonts)).join('、')}；` +
        `CJK 字体：${Object.keys(CJK_FONT_FILES).join('、')}`,
    )
  }
  cache[name] = await doc.embedFont(standard)
  return cache[name]
}

async function drawElement(doc, page, element, fontCache, customCjkFontPath, standardFonts, rgb, autoLayout) {
  switch (element.type) {
    case 'text': {
      const textContent = element.text ?? ''
      const fontName = element.font ?? (hasCjkChar(textContent) ? DEFAULT_CJK_REGULAR : 'Helvetica')
      const font = await getFont(doc, fontName, fontCache, customCjkFontPath, standardFonts, rgb)
      const size = element.fontSize ?? 12
      const color = toColor(element.color, rgb) ?? rgb(0, 0, 0)
      const lines = textContent.split('\n')
      const lineHeight = element.lineHeight ?? size + 6
      const pageHeight = page.getHeight()
      const startX = element.x ?? 50

      let y
      if (element.y !== undefined) {
        y = element.y
      } else if (autoLayout) {
        y = autoLayout.nextY
      } else {
        y = pageHeight - 50
      }

      for (const line of lines) {
        if (line.length > 0) {
          page.drawText(line, { x: startX, y, size, font, color })
        }
        y -= lineHeight
      }

      return { nextY: y, pageHeight }
    }
    case 'rect': {
      page.drawRectangle({
        x: element.x ?? 0,
        y: element.y ?? 0,
        width: element.width ?? 100,
        height: element.height ?? 50,
        borderColor: toColor(element.borderColor, rgb),
        borderWidth: element.borderWidth,
        color: toColor(element.fillColor, rgb),
        opacity: element.opacity,
      })
      break
    }
    case 'ellipse': {
      page.drawEllipse({
        x: element.x ?? 0,
        y: element.y ?? 0,
        xScale: (element.width ?? 100) / 2,
        yScale: (element.height ?? 50) / 2,
        borderColor: toColor(element.borderColor, rgb),
        borderWidth: element.borderWidth,
        color: toColor(element.fillColor, rgb),
        opacity: element.opacity,
      })
      break
    }
    case 'line': {
      page.drawLine({
        start: { x: element.x ?? 0, y: element.y ?? 0 },
        end: { x: element.x2 ?? 0, y: element.y2 ?? 0 },
        thickness: element.thickness ?? 1,
        color: toColor(element.color, rgb) ?? rgb(0, 0, 0),
      })
      break
    }
    case 'image': {
      let image
      if (element.imagePath) {
        if (!existsSync(element.imagePath)) {
          throw new OperationError(`图片文件不存在：${element.imagePath}`)
        }
        const imageBytes = readFileSync(element.imagePath)
        image = isJpg(imageBytes)
          ? await doc.embedJpg(imageBytes)
          : await doc.embedPng(imageBytes)
      } else if (element.imageData) {
        const raw = element.imageData.split(',')[1] ?? element.imageData
        const imageBytes = Buffer.from(raw, 'base64')
        image = isJpg(imageBytes)
          ? await doc.embedJpg(imageBytes)
          : await doc.embedPng(imageBytes)
      }
      if (image) {
        page.drawImage(image, {
          x: element.x ?? 0,
          y: element.y ?? 0,
          width: element.imageWidth ?? image.width,
          height: element.imageHeight ?? image.height,
        })
      }
      break
    }
    default:
      throw new UsageError(`不支持的元素类型："${element.type}"。可用：text、rect、ellipse、line、image。`)
  }
  return undefined
}

function applyMetadata(doc, metadata, title) {
  if (metadata) {
    if (metadata.title) doc.setTitle(metadata.title)
    if (metadata.author) doc.setAuthor(metadata.author)
    if (metadata.subject) doc.setSubject(metadata.subject)
    if (metadata.keywords) doc.setKeywords(metadata.keywords)
    if (metadata.creator) doc.setCreator(metadata.creator)
    if (metadata.producer) doc.setProducer(metadata.producer)
    if (metadata.creationDate) doc.setCreationDate(new Date(metadata.creationDate))
    if (metadata.modificationDate) doc.setModificationDate(new Date(metadata.modificationDate))
  }
  if (title) doc.setTitle(title)
}

/** 把 pages 数组中的单页规格绘制到文档（create / add-pages 共用） */
async function renderPageSpec(doc, pageSpec, context) {
  const { fontCache, cjkFontPath, standardFonts, rgb } = context
  const [width, height] = resolvePageSize(pageSpec.size)
  const page = doc.addPage([width, height])

  // 兼容旧模式：仅有 text/fontSize
  if (pageSpec.text && !pageSpec.elements) {
    const legacyFontName = hasCjkChar(pageSpec.text) ? DEFAULT_CJK_REGULAR : 'Helvetica'
    const font = await getFont(doc, legacyFontName, fontCache, cjkFontPath, standardFonts, rgb)
    const fontSize = pageSpec.fontSize ?? 12
    const lines = pageSpec.text.split('\n')
    let y = height - 50
    for (const line of lines) {
      if (line.length > 0) {
        page.drawText(line, { x: 50, y, size: fontSize, font, color: rgb(0, 0, 0) })
      }
      y -= fontSize + 6
      if (y < 50) break
    }
  }

  // 元素化绘制（未指定坐标的文本元素自动向下排列防重叠）
  if (pageSpec.elements) {
    if (!Array.isArray(pageSpec.elements)) {
      throw new UsageError('页面 elements 必须是数组。')
    }
    let autoLayout
    for (const element of pageSpec.elements) {
      const result = await drawElement(
        doc,
        page,
        element,
        fontCache,
        cjkFontPath,
        standardFonts,
        rgb,
        autoLayout,
      )
      if (result) autoLayout = result
    }
  }

  return page
}

/* ------------------------------------------------------------------ *
 * PDF → Markdown（pdfjs-dist 文本抽取 + 表格识别）
 * ------------------------------------------------------------------ */

const PARTIAL_NUMBERING_PATTERN = /^\.\d+$/

function isTextItem(item) {
  return typeof item === 'object' && item !== null && 'str' in item && 'transform' in item
}

function mergePartialNumberingLines(text) {
  const lines = text.split('\n')
  const resultLines = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const stripped = line.trim()
    if (PARTIAL_NUMBERING_PATTERN.test(stripped)) {
      let j = i + 1
      while (j < lines.length && !lines[j].trim()) j += 1
      if (j < lines.length) {
        resultLines.push(`${stripped} ${lines[j].trim()}`)
        i = j + 1
      } else {
        resultLines.push(line)
        i += 1
      }
    } else {
      resultLines.push(line)
      i += 1
    }
  }
  return resultLines.join('\n')
}

function extractWordsFromTextContent(items, pageHeight) {
  const words = []
  for (const item of items) {
    if (!item.str || !item.str.trim()) continue
    const x0 = item.transform[4]
    const y = item.transform[5]
    const height = item.height || 0
    words.push({ x0, x1: x0 + item.width, top: pageHeight - y - height, bottom: pageHeight - y, text: item.str })
  }
  return words
}

function assemblePlainText(items) {
  const lines = []
  let currentLine = ''
  for (const item of items) {
    currentLine += item.str
    if (item.hasEOL) {
      lines.push(currentLine)
      currentLine = ''
    }
  }
  if (currentLine) lines.push(currentLine)
  return lines.join('\n')
}

/** 通过词坐标聚类识别表格区域；识别失败时返回 null（退回纯文本） */
function extractFormContentFromWords(words, pageWidth) {
  if (!words.length) return null

  const yTolerance = 5
  const rowsByY = new Map()
  for (const word of words) {
    const yKey = Math.round(word.top / yTolerance) * yTolerance
    if (!rowsByY.has(yKey)) rowsByY.set(yKey, [])
    rowsByY.get(yKey).push(word)
  }

  const sortedYKeys = [...rowsByY.keys()].sort((a, b) => a - b)
  const rowInfo = []
  for (const yKey of sortedYKeys) {
    const rowWords = [...rowsByY.get(yKey)].sort((a, b) => a.x0 - b.x0)
    if (!rowWords.length) continue

    const firstX0 = rowWords[0].x0
    const lastX1 = rowWords[rowWords.length - 1].x1
    const lineWidth = lastX1 - firstX0
    const combinedText = rowWords.map((w) => w.text).join(' ')

    const xPositions = rowWords.map((w) => w.x0).sort((a, b) => a - b)
    const xGroups = []
    for (const x of xPositions) {
      if (!xGroups.length || x - xGroups[xGroups.length - 1] > 50) xGroups.push(x)
    }

    const isParagraph = lineWidth > pageWidth * 0.55 && combinedText.length > 60
    const firstWord = rowWords[0].text.trim()
    const hasPartialNumbering = PARTIAL_NUMBERING_PATTERN.test(firstWord)

    rowInfo.push({
      yKey,
      words: rowWords,
      text: combinedText,
      xGroups,
      isParagraph,
      numColumns: xGroups.length,
      hasPartialNumbering,
    })
  }

  const allTableXPositions = []
  for (const info of rowInfo) {
    if (info.numColumns >= 3 && !info.isParagraph) {
      allTableXPositions.push(...info.xGroups)
    }
  }
  if (!allTableXPositions.length) return null
  allTableXPositions.sort((a, b) => a - b)

  const gaps = []
  for (let i = 0; i < allTableXPositions.length - 1; i += 1) {
    const gap = allTableXPositions[i + 1] - allTableXPositions[i]
    if (gap > 5) gaps.push(gap)
  }

  let adaptiveTolerance
  if (gaps.length >= 3) {
    const sortedGaps = [...gaps].sort((a, b) => a - b)
    adaptiveTolerance = Math.max(25, Math.min(50, sortedGaps[Math.floor(sortedGaps.length * 0.7)]))
  } else {
    adaptiveTolerance = 35
  }

  const globalColumns = []
  for (const x of allTableXPositions) {
    if (!globalColumns.length || x - globalColumns[globalColumns.length - 1] > adaptiveTolerance) {
      globalColumns.push(x)
    }
  }

  if (globalColumns.length <= 1) return null
  const contentWidth = globalColumns[globalColumns.length - 1] - globalColumns[0]
  const avgColWidth = contentWidth / globalColumns.length
  if (avgColWidth < 30) return null
  const columnsPerInch = globalColumns.length / (contentWidth / 72)
  if (columnsPerInch > 10) return null
  const adaptiveMaxColumns = Math.max(15, Math.floor(20 * (pageWidth / 612)))
  if (globalColumns.length > adaptiveMaxColumns) return null

  for (const info of rowInfo) {
    if (info.isParagraph || info.hasPartialNumbering) {
      info.isTableRow = false
      continue
    }
    const alignedColumns = new Set()
    for (const word of info.words) {
      for (let colIdx = 0; colIdx < globalColumns.length; colIdx += 1) {
        if (Math.abs(word.x0 - globalColumns[colIdx]) < 40) {
          alignedColumns.add(colIdx)
          break
        }
      }
    }
    info.isTableRow = alignedColumns.size >= 2
  }

  const tableRegions = []
  let i = 0
  while (i < rowInfo.length) {
    if (rowInfo[i].isTableRow) {
      const startIdx = i
      while (i < rowInfo.length && rowInfo[i].isTableRow) i += 1
      if (i - startIdx >= 3) tableRegions.push([startIdx, i])
    } else {
      i += 1
    }
  }

  const totalTableRows = tableRegions.reduce((sum, [start, end]) => sum + (end - start), 0)
  if (rowInfo.length > 0 && totalTableRows / rowInfo.length < 0.25) return null
  if (tableRegions.length === 0) return null

  const resultLines = []
  const numCols = globalColumns.length

  const extractCells = (info) => {
    const cells = new Array(numCols).fill('')
    for (const word of info.words) {
      let assignedCol = numCols - 1
      for (let colIdx = 0; colIdx < numCols - 1; colIdx += 1) {
        if (word.x0 < globalColumns[colIdx + 1] - 20) {
          assignedCol = colIdx
          break
        }
      }
      if (cells[assignedCol]) cells[assignedCol] += ` ${word.text}`
      else cells[assignedCol] = word.text
    }
    return cells
  }

  let idx = 0
  while (idx < rowInfo.length) {
    const info = rowInfo[idx]
    const tableRegion = tableRegions.find(([start]) => start === idx)
    if (tableRegion) {
      const [start, end] = tableRegion
      const tableData = []
      for (let tableIdx = start; tableIdx < end; tableIdx += 1) {
        tableData.push(extractCells(rowInfo[tableIdx]))
      }
      if (tableData.length) {
        const colWidths = Array.from({ length: numCols }, (_, col) => {
          let maxLen = 0
          for (const row of tableData) {
            const cell = row[col] ?? ''
            if (cell.length > maxLen) maxLen = cell.length
          }
          return Math.max(maxLen, 3)
        })
        const header = tableData[0]
        resultLines.push(`| ${header.map((cell, idx2) => cell.padEnd(colWidths[idx2])).join(' | ')} |`)
        resultLines.push(`| ${colWidths.map((w) => '-'.repeat(w)).join(' | ')} |`)
        for (let r = 1; r < tableData.length; r += 1) {
          const row = tableData[r]
          resultLines.push(`| ${row.map((cell, idx2) => cell.padEnd(colWidths[idx2])).join(' | ')} |`)
        }
      }
      idx = end
    } else {
      const inTable = tableRegions.some(([start, end]) => start < idx && idx < end)
      if (!inTable) resultLines.push(info.text)
      idx += 1
    }
  }

  return resultLines.join('\n')
}

/** 把可能含 HTML 标签的行转成 Markdown（turndown） */
function normalizeHtmlFragments(markdown) {
  const TurndownService = requireDependency('turndown')
  const service = new TurndownService()
  return markdown
    .split('\n')
    .map((line) => (/<\/?[a-z][^>]*>/i.test(line) ? service.turndown(line) : line))
    .join('\n')
}

/** 解析 Markdown 得到结构摘要（标题层级、表格数量） */
async function summarizeMarkdown(markdown) {
  // 依赖缺失必须显式报错，不能被下面的容错吞掉
  const { fromMarkdown } = await importDependency('mdast-util-from-markdown')
  const summary = { headings: [], tables: 0 }
  try {
    const tree = fromMarkdown(markdown)
    const walk = (node) => {
      if (!node || typeof node !== 'object') return
      if (node.type === 'heading') {
        const text = (node.children ?? [])
          .map((child) => (typeof child.value === 'string' ? child.value : ''))
          .join('')
          .trim()
        summary.headings.push({ depth: node.depth ?? 1, text })
      }
      if (node.type === 'table') summary.tables += 1
      for (const child of node.children ?? []) walk(child)
    }
    walk(tree)
  } catch {
    /* 结构摘要失败不影响主流程 */
  }
  return summary
}

/**
 * 保护 stdout：pdfjs 等第三方库可能用 console.log 输出告警，
 * 会污染 stdout 的 JSON 契约。执行期间把 console.log 重定向到 stderr。
 */
async function withStdoutGuard(fn) {
  const originalLog = console.log
  console.log = (...args) => {
    process.stderr.write(`${args.map((item) => (typeof item === 'string' ? item : String(item))).join(' ')}\n`)
  }
  try {
    return await fn()
  } finally {
    console.log = originalLog
  }
}

async function convertPdfToMarkdown(filePath) {
  await ensurePdfWorkerBootstrap()
  const pdfjs = await importDependency('pdfjs-dist/legacy/build/pdf.mjs')

  const data = new Uint8Array(readFileSync(filePath))
  const loadingTask = pdfjs.getDocument({
    data,
    useSystemFonts: false,
    standardFontDataUrl: getStandardFontDataUrl(),
    cMapUrl: getCmapUrl(),
    cMapPacked: true,
  })
  const doc = await loadingTask.promise
  const totalPages = doc.numPages

  const markdownChunks = []
  let pageCount = 0
  let tablePageCount = 0

  try {
    for (let pageIdx = 1; pageIdx <= totalPages; pageIdx += 1) {
      const page = await doc.getPage(pageIdx)
      try {
        pageCount += 1
        const viewport = page.getViewport({ scale: 1 })
        const pageWidth = viewport.width
        const pageHeight = viewport.height
        const textContent = await page.getTextContent()
        const textItems = textContent.items.filter(isTextItem)

        const words = extractWordsFromTextContent(textItems, pageHeight)
        const formContent = extractFormContentFromWords(words, pageWidth)

        if (formContent !== null) {
          tablePageCount += 1
          if (formContent.trim()) markdownChunks.push(formContent)
        } else {
          const text = assemblePlainText(textItems).trim()
          if (text) markdownChunks.push(text)
        }
      } finally {
        page.cleanup()
      }
    }
  } finally {
    await loadingTask.destroy()
  }

  const merged = mergePartialNumberingLines(markdownChunks.join('\n\n').trim())
  return { markdown: normalizeHtmlFragments(merged), pageCount, tablePageCount }
}

/** 提取纯文本（extract-text） */
async function extractPdfText(filePath, maxChars) {
  await ensurePdfWorkerBootstrap()
  const pdfjs = await importDependency('pdfjs-dist/legacy/build/pdf.mjs')

  const data = new Uint8Array(readFileSync(filePath))
  const loadingTask = pdfjs.getDocument({
    data,
    useSystemFonts: false,
    standardFontDataUrl: getStandardFontDataUrl(),
    cMapUrl: getCmapUrl(),
    cMapPacked: true,
  })
  const doc = await loadingTask.promise
  const totalPages = doc.numPages

  const chunks = []
  try {
    for (let pageIdx = 1; pageIdx <= totalPages; pageIdx += 1) {
      const page = await doc.getPage(pageIdx)
      try {
        const textContent = await page.getTextContent()
        const textItems = textContent.items.filter(isTextItem)
        const text = assemblePlainText(textItems).trim()
        if (text) chunks.push(text)
      } finally {
        page.cleanup()
      }
    }
  } finally {
    await loadingTask.destroy()
  }

  const fullText = chunks.join('\n\n')
  const truncated = fullText.length > maxChars
  return {
    text: truncated ? fullText.slice(0, maxChars) : fullText,
    totalLength: fullText.length,
    truncated,
    pageCount: totalPages,
  }
}

/* ------------------------------------------------------------------ *
 * PDF → PNG（pdfjs-dist + @napi-rs/canvas）
 * ------------------------------------------------------------------ */

function createCanvasFactory(canvasApi) {
  return {
    create(width, height) {
      const canvas = canvasApi.createCanvas(width, height)
      return { canvas, context: canvas.getContext('2d') }
    },
    destroy(canvasAndContext) {
      canvasAndContext.canvas.width = 0
      canvasAndContext.canvas.height = 0
      canvasAndContext.context = null
    },
  }
}

async function renderPdfPages(filePath, outputDir, pageNumbers, scale) {
  const pdfjs = await importDependency('pdfjs-dist/legacy/build/pdf.mjs')
  if (pdfjs.GlobalWorkerOptions) {
    const workerPath = resolveWorkerPath()
    if (workerPath) {
      try {
        pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href
      } catch {
        /* 降级：pdfjs 自行处理 */
      }
    }
  }

  const canvasApi = requireDependency('@napi-rs/canvas')
  const canvasFactory = createCanvasFactory(canvasApi)

  const data = new Uint8Array(readFileSync(filePath))
  const loadingTask = pdfjs.getDocument({
    data,
    useSystemFonts: false,
    standardFontDataUrl: getStandardFontDataUrl(),
    cMapUrl: getCmapUrl(),
    cMapPacked: true,
  })
  const doc = await loadingTask.promise
  const totalPages = doc.numPages
  const pagesToRender = pageNumbers ?? Array.from({ length: totalPages }, (_, i) => i + 1)

  ensureDir(outputDir)
  const outputFiles = []

  try {
    for (const pageNum of pagesToRender) {
      if (pageNum < 1 || pageNum > totalPages) continue

      const page = await doc.getPage(pageNum)
      const viewport = page.getViewport({ scale })
      const canvasAndContext = canvasFactory.create(viewport.width, viewport.height)

      try {
        await page.render({
          canvasContext: canvasAndContext.context,
          viewport,
          canvas: canvasAndContext.canvas,
        }).promise

        const pngData = canvasAndContext.canvas.toBuffer('image/png')
        const outputFileName = `${sanitizeBaseName(path.basename(filePath, '.pdf'))}_page_${String(pageNum).padStart(3, '0')}.png`
        const outputPath = path.join(outputDir, outputFileName)
        writeFileSync(outputPath, pngData)
        outputFiles.push(outputPath)
      } finally {
        canvasFactory.destroy(canvasAndContext)
      }
    }
  } finally {
    await loadingTask.destroy()
  }

  return { files: outputFiles, pageCount: totalPages }
}

/* ------------------------------------------------------------------ *
 * 各操作实现
 * ------------------------------------------------------------------ */

function readPageSpecs(options) {
  const pages = readJsonOption(options, 'pages', 'pages-file')
  if (pages === undefined) return undefined
  if (!Array.isArray(pages)) {
    throw new UsageError('页面参数必须是数组（JSON 数组或 JSON 文件）。')
  }
  return pages
}

async function opCreate(options) {
  const pages = readPageSpecs(options)
  if (!pages) {
    throw new UsageError('create 操作需要 --pages（或 --pages-file）指定页面数组。')
  }
  if (pages.length === 0) {
    throw new UsageError('create 操作的页面数组不能为空。')
  }
  if (pages.length > MAX_PAGES_PER_CALL) {
    throw new UsageError(
      `create 操作单次最多 ${MAX_PAGES_PER_CALL} 页（收到 ${pages.length} 页）。请先用 create 创建初始页面，再用 add-pages 分批追加。`,
    )
  }

  const { PDFDocument, StandardFonts, rgb } = loadPdfLib()
  const doc = await PDFDocument.create()
  applyMetadata(doc, readJsonOption(options, 'metadata', 'metadata-file'), options.title)

  const context = {
    fontCache: {},
    cjkFontPath: options['cjk-font-path'],
    standardFonts: StandardFonts,
    rgb,
  }

  for (const pageSpec of pages) {
    await renderPageSpec(doc, pageSpec, context)
  }

  const bytes = await doc.save()
  const outputPath =
    options.output ?? generateOutputPath(ARTIFACT_DIR, 'create', 'pdf', options.title)
  ensureDir(path.dirname(outputPath))
  writeFileSync(outputPath, Buffer.from(bytes))

  return {
    summary: `已创建 PDF 文件，包含 ${pages.length} 页`,
    outputPath,
    meta: { pageCount: pages.length },
  }
}

async function opMerge(options) {
  const files = options.files ?? []
  if (files.length === 0) {
    throw new UsageError('merge 操作需要 --files <a.pdf> <b.pdf> 指定待合并文件。')
  }
  for (const file of files) assertFileExists(file)

  const { PDFDocument } = loadPdfLib()
  const merged = await PDFDocument.create()

  for (const filePath of files) {
    const src = await PDFDocument.load(readFileSync(filePath), { ignoreEncryption: true })
    const copied = await merged.copyPages(src, src.getPageIndices())
    copied.forEach((page) => merged.addPage(page))
  }

  const bytes = await merged.save()
  const outputPath = options.output ?? generateOutputPath(ARTIFACT_DIR, 'merge', 'pdf', 'merged')
  ensureDir(path.dirname(outputPath))
  writeFileSync(outputPath, Buffer.from(bytes))

  return {
    summary: `已合并 ${files.length} 个 PDF 文件`,
    outputPath,
    meta: { fileCount: files.length },
  }
}

async function opSplit(options) {
  const file = requireFileOption(options, 'split')
  assertFileExists(file)

  const { PDFDocument } = loadPdfLib()
  const src = await PDFDocument.load(readFileSync(file), { ignoreEncryption: true })
  const total = src.getPageCount()
  const outputDir =
    options['output-dir'] ??
    path.join(
      ARTIFACT_DIR,
      `${sanitizeBaseName(path.basename(file, '.pdf'))}-split-${formatTimestamp(new Date())}-${randomBytes(3).toString('hex')}`,
    )
  ensureDir(outputDir)

  const outputPaths = []
  for (let i = 0; i < total; i += 1) {
    const out = await PDFDocument.create()
    const [page] = await out.copyPages(src, [i])
    out.addPage(page)
    const bytes = await out.save()
    const pagePath = path.join(outputDir, `page_${String(i + 1).padStart(3, '0')}.pdf`)
    writeFileSync(pagePath, Buffer.from(bytes))
    outputPaths.push(pagePath)
  }

  return {
    summary: `已将 PDF 拆分为 ${total} 个单页文件`,
    outputPaths,
    meta: { pageCount: total, outputDir },
  }
}

async function opExtractText(options) {
  const file = requireFileOption(options, 'extract-text')
  const maxChars = options['max-chars'] ? parseNumberOption(options['max-chars'], 'max-chars') : PDF_EXTRACT_TEXT_MAX_CHARS
  assertFileExists(file)

  const result = await withStdoutGuard(() => extractPdfText(file, maxChars))

  const textPath =
    options.output ??
    path.join(
      ARTIFACT_DIR,
      `${sanitizeBaseName(path.basename(file, '.pdf'))}-text-${formatTimestamp(new Date())}-${randomBytes(3).toString('hex')}.txt`,
    )
  ensureDir(path.dirname(textPath))
  writeFileSync(textPath, result.text, 'utf8')

  const summary =
    `已提取文本，共 ${result.pageCount} 页` +
    (result.truncated ? `（文本已截断至前 ${maxChars} 字符，完整文本长度 ${result.totalLength} 字符）` : '')

  return {
    summary,
    outputPath: textPath,
    content: result.text,
    meta: {
      pageCount: result.pageCount,
      totalLength: result.totalLength,
      truncated: result.truncated,
      textPath,
    },
  }
}

async function opFillForm(options) {
  const file = requireFileOption(options, 'fill-form')

  const fields = []
  const jsonFields = readJsonOption(options, 'fields', 'fields-file')
  if (jsonFields !== undefined) {
    if (!Array.isArray(jsonFields)) {
      throw new UsageError('表单字段参数必须是数组（形如 [{"name":"x","value":"y"}]）。')
    }
    for (const item of jsonFields) {
      if (!item || typeof item.name !== 'string') {
        throw new UsageError('每个表单字段需要 name 与 value 两个属性。')
      }
      fields.push({ name: item.name, value: String(item.value ?? '') })
    }
  }
  for (const pair of options.field ?? []) {
    const eq = pair.indexOf('=')
    if (eq === -1) {
      throw new UsageError(`--field 需要 "name=value" 形式，收到 "${pair}"。`)
    }
    fields.push({ name: pair.slice(0, eq), value: pair.slice(eq + 1) })
  }
  if (fields.length === 0) {
    throw new UsageError('fill-form 操作需要 --fields/--fields-file 或 --field "name=value"。')
  }
  assertFileExists(file)

  const { PDFDocument } = loadPdfLib()
  const doc = await PDFDocument.load(readFileSync(file), { ignoreEncryption: true })
  const form = doc.getForm()

  let filledCount = 0
  const missing = []
  for (const { name, value } of fields) {
    try {
      const field = form.getField(name)
      if ('setText' in field) {
        field.setText(value)
        filledCount += 1
      } else if ('check' in field) {
        const shouldCheck = ['true', '1', 'yes', 'on'].includes(value.toLowerCase())
        if (shouldCheck) field.check()
        else field.uncheck()
        filledCount += 1
      }
    } catch {
      missing.push(name)
    }
  }

  const bytes = await doc.save()
  const outputPath = options.output ?? file
  writePdfBytes(outputPath, bytes, file)

  return {
    summary: `已填写 ${filledCount}/${fields.length} 个表单字段`,
    outputPath,
    meta: { filledCount, fieldCount: fields.length, missingFields: missing },
  }
}

async function opRotatePages(options) {
  const file = requireFileOption(options, 'rotate-pages')
  const rotation = options.rotation !== undefined ? parseNumberOption(options.rotation, 'rotation') : 90
  if (![90, 180, 270].includes(rotation)) {
    throw new UsageError('--rotation 只能是 90、180 或 270。')
  }
  const pageIndices = options['page-indices']
    ? parseNumberList(options['page-indices'], 'page-indices')
    : undefined
  assertFileExists(file)

  const { PDFDocument, degrees } = loadPdfLib()
  const doc = await PDFDocument.load(readFileSync(file), { ignoreEncryption: true })
  const pages = pageIndices ? pageIndices.map((i) => doc.getPage(i)) : doc.getPages()

  for (const page of pages) {
    const current = page.getRotation().angle
    page.setRotation(degrees((current + rotation) % 360))
  }

  const bytes = await doc.save()
  const outputPath = options.output ?? file
  writePdfBytes(outputPath, bytes, file)

  return {
    summary: `已旋转 ${pages.length} 个页面 ${rotation} 度`,
    outputPath,
    meta: { pageCount: pages.length, rotation },
  }
}

async function opDeletePages(options) {
  const file = requireFileOption(options, 'delete-pages')
  if (!options['page-indices']) {
    throw new UsageError('delete-pages 操作需要 --page-indices <0,2,3>（0-based 页码索引）。')
  }
  const indices = parseNumberList(options['page-indices'], 'page-indices')
  if (indices.length === 0) {
    throw new UsageError('delete-pages 操作的 --page-indices 不能为空。')
  }
  assertFileExists(file)

  const { PDFDocument } = loadPdfLib()
  const doc = await PDFDocument.load(readFileSync(file), { ignoreEncryption: true })
  const total = doc.getPageCount()
  const keepIndices = doc.getPageIndices().filter((i) => !indices.includes(i))

  const newDoc = await PDFDocument.create()
  const keptPages = await newDoc.copyPages(doc, keepIndices)
  keptPages.forEach((page) => newDoc.addPage(page))

  const bytes = await newDoc.save()
  const outputPath = options.output ?? file
  writePdfBytes(outputPath, bytes, file)

  return {
    summary: `已删除 ${indices.length} 个页面，剩余 ${keepIndices.length}/${total} 页`,
    outputPath,
    meta: { deleted: indices, remaining: keepIndices.length, total },
  }
}

function readWatermark(options) {
  const watermark = readJsonOption(options, 'watermark', 'watermark-file') ?? {}
  const result = { ...watermark }

  if (options.text !== undefined) result.text = options.text
  if (options['font-size'] !== undefined) result.fontSize = parseNumberOption(options['font-size'], 'font-size')
  if (options.opacity !== undefined) result.opacity = parseNumberOption(options.opacity, 'opacity')
  if (options.rotation !== undefined) result.rotation = parseNumberOption(options.rotation, 'rotation')
  if (options.color !== undefined) result.color = parseColorOption(options.color, 'color')

  if (typeof result.text !== 'string' || result.text.length === 0) {
    throw new UsageError('add-watermark 操作需要水印文本：--text "..." 或 --watermark <json>。')
  }
  return result
}

async function opAddWatermark(options) {
  const file = requireFileOption(options, 'add-watermark')
  const watermark = readWatermark(options)
  assertFileExists(file)

  const { PDFDocument, StandardFonts, rgb, degrees } = loadPdfLib()
  const doc = await PDFDocument.load(readFileSync(file), { ignoreEncryption: true })

  const fontName = hasCjkChar(watermark.text) ? DEFAULT_CJK_BOLD : 'HelveticaBold'
  const fontCache = {}
  const font = await getFont(
    doc,
    fontName,
    fontCache,
    options['cjk-font-path'],
    StandardFonts,
    rgb,
  )
  const fontSize = watermark.fontSize ?? 50
  const opacity = watermark.opacity ?? 0.3
  const rotation = watermark.rotation ?? 45
  const color = toColor(watermark.color, rgb) ?? rgb(0.5, 0.5, 0.5)

  const pages = doc.getPages()
  for (const page of pages) {
    const { width, height } = page.getSize()
    const textWidth = font.widthOfTextAtSize(watermark.text, fontSize)
    page.drawText(watermark.text, {
      x: (width - textWidth * Math.cos((rotation * Math.PI) / 180)) / 2,
      y: height / 2,
      size: fontSize,
      font,
      color,
      opacity,
      rotate: degrees(rotation),
    })
  }

  const bytes = await doc.save()
  const outputPath = options.output ?? file
  writePdfBytes(outputPath, bytes, file)

  return {
    summary: `已为 ${pages.length} 个页面添加水印`,
    outputPath,
    meta: { pageCount: pages.length },
  }
}

async function opAddPages(options) {
  const file = requireFileOption(options, 'add-pages')
  const pages = readPageSpecs(options)
  if (!pages) {
    throw new UsageError('add-pages 操作需要 --pages（或 --pages-file）指定新增页面数组。')
  }
  if (pages.length === 0) {
    throw new UsageError('add-pages 操作的页面数组不能为空。')
  }
  if (pages.length > MAX_PAGES_PER_CALL) {
    throw new UsageError(
      `add-pages 操作单次最多 ${MAX_PAGES_PER_CALL} 页（收到 ${pages.length} 页）。请分批追加。`,
    )
  }
  assertFileExists(file)

  const { PDFDocument, StandardFonts, rgb } = loadPdfLib()
  const doc = await PDFDocument.load(readFileSync(file), { ignoreEncryption: true })
  const existingCount = doc.getPageCount()

  const context = {
    fontCache: {},
    cjkFontPath: options['cjk-font-path'],
    standardFonts: StandardFonts,
    rgb,
  }

  for (const pageSpec of pages) {
    await renderPageSpec(doc, pageSpec, context)
  }

  const bytes = await doc.save()
  const outputPath = options.output ?? file
  writePdfBytes(outputPath, bytes, file)

  const totalCount = existingCount + pages.length
  return {
    summary: `已追加 ${pages.length} 页，文件总页数从 ${existingCount} 变为 ${totalCount}`,
    outputPath,
    meta: { added: pages.length, pageCount: totalCount },
  }
}

async function opUpdatePage(options) {
  const file = requireFileOption(options, 'update-page')
  if (options['page-index'] === undefined) {
    throw new UsageError('update-page 操作需要 --page-index <n>（0-based 页面索引）。')
  }
  const pageIndex = parseNumberOption(options['page-index'], 'page-index')
  if (!Number.isInteger(pageIndex) || pageIndex < 0) {
    throw new UsageError('--page-index 必须是非负整数。')
  }

  const elements = readJsonOption(options, 'elements', 'elements-file')
  if (elements === undefined) {
    throw new UsageError('update-page 操作需要 --elements（或 --elements-file）指定要叠加的元素数组。')
  }
  if (!Array.isArray(elements)) {
    throw new UsageError('元素参数必须是数组。')
  }
  assertFileExists(file)

  const { PDFDocument, StandardFonts, rgb } = loadPdfLib()
  const doc = await PDFDocument.load(readFileSync(file), { ignoreEncryption: true })

  if (pageIndex >= doc.getPageCount()) {
    throw new OperationError(
      `pageIndex ${pageIndex} 超出范围，文件共 ${doc.getPageCount()} 页（有效索引 0-${doc.getPageCount() - 1}）`,
    )
  }

  const page = doc.getPage(pageIndex)
  const fontCache = {}
  let autoLayout = { nextY: page.getHeight() - 50, pageHeight: page.getHeight() }

  for (const element of elements) {
    const result = await drawElement(
      doc,
      page,
      element,
      fontCache,
      options['cjk-font-path'],
      StandardFonts,
      rgb,
      autoLayout,
    )
    if (result) autoLayout = result
  }

  const bytes = await doc.save()
  const outputPath = options.output ?? file
  writePdfBytes(outputPath, bytes, file)

  return {
    summary: `已在第 ${pageIndex + 1} 页（索引 ${pageIndex}）上绘制 ${elements.length} 个新元素`,
    outputPath,
    meta: { pageIndex, elementCount: elements.length },
  }
}

async function opToMarkdown(options) {
  const file = requireFileOption(options, 'to-markdown')
  assertFileExists(file)
  const { markdown, pageCount, tablePageCount } = await withStdoutGuard(() => convertPdfToMarkdown(file))
  const structure = await summarizeMarkdown(markdown)

  const baseName = sanitizeBaseName(path.basename(file, '.pdf'))
  const outputPath =
    options.output ?? path.join(ARTIFACT_DIR, `${baseName}-markdown-${formatTimestamp(new Date())}-${randomBytes(3).toString('hex')}.md`)

  if (!options.inline) {
    ensureDir(path.dirname(outputPath))
    writeFileSync(outputPath, markdown, 'utf8')
  }

  return {
    summary: `PDF 转 Markdown 完成，共 ${pageCount} 页，Markdown ${markdown.length} 字符`,
    outputPath: options.inline ? undefined : outputPath,
    content: options.inline ? markdown : undefined,
    meta: { pageCount, tablePageCount, markdownLength: markdown.length, structure },
  }
}

async function opToImage(options) {
  const file = requireFileOption(options, 'to-image')
  assertFileExists(file)

  let pageNumbers
  if (options['image-pages']) {
    pageNumbers = parseNumberList(options['image-pages'], 'image-pages')
  } else if (options.pages !== undefined) {
    // 兼容 "--pages 1,3,5"（纯数字列表）写法
    const raw = options.pages.trim()
    if (/^\d+(\s*,\s*\d+)*$/.test(raw)) {
      pageNumbers = parseNumberList(raw, 'pages')
    } else {
      const value = readJsonOption(options, 'pages', 'pages-file')
      if (Array.isArray(value) && value.every((item) => typeof item === 'number')) {
        pageNumbers = value
      }
    }
  }
  const scale = options.scale !== undefined ? parseNumberOption(options.scale, 'scale') : 2.0
  if (scale <= 0) throw new UsageError('--scale 必须大于 0。')

  const outputDir =
    options['output-dir'] ??
    path.join(
      ARTIFACT_DIR,
      `${sanitizeBaseName(path.basename(file, '.pdf'))}-image-${formatTimestamp(new Date())}-${randomBytes(3).toString('hex')}`,
    )

  const result = await withStdoutGuard(() => renderPdfPages(file, outputDir, pageNumbers, scale))
  if (result.files.length === 0) {
    throw new OperationError('PDF 转图片失败：未生成任何图片文件（请检查 --image-pages 页码是否越界）。')
  }

  const imageList = result.files
    .map((filePath) => {
      const match = filePath.match(/page_(\d+)\.png$/)
      const pageNum = match ? Number.parseInt(match[1], 10) : 0
      return `第 ${pageNum} 页: ${filePath}`
    })
    .join('\n')

  return {
    summary: `PDF 转图片完成，生成 ${result.files.length} 张页面图片`,
    outputPaths: result.files,
    content: imageList,
    meta: { outputDir, pageCount: result.pageCount, imageCount: result.files.length, scale },
  }
}

const OPERATION_HANDLERS = {
  create: opCreate,
  merge: opMerge,
  split: opSplit,
  'extract-text': opExtractText,
  'fill-form': opFillForm,
  'rotate-pages': opRotatePages,
  'delete-pages': opDeletePages,
  'add-watermark': opAddWatermark,
  'add-pages': opAddPages,
  'update-page': opUpdatePage,
  'to-markdown': opToMarkdown,
  'to-image': opToImage,
}

/* ------------------------------------------------------------------ *
 * 帮助与日志
 * ------------------------------------------------------------------ */

const HELP_TEXT = `ae-pdf — PDF 处理 CLI

用法：
  node scripts/pdf.mjs <operation> [options]

操作：
  create          创建 PDF（元素化绘制 / 整页文本）
  merge           合并多个 PDF 为一个
  split           拆分 PDF 为单页文件
  extract-text    提取 PDF 文本
  fill-form       填写 PDF 表单字段
  rotate-pages    旋转页面（90/180/270）
  delete-pages    删除指定页面
  add-watermark   为所有页面添加文本水印
  add-pages       向已有 PDF 追加页面
  update-page     在指定页面上叠加绘制新元素
  to-markdown     PDF 转 Markdown
  to-image        PDF 转 PNG 图片

通用参数：
  --file <path>              输入 PDF 路径
  --files <a.pdf> <b.pdf>    多个输入文件（merge，可重复指定）
  --output <path>            输出文件路径（默认写入 ae/pdf/）
  --output-dir <dir>         输出目录（split / to-image）
  --title <text>             PDF 标题（create）
  --cjk-font-path <path>     自定义 CJK 字体文件（.ttf/.otf）
  --json                     仅输出 JSON（stdout 恒为单个 JSON 对象）
  --quiet                    成功时不输出 stderr 摘要行
  --help                     显示本帮助

页面与元素：
  --pages <json>             页面数组 JSON（create / add-pages）
  --pages-file <path>        页面数组 JSON 文件（推荐，复杂页面用）
  --elements <json>          元素数组 JSON（update-page）
  --elements-file <path>     元素数组 JSON 文件
  --page-index <n>           目标页面索引，0-based（update-page）
  --page-indices <0,2,3>     页码索引，0-based（rotate-pages / delete-pages）

表单与水印：
  --fields <json>            表单字段 JSON：[{"name":"x","value":"y"}]
  --fields-file <path>       表单字段 JSON 文件
  --field "name=value"       单个表单字段（可重复指定）
  --watermark <json>         水印配置 JSON
  --watermark-file <path>    水印配置 JSON 文件
  --text <text>              水印文本
  --font-size <n>            水印字号（默认 50）
  --color <r,g,b>            颜色，0-1 分量或 #RRGGBB
  --opacity <n>              不透明度 0-1（默认 0.3）
  --rotation <n>             旋转角度

转换类：
  --image-pages <1,3,5>      to-image 指定页码（1-based）
  --scale <n>                to-image 渲染倍率（默认 2.0）
  --max-chars <n>            extract-text 最大字符数（默认 8000）
  --inline                   to-markdown 只返回内容、不写文件
  --metadata <json>          文档元数据 JSON
  --metadata-file <path>     文档元数据 JSON 文件

示例：
  node scripts/pdf.mjs merge --files a.pdf b.pdf --output out.pdf
  node scripts/pdf.mjs create --pages-file pages.json
  node scripts/pdf.mjs extract-text --file report.pdf
  node scripts/pdf.mjs to-markdown --file report.pdf
  node scripts/pdf.mjs to-image --file report.pdf --image-pages 1,3,5

产物目录：ae/pdf/    日志目录：ae/logs/pdf/
`

function writeLog(record) {
  try {
    ensureDir(LOG_DIR)
    const name = `${formatTimestamp(new Date())}-${record.operation ?? 'unknown'}-${randomBytes(2).toString('hex')}.json`
    writeFileSync(path.join(LOG_DIR, name), `${JSON.stringify(record, null, 2)}\n`, 'utf8')
    return path.join(LOG_DIR, name)
  } catch {
    return undefined
  }
}

function formatError(error) {
  if (error instanceof UsageError || error instanceof DependencyError || error instanceof OperationError) {
    return error.message
  }
  if (error instanceof Error) return error.message || String(error)
  return String(error)
}

/* ------------------------------------------------------------------ *
 * 入口
 * ------------------------------------------------------------------ */

async function main(argv) {
  const startedAt = Date.now()
  let operation = null
  let options = {}

  try {
    const parsed = parseArgs(argv)
    options = parsed.options

    if (options.help) {
      process.stdout.write(HELP_TEXT)
      return 0
    }

    operation = parsed.positionals[0]
    if (!operation) {
      throw new UsageError(`缺少操作名。可用操作：${OPERATIONS.join('、')}`)
    }
    if (!OPERATIONS.includes(operation)) {
      throw new UsageError(`未知操作 "${operation}"。可用操作：${OPERATIONS.join('、')}`)
    }
    if (parsed.positionals.length > 1) {
      throw new UsageError(`多余参数：${parsed.positionals.slice(1).join('、')}`)
    }

    const handler = OPERATION_HANDLERS[operation]
    const result = await handler(options)

    const payload = { ok: true, operation, summary: result.summary }
    if (result.outputPath) payload.outputPath = result.outputPath
    if (result.outputPaths) payload.outputPaths = result.outputPaths
    if (result.content !== undefined) payload.content = result.content
    if (result.meta) payload.meta = result.meta
    if (fontFallbacks.length > 0) {
      payload.meta = { ...(payload.meta ?? {}), fontFallbacks: [...fontFallbacks] }
    }

    payload.logPath = writeLog({
      ok: true,
      operation,
      argv,
      summary: result.summary,
      outputPath: result.outputPath,
      outputPaths: result.outputPaths,
      meta: result.meta,
      durationMs: Date.now() - startedAt,
      finishedAt: new Date().toISOString(),
    })

    if (!options.json && !options.quiet) {
      const target = result.outputPath ?? result.outputPaths?.[0] ?? result.meta?.outputDir
      process.stderr.write(`${result.summary}${target ? ` → ${target}` : ''}\n`)
    }
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
    return 0
  } catch (error) {
    const message = formatError(error)
    writeLog({
      ok: false,
      operation,
      argv,
      error: message,
      stack: error?.stack,
      durationMs: Date.now() - startedAt,
      finishedAt: new Date().toISOString(),
    })
    process.stderr.write(`错误：${message}\n`)
    process.stdout.write(`${JSON.stringify({ ok: false, operation, error: message }, null, 2)}\n`)
    return 1
  }
}

const exitCode = await main(process.argv.slice(2))
process.exitCode = exitCode
