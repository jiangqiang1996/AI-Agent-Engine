import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { execSync, spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { homedir, platform } from 'node:os'
import { join, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'

export interface LibreOfficeDetectionResult {
  available: boolean
  source: 'system' | 'portable' | 'none'
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
  const currentPlatform = platform() as string
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

  const currentPlatform = platform() as string

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

export function detectLibreOffice(): LibreOfficeDetectionResult {
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

const PORTABLE_DOWNLOAD_INFO: Record<string, { url: string; filename: string; extractType: string }> = {
  win32: {
    url: 'https://ftp.nluug.nl/office/LibreOfficePortable/LibreOfficePortable_24.8.4_Multilingual.paf.exe',
    filename: 'LibreOfficePortable_24.8.4_Multilingual.paf.exe',
    extractType: 'paf_exe',
  },
  linux: {
    url: 'https://ftp.nluug.nl/office/libreoffice/stable/24.8.4/rpm/x86_64/LibreOffice_24.8.4_Linux_x86-64_rpm.tar.gz',
    filename: 'LibreOffice_24.8.4_Linux_x86-64_rpm.tar.gz',
    extractType: 'tar_gz',
  },
  darwin: {
    url: 'https://ftp.nluug.nl/office/libreoffice/stable/24.8.4/mac/aarch64/LibreOffice_24.8.4_MacOS_aarch64.dmg',
    filename: 'LibreOffice_24.8.4_MacOS_aarch64.dmg',
    extractType: 'dmg',
  },
}

export async function downloadPortableLibreOffice(): Promise<LibreOfficeInstallResult> {
  const currentPlatform = platform() as string
  const info = PORTABLE_DOWNLOAD_INFO[currentPlatform]

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
        const soffice = join(rpmsDir, 'opt', 'libreoffice24.8', 'program', 'soffice')
        if (existsSync(soffice)) {
          return { success: true, sofficePath: soffice }
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
  format: 'png' | 'pdf' = 'png',
): Promise<string[]> {
  mkdirSync(outputDir, { recursive: true })

  const args = [
    '--headless',
    '--convert-to',
    format,
    '--outdir',
    outputDir,
    filePath,
  ]

  return new Promise((resolve, reject) => {
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
}

export function getPortableDir(): string {
  return getPortableBaseDir()
}
