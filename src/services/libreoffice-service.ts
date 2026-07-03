import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, copyFileSync, lstatSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { execSync, spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { homedir, platform } from 'node:os'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import stripJsonComments from 'strip-json-comments'

export interface LibreOfficeDetectionResult {
  available: boolean
  source: 'config' | 'system' | 'portable' | 'none'
  sofficePath: string | null
}

export interface LibreOfficeInstallResult {
  success: boolean
  sofficePath: string | null
  error?: string
}

const PORTABLE_DIR_NAME = 'libreoffice'

function getPortableBaseDir(): string {
  return join(homedir(), '.config', 'opencode', PORTABLE_DIR_NAME)
}

const SYSTEM_SEARCH_PATHS: Record<string, string[]> = {
  win32: [
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  ],
  linux: [
    '/usr/bin/soffice',
    '/usr/local/bin/soffice',
    '/snap/bin/soffice',
  ],
  darwin: [
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
    '/Applications/LibreOffice.app/Contents/program/soffice',
  ],
}

export function detectSystemLibreOffice(): string | null {
  const currentPlatform = platform()
  const paths = SYSTEM_SEARCH_PATHS[currentPlatform] ?? []

  for (const p of paths) {
    if (existsSync(p)) {
      return p
    }
  }

  try {
    const cmd = currentPlatform === 'win32' ? 'where soffice' : 'which soffice'
    const result = execSync(cmd, { encoding: 'utf8', timeout: 5000 }).trim()
    if (result && existsSync(result)) {
      return result
    }
  } catch {
  }

  return null
}

export function detectPortableLibreOffice(): string | null {
  const baseDir = getPortableBaseDir()
  if (!existsSync(baseDir)) {
    return null
  }

  const currentPlatform = platform()

  if (currentPlatform === 'win32') {
    const sofficePath = join(baseDir, 'LibreOfficePortable', 'App', 'libreoffice', 'program', 'soffice.exe')
    if (existsSync(sofficePath)) return sofficePath

    for (const entry of readdirSync(baseDir)) {
      const candidate = join(baseDir, entry, 'program', 'soffice.exe')
      if (existsSync(candidate)) return candidate
    }
  }

  if (currentPlatform === 'linux') {
    for (const entry of readdirSync(baseDir)) {
      if (entry.endsWith('.AppImage') || entry === 'soffice') {
        const candidate = join(baseDir, entry)
        if (existsSync(candidate)) return candidate
      }
    }
  }

  if (currentPlatform === 'darwin') {
    const appPath = join(baseDir, 'LibreOffice.app', 'Contents', 'MacOS', 'soffice')
    if (existsSync(appPath)) return appPath
  }

  return null
}

export function detectLibreOffice(configPath?: string): LibreOfficeDetectionResult {
  if (configPath) {
    if (existsSync(configPath)) {
      // 用户配置的可能是目录（如便携版根目录），也可能是可执行文件路径
      const resolvedSoffice = resolveSofficeFromPath(configPath)
      if (resolvedSoffice) {
        return { available: true, source: 'config', sofficePath: resolvedSoffice }
      }
    }
  }

  const systemPath = detectSystemLibreOffice()
  if (systemPath) {
    return { available: true, source: 'system', sofficePath: systemPath }
  }

  const portablePath = detectPortableLibreOffice()
  if (portablePath) {
    return { available: true, source: 'portable', sofficePath: portablePath }
  }

  return { available: false, source: 'none', sofficePath: null }
}

/**
 * 从给定路径解析 soffice 可执行文件。
 * 如果路径本身是文件且可执行，直接返回。
 * 如果路径是目录，在常见便携版结构中递归查找 soffice。
 */
export function resolveSofficeFromPath(inputPath: string): string | null {
  const currentPlatform = platform()
  const sofficeNames = currentPlatform === 'win32' ? ['soffice.exe'] : ['soffice']
  const programSubdirs = ['program', 'App/libreoffice/program', 'Contents/MacOS', 'Contents/program']

  const stat = statSync(inputPath, { throwIfNoEntry: false })
  if (stat?.isFile()) {
    return inputPath
  }

  if (!stat?.isDirectory()) {
    return null
  }

  for (const subdir of programSubdirs) {
    for (const name of sofficeNames) {
      const candidate = join(inputPath, subdir, name)
      if (existsSync(candidate)) {
        return candidate
      }
    }
  }

  // 深度优先搜索目录树（最多搜索 depth 0-3，共 4 层）查找 soffice
  return searchSofficeInDir(inputPath, sofficeNames, 0)
}

function searchSofficeInDir(dir: string, sofficeNames: string[], depth: number): string | null {
  if (depth > 3) return null

  try {
    const entries = readdirSync(dir)
    // 防止在大型目录树中耗时过长
    if (entries.length > 100) return null

    for (const name of sofficeNames) {
      const candidate = join(dir, name)
      if (existsSync(candidate)) {
        const stat = statSync(candidate, { throwIfNoEntry: false })
        if (stat?.isFile()) return candidate
      }
    }

    for (const entry of entries) {
      const entryPath = join(dir, entry)
      const entryStat = lstatSync(entryPath, { throwIfNoEntry: false })
      // 跳过符号链接，防止遍历超出预期范围
      if (!entryStat || entryStat.isSymbolicLink() || !entryStat.isDirectory()) {
        continue
      }
      const found = searchSofficeInDir(entryPath, sofficeNames, depth + 1)
      if (found) return found
    }
  } catch {
    // 忽略权限错误
  }

  return null
}

const ALIYUN_MIRROR_BASE = 'https://mirrors.aliyun.com/libreoffice'
const LIBREOFFICE_PORTABLE_VERSION = '26.2.1'
const LIBREOFFICE_STABLE_VERSION = '26.2.4'

function getPlatformArch(): 'aarch64' | 'x86_64' {
  return process.arch === 'arm64' ? 'aarch64' : 'x86_64'
}

function getDownloadInfo(currentPlatform: string): { url: string; filename: string; extractType: string } | null {
  if (currentPlatform === 'win32') {
    const filename = `LibreOfficePortable_${LIBREOFFICE_PORTABLE_VERSION}_MultilingualAll.paf.exe`
    return {
      url: `${ALIYUN_MIRROR_BASE}/portable/${LIBREOFFICE_PORTABLE_VERSION}/${filename}`,
      filename,
      extractType: 'paf_exe',
    }
  }

  if (currentPlatform === 'linux') {
    const arch = getPlatformArch()
    const fileArch = arch === 'x86_64' ? 'x86-64' : arch
    const filename = `LibreOffice_${LIBREOFFICE_STABLE_VERSION}_Linux_${fileArch}_rpm.tar.gz`
    return {
      url: `${ALIYUN_MIRROR_BASE}/stable/${LIBREOFFICE_STABLE_VERSION}/rpm/${arch}/${filename}`,
      filename,
      extractType: 'tar_gz',
    }
  }

  if (currentPlatform === 'darwin') {
    const arch = getPlatformArch()
    const fileArch = arch === 'x86_64' ? 'x86-64' : arch
    const filename = `LibreOffice_${LIBREOFFICE_STABLE_VERSION}_MacOS_${fileArch}.dmg`
    return {
      url: `${ALIYUN_MIRROR_BASE}/stable/${LIBREOFFICE_STABLE_VERSION}/mac/${arch}/${filename}`,
      filename,
      extractType: 'dmg',
    }
  }

  return null
}

export async function downloadPortableLibreOffice(): Promise<LibreOfficeInstallResult> {
  const currentPlatform = platform()
  const info = getDownloadInfo(currentPlatform)

  if (!info) {
    return { success: false, sofficePath: null, error: `不支持的平台: ${currentPlatform}，请手动安装 LibreOffice` }
  }

  const baseDir = getPortableBaseDir()
  mkdirSync(baseDir, { recursive: true })
  const downloadPath = join(baseDir, info.filename)

  if (!existsSync(downloadPath)) {
    try {
      const response = await fetch(info.url, { redirect: 'follow' })
      if (!response.ok) {
        return { success: false, sofficePath: null, error: `下载失败: HTTP ${response.status} ${response.statusText}` }
      }
      const fileStream = createWriteStream(downloadPath)
      await pipeline(Readable.fromWeb(response.body as any), fileStream)
    } catch (err) {
      return { success: false, sofficePath: null, error: `下载失败: ${String(err)}` }
    }
  }

  if (currentPlatform === 'win32') {
    return extractPortableWindows(baseDir, downloadPath)
  }

  if (currentPlatform === 'linux') {
    return extractPortableLinux(baseDir, downloadPath)
  }

  if (currentPlatform === 'darwin') {
    return extractPortableMac(baseDir, downloadPath)
  }

  return { success: false, sofficePath: null, error: `不支持的平台: ${currentPlatform}` }
}

function extractPortableWindows(baseDir: string, downloadPath: string): LibreOfficeInstallResult {
  try {
    execSync(`"${downloadPath}" /EXTRACT="${baseDir}" /S`, { timeout: 120000 })
    const sofficePath = detectPortableLibreOffice()
    if (sofficePath) {
      return { success: true, sofficePath }
    }
    return { success: false, sofficePath: null, error: '解压完成但未找到 soffice.exe，请手动检查' }
  } catch (err) {
    return { success: false, sofficePath: null, error: `解压失败: ${String(err)}` }
  }
}

function extractPortableLinux(baseDir: string, downloadPath: string): LibreOfficeInstallResult {
  try {
    execSync(`tar -xzf "${downloadPath}" -C "${baseDir}"`, { timeout: 120000 })
    const sofficePath = detectPortableLibreOffice()
    if (sofficePath) {
      return { success: true, sofficePath }
    }

    const extractedDirs = readdirSync(baseDir).filter(d => {
      const full = join(baseDir, d)
      return statSync(full, { throwIfNoEntry: false })?.isDirectory() && d.startsWith('LibreOffice')
    })

    for (const dir of extractedDirs) {
      const rpmsDir = join(baseDir, dir, 'RPMS')
      if (existsSync(rpmsDir)) {
        execSync(`cd "${rpmsDir}" && rpm2cpio *.rpm | cpio -idmv`, { timeout: 120000 })
        const optDir = join(rpmsDir, 'opt')
        if (existsSync(optDir)) {
          for (const sub of readdirSync(optDir)) {
            if (sub.startsWith('libreoffice')) {
              const soffice = join(optDir, sub, 'program', 'soffice')
              if (existsSync(soffice)) {
                return { success: true, sofficePath: soffice }
              }
            }
          }
        }
      }
    }

    return { success: false, sofficePath: null, error: '解压完成但未找到 soffice，请手动检查' }
  } catch (err) {
    return { success: false, sofficePath: null, error: `解压失败: ${String(err)}` }
  }
}

function extractPortableMac(baseDir: string, downloadPath: string): LibreOfficeInstallResult {
  try {
    execSync(`hdiutil attach "${downloadPath}" -nobrowse`, { timeout: 120000 })
    const volumes = readdirSync('/Volumes').filter(v => v.includes('LibreOffice'))
    for (const vol of volumes) {
      const appPath = join('/Volumes', vol, 'LibreOffice.app')
      if (existsSync(appPath)) {
        execSync(`cp -R "${appPath}" "${baseDir}/"`, { timeout: 120000 })
        execSync(`hdiutil detach "/Volumes/${vol}"`, { timeout: 30000 })
        const sofficePath = join(baseDir, 'LibreOffice.app', 'Contents', 'MacOS', 'soffice')
        if (existsSync(sofficePath)) {
          return { success: true, sofficePath: sofficePath }
        }
      }
    }
    return { success: false, sofficePath: null, error: '提取完成但未找到 soffice，请手动检查' }
  } catch (err) {
    return { success: false, sofficePath: null, error: `提取失败: ${String(err)}` }
  }
}

export async function convertToImages(
  filePath: string,
  outputDir: string,
  sofficePath: string,
  format: 'png' | 'pdf' = 'pdf',
): Promise<string[]> {
  // 注意：LibreOffice --convert-to png 只输出第一页/第一张幻灯片。
  // 需要多页输出时，应使用 convertToImagesViaPdf（先转 PDF 再逐页转 PNG）。
  // format 参数默认改为 'pdf' 以避免误用单页 PNG 模式。
  mkdirSync(outputDir, { recursive: true })

  for (const f of readdirSync(outputDir)) {
    if (f.endsWith(`.${format}`)) {
      rmSync(join(outputDir, f), { force: true })
    }
  }

  // 非 ASCII 路径可能导致 LibreOffice 加载失败，复制到临时目录使用 ASCII 安全名
  // 每次调用使用独占的临时子目录，避免并发调用互相冲突
  const hasNonAscii = /[^\x00-\x7F]/.test(filePath)
  let actualFilePath = filePath
  let tempDir: string | null = null

  if (hasNonAscii) {
    tempDir = join(tmpdir(), `ae-lo-convert-${process.pid}-${randomUUID()}`)
    mkdirSync(tempDir, { recursive: true })
    const ext = extname(filePath) || '.pptx'
    const safeName = `ae_convert_${ext}`
    actualFilePath = join(tempDir, safeName)
    copyFileSync(filePath, actualFilePath)
  }

  const args = [
    '--headless',
    '--convert-to',
    format,
    '--outdir',
    outputDir,
    actualFilePath,
  ]

  try {
    return await new Promise<string[]>((resolve, reject) => {
      const proc = spawn(sofficePath, args, { timeout: 60000 })

      let stderr = ''
      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString()
      })

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`LibreOffice 转换失败 (exit code ${code}): ${stderr}`))
          return
        }

        const outputFiles = readdirSync(outputDir)
          .filter(f => f.endsWith(`.${format}`))
          .sort()
          .map(f => join(outputDir, f))

        resolve(outputFiles)
      })

      proc.on('error', (err) => {
        reject(new Error(`LibreOffice 启动失败: ${err.message}`))
      })
    })
  } finally {
    if (tempDir) {
      try { rmSync(tempDir, { recursive: true, force: true }) } catch { /* 忽略清理失败 */ }
    }
  }
}

