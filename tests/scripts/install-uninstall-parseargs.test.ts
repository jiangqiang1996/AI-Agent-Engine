import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

const tempDirs: string[] = []
const tempFiles: string[] = []

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ae-install-test-'))
  tempDirs.push(dir)
  return dir
}

function createTempFile(content: string): string {
  const file = join(tmpdir(), `ae-test-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`)
  writeFileSync(file, content, 'utf8')
  tempFiles.push(file)
  return file
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
  for (const file of tempFiles.splice(0)) {
    rmSync(file, { force: true })
  }
})

const SCRIPTS_DIR = join(process.cwd(), 'scripts')

function runInstallParseArgs(args: string[]): { yes: boolean; targetDir: string | null; repoDir: string | null } {
  const installJsPath = join(SCRIPTS_DIR, 'install.js')
  const helperContent = `
import { readFileSync } from 'node:fs'
const src = readFileSync(${JSON.stringify(installJsPath)}, 'utf8')
const match = src.match(/function parseArgs\\([\\s\\S]*?^\\}/m)
if (!match) throw new Error('parseArgs not found')
const fn = new Function(match[0] + '; return parseArgs')()
console.log(JSON.stringify(fn(${JSON.stringify(args)})))
`
  const helper = createTempFile(helperContent)
  const output = execFileSync('node', [helper], {
    encoding: 'utf8',
    timeout: 5000,
  })
  return JSON.parse(output.trim())
}

function runUninstallParseArgs(args: string[]): { detect: boolean; yes: boolean; keepRepo: boolean; targetDir: string | null; repoDir: string | null } {
  const uninstallJsPath = join(SCRIPTS_DIR, 'uninstall.js')
  const helperContent = `
import { readFileSync } from 'node:fs'
const src = readFileSync(${JSON.stringify(uninstallJsPath)}, 'utf8')
const match = src.match(/function parseArgs\\([\\s\\S]*?^\\}/m)
if (!match) throw new Error('parseArgs not found')
const fn = new Function(match[0] + '; return parseArgs')()
console.log(JSON.stringify(fn(${JSON.stringify(args)})))
`
  const helper = createTempFile(helperContent)
  const output = execFileSync('node', [helper], {
    encoding: 'utf8',
    timeout: 5000,
  })
  return JSON.parse(output.trim())
}

function runUninstallDetect(args: string[]): Record<string, unknown> {
  const output = execFileSync('node', [join(SCRIPTS_DIR, 'uninstall.js'), '--detect', ...args], {
    encoding: 'utf8',
    timeout: 10000,
  })
  return JSON.parse(output)
}

describe('install.js parseArgs 参数解析', () => {
  it('应该正确解析 --target-dir 和 --yes', () => {
    const tempDir = createTempDir()
    const result = runInstallParseArgs(['--yes', '--target-dir', tempDir])
    expect(result.yes).toBe(true)
    expect(result.targetDir).toBe(tempDir)
    expect(result.repoDir).toBe(null)
  })

  it('应该正确解析 --repo-dir', () => {
    const tempDir = createTempDir()
    const repoDir = createTempDir()
    const result = runInstallParseArgs(['--target-dir', tempDir, '--repo-dir', repoDir, '--yes'])
    expect(result.targetDir).toBe(tempDir)
    expect(result.repoDir).toBe(repoDir)
  })

  it('--target-dir 后跟 flag 参数时不应误作路径值', () => {
    const result = runInstallParseArgs(['--target-dir', '--yes'])
    expect(result.targetDir).toBe(null)
    expect(result.yes).toBe(true)
  })

  it('--repo-dir 后跟 flag 参数时不应误作路径值', () => {
    const tempDir = createTempDir()
    const result = runInstallParseArgs(['--target-dir', tempDir, '--repo-dir', '--yes'])
    expect(result.targetDir).toBe(tempDir)
    expect(result.repoDir).toBe(null)
  })

  it('未传 --target-dir 时返回 null', () => {
    const result = runInstallParseArgs(['--yes'])
    expect(result.targetDir).toBe(null)
  })
})

describe('install.js --target-dir 缺失时报错退出', () => {
  it('未传 --target-dir 时应以非零退出码退出', () => {
    let exitCode = 0
    let stderr = ''
    try {
      execFileSync('node', [join(SCRIPTS_DIR, 'install.js'), '--yes'], {
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch (err) {
      const e = err as { status?: number; stderr?: string }
      exitCode = e.status ?? 0
      stderr = e.stderr ?? ''
    }
    expect(exitCode).not.toBe(0)
    expect(stderr).toContain('--target-dir')
  })
})

describe('uninstall.js parseArgs 参数解析', () => {
  it('应该正确解析 --target-dir 和 --yes', () => {
    const tempDir = createTempDir()
    const result = runUninstallParseArgs(['--target-dir', tempDir, '--yes'])
    expect(result.yes).toBe(true)
    expect(result.targetDir).toBe(tempDir)
    expect(result.detect).toBe(false)
    expect(result.keepRepo).toBe(false)
  })

  it('应该正确解析 --detect', () => {
    const tempDir = createTempDir()
    const result = runUninstallParseArgs(['--target-dir', tempDir, '--detect'])
    expect(result.detect).toBe(true)
    expect(result.targetDir).toBe(tempDir)
  })

  it('应该正确解析 --keep-repo', () => {
    const tempDir = createTempDir()
    const result = runUninstallParseArgs(['--target-dir', tempDir, '--yes', '--keep-repo'])
    expect(result.keepRepo).toBe(true)
  })

  it('应该正确解析 --repo-dir', () => {
    const tempDir = createTempDir()
    const repoDir = createTempDir()
    const result = runUninstallParseArgs(['--target-dir', tempDir, '--repo-dir', repoDir, '--yes'])
    expect(result.targetDir).toBe(tempDir)
    expect(result.repoDir).toBe(repoDir)
  })
})

describe('uninstall.js --detect 端到端', () => {
  it('应该输出包含 installed 和路径信息的 JSON', () => {
    const tempDir = createTempDir()
    const status = runUninstallDetect(['--target-dir', tempDir])
    expect(status).toHaveProperty('installed')
    expect(status).toHaveProperty('bundleExists')
    expect(status).toHaveProperty('assetsExists')
    expect(status).toHaveProperty('repoExists')
    expect(status).toHaveProperty('bundleFile')
    expect(status).toHaveProperty('assetsDir')
    expect(status).toHaveProperty('repoDir')
  })

  it('未安装时应返回 installed=false', () => {
    const tempDir = createTempDir()
    const status = runUninstallDetect(['--target-dir', tempDir])
    expect(status.installed).toBe(false)
  })
})

describe('uninstall.js --target-dir 缺失时报错退出', () => {
  it('未传 --target-dir 时应以非零退出码退出', () => {
    let exitCode = 0
    let stderr = ''
    try {
      execFileSync('node', [join(SCRIPTS_DIR, 'uninstall.js'), '--detect'], {
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch (err) {
      const e = err as { status?: number; stderr?: string }
      exitCode = e.status ?? 0
      stderr = e.stderr ?? ''
    }
    expect(exitCode).not.toBe(0)
    expect(stderr).toContain('--target-dir')
  })
})