export interface LibreOfficeConfigResult {
  libreofficePath: string | null
  source: 'none' | 'project' | 'global'
  projectConfigPath: string
  globalConfigPath: string
}

export function resolveLibreofficeConfigPaths(worktree: string): { project: string; global: string } {
  return {
    project: join(worktree, '.opencode', 'ae.jsonc'),
    global: join(homedir(), '.config', 'opencode', 'ae.jsonc'),
  }
}

export function resolveLibreofficeConfigPath(worktree: string): LibreOfficeConfigResult {
  const paths = resolveLibreofficeConfigPaths(worktree)
  const emptyResult: LibreOfficeConfigResult = {
    libreofficePath: null,
    source: 'none',
    projectConfigPath: paths.project,
    globalConfigPath: paths.global,
  }

  const projectConfig = readConfigLayer(paths.project)
  if (projectConfig?.libreofficePath && typeof projectConfig.libreofficePath === 'string') {
    return { ...emptyResult, libreofficePath: projectConfig.libreofficePath, source: 'project' }
  }

  const globalConfig = readConfigLayer(paths.global)
  if (globalConfig?.libreofficePath && typeof globalConfig.libreofficePath === 'string') {
    return { ...emptyResult, libreofficePath: globalConfig.libreofficePath, source: 'global' }
  }

  return emptyResult
}

function readConfigLayer(configPath: string): Record<string, unknown> | undefined {
  if (!existsSync(configPath)) return undefined
  try {
    const raw = readFileSync(configPath, 'utf8')
    const stripped = stripJsonComments(raw)
    const parsed = JSON.parse(stripped)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return undefined
  } catch {
    return undefined
  }
}

export interface SetLibreofficePathResult {
  success: boolean
  configPath: string
  error?: string
}

export function setLibreofficePathInConfig(configPath: string, sofficePath: string): SetLibreofficePathResult {
  const existingConfig = readConfigLayer(configPath)
  const merged = { ...existingConfig, libreofficePath: sofficePath }
  const content = JSON.stringify(merged, null, 2)

  const dir = dirname(configPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  try {
    writeFileSync(configPath, content, 'utf8')
    return { success: true, configPath }
  } catch (err) {
    return { success: false, configPath, error: `写入配置失败: ${String(err)}` }
  }
}

export function getPortableDir(): string {
  return getPortableBaseDir()
}

export interface ConvertViaPdfOptions {
  filePath: string
  outputDir: string
  sofficePath: string
  pageNumbers?: number[]
  scale?: number
  intermediateDir?: string
}

export interface ConvertViaPdfResult {
  images: string[]
  intermediateDir: string
}

export async function convertToImagesViaPdf(options: ConvertViaPdfOptions): Promise<ConvertViaPdfResult> {
  const { filePath, outputDir, sofficePath, pageNumbers, scale = 2.0, intermediateDir: customIntermediateDir } = options
  const intermediateDir = customIntermediateDir ?? join(outputDir, '_intermediate')

  try {
    const pdfFiles = await convertToImages(filePath, intermediateDir, sofficePath, 'pdf')
    if (pdfFiles.length === 0) {
      return { images: [], intermediateDir }
    }
    const { pdfToImages } = await import('./pdf-to-image-service.js')
    const images = await pdfToImages({
      filePath: pdfFiles[0],
      outputDir,
      pageIndices: pageNumbers,
      scale,
    })
    return { images, intermediateDir }
  } finally {
    try {
      rmSync(intermediateDir, { recursive: true, force: true })
    } catch {
      // 中间目录清理失败不影响主流程
    }
  }
}
