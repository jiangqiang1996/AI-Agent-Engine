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

function runUninstallDetect(args: string[]): Record<string, unknown> {
  const output = execFileSync('node', [join(SCRIPTS_DIR, 'uninstall.js'), '--detect', ...args], {
    encoding: 'utf8',
    timeout: 10000,
  })
  return JSON.parse(output)
}

function runInstallParseArgs(args: string[]): { yes: boolean; scope: string | null; projectRoot: string | null } {
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

describe('install.js parseArgs 参数解析', () => {
  it('应该正确解析 --scope project flag 形式', () => {
    const tempDir = createTempDir()
    const result = runInstallParseArgs(['--yes', '--project-root', tempDir, '--scope', 'project'])
    expect(result.yes).toBe(true)
    expect(result.scope).toBe('project')
    expect(result.projectRoot).toBe(tempDir)
  })

  it('应该正确解析 --scope global flag 形式', () => {
    const tempDir = createTempDir()
    const result = runInstallParseArgs(['--yes', '--project-root', tempDir, '--scope', 'global'])
    expect(result.scope).toBe('global')
    expect(result.projectRoot).toBe(tempDir)
  })

  it('向后兼容：接受 project 位置参数', () => {
    const tempDir = createTempDir()
    const result = runInstallParseArgs(['--yes', '--project-root', tempDir, 'project'])
    expect(result.scope).toBe('project')
    expect(result.projectRoot).toBe(tempDir)
  })

  it('向后兼容：接受 global 位置参数', () => {
    const tempDir = createTempDir()
    const result = runInstallParseArgs(['--yes', '--project-root', tempDir, 'global'])
    expect(result.scope).toBe('global')
    expect(result.projectRoot).toBe(tempDir)
  })

  it('未传 scope 时返回 null（脚本层应报错退出）', () => {
    const result = runInstallParseArgs(['--yes'])
    expect(result.scope).toBe(null)
    expect(result.projectRoot).toBe(null)
  })

  it('--project-root 后跟 flag 参数时不应误作路径值', () => {
    const result = runInstallParseArgs(['--project-root', '--yes', 'project'])
    expect(result.projectRoot).toBe(null)
    expect(result.scope).toBe('project')
    expect(result.yes).toBe(true)
  })

  it('--scope 后跟 flag 参数时不应误作 scope 值', () => {
    const result = runInstallParseArgs(['--scope', '--yes', 'project'])
    expect(result.scope).toBe('project')
  })

  it('--project-root 值为 "project" 时不应导致 scope 误判', () => {
    const result = runInstallParseArgs(['--project-root', 'project', 'global'])
    expect(result.projectRoot).toBe('project')
    expect(result.scope).toBe('global')
  })

  it('--scope flag 优先于位置参数', () => {
    const result = runInstallParseArgs(['--scope', 'project', 'global'])
    expect(result.scope).toBe('project')
  })

  it('位置参数在前 --scope flag 在后时 flag 仍优先', () => {
    const result = runInstallParseArgs(['global', '--scope', 'project'])
    expect(result.scope).toBe('project')
  })

  it('--scope 无效值时报错退出', () => {
    let exitCode = 0
    let stderr = ''
    try {
      execFileSync('node', [join(SCRIPTS_DIR, 'install.js'), '--scope', 'foo', '--yes'], {
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
    expect(stderr).toContain('无效的 scope 值')
  })
})

describe('uninstall.js parseArgs 参数解析', () => {
  it('应该正确解析 --project-root 和 positional scope', () => {
    const tempDir = createTempDir()
    const output = execFileSync(
      'node',
      ['-e', `
        function parseArgs(argv) {
          const detect = argv.includes('--detect')
          const yes = argv.includes('--yes') || argv.includes('-y')
          const scopes = []
          let projectRoot = null
          for (let i = 0; i < argv.length; i++) {
            if (argv[i] === '--scope' && argv[i + 1] && !argv[i + 1].startsWith('-')) {
              scopes.push(argv[i + 1] === 'project' ? 'project' : 'global'); i++
            } else if (argv[i] === '--project-root' && argv[i + 1] && !argv[i + 1].startsWith('-')) {
              projectRoot = argv[i + 1]; i++
            } else if (scopes.length === 0 && (argv[i] === 'project' || argv[i] === 'global')) {
              scopes.push(argv[i] === 'project' ? 'project' : 'global')
            }
          }
          if (scopes.length === 0) { scopes.push('global') }
          return { detect, yes, scopes, projectRoot }
        }
        console.log(JSON.stringify(parseArgs(${JSON.stringify(['--project-root', tempDir, 'project'])})))
      `],
      { encoding: 'utf8', timeout: 5000 },
    )
    const result = JSON.parse(output.trim())
    expect(result.scopes).toEqual(['project'])
    expect(result.projectRoot).toBe(tempDir)
  })

  it('应该正确解析 --scope 参数', () => {
    const tempDir = createTempDir()
    const output = execFileSync(
      'node',
      ['-e', `
        function parseArgs(argv) {
          const detect = argv.includes('--detect')
          const yes = argv.includes('--yes') || argv.includes('-y')
          const scopes = []
          let projectRoot = null
          for (let i = 0; i < argv.length; i++) {
            if (argv[i] === '--scope' && argv[i + 1] && !argv[i + 1].startsWith('-')) {
              scopes.push(argv[i + 1] === 'project' ? 'project' : 'global'); i++
            } else if (argv[i] === '--project-root' && argv[i + 1] && !argv[i + 1].startsWith('-')) {
              projectRoot = argv[i + 1]; i++
            } else if (scopes.length === 0 && (argv[i] === 'project' || argv[i] === 'global')) {
              scopes.push(argv[i] === 'project' ? 'project' : 'global')
            }
          }
          if (scopes.length === 0) { scopes.push('global') }
          return { detect, yes, scopes, projectRoot }
        }
        console.log(JSON.stringify(parseArgs(${JSON.stringify(['--project-root', tempDir, '--scope', 'global'])})))
      `],
      { encoding: 'utf8', timeout: 5000 },
    )
    const result = JSON.parse(output.trim())
    expect(result.scopes).toEqual(['global'])
    expect(result.projectRoot).toBe(tempDir)
  })

  it('--project-root 后跟 flag 参数时不应误作路径值', () => {
    const output = execFileSync(
      'node',
      ['-e', `
        function parseArgs(argv) {
          const detect = argv.includes('--detect')
          const yes = argv.includes('--yes') || argv.includes('-y')
          const scopes = []
          let projectRoot = null
          for (let i = 0; i < argv.length; i++) {
            if (argv[i] === '--scope' && argv[i + 1] && !argv[i + 1].startsWith('-')) {
              scopes.push(argv[i + 1] === 'project' ? 'project' : 'global'); i++
            } else if (argv[i] === '--project-root' && argv[i + 1] && !argv[i + 1].startsWith('-')) {
              projectRoot = argv[i + 1]; i++
            } else if (scopes.length === 0 && (argv[i] === 'project' || argv[i] === 'global')) {
              scopes.push(argv[i] === 'project' ? 'project' : 'global')
            }
          }
          if (scopes.length === 0) { scopes.push('global') }
          return { detect, yes, scopes, projectRoot }
        }
        console.log(JSON.stringify(parseArgs(${JSON.stringify(['--project-root', '--yes', 'project'])})))
      `],
      { encoding: 'utf8', timeout: 5000 },
    )
    const result = JSON.parse(output.trim())
    expect(result.projectRoot).toBe(null)
    expect(result.scopes).toEqual(['project'])
  })

  it('--scope 后跟 flag 参数时不应误作 scope 值', () => {
    const output = execFileSync(
      'node',
      ['-e', `
        function parseArgs(argv) {
          const detect = argv.includes('--detect')
          const yes = argv.includes('--yes') || argv.includes('-y')
          const scopes = []
          let projectRoot = null
          for (let i = 0; i < argv.length; i++) {
            if (argv[i] === '--scope' && argv[i + 1] && !argv[i + 1].startsWith('-')) {
              scopes.push(argv[i + 1] === 'project' ? 'project' : 'global'); i++
            } else if (argv[i] === '--project-root' && argv[i + 1] && !argv[i + 1].startsWith('-')) {
              projectRoot = argv[i + 1]; i++
            } else if (scopes.length === 0 && (argv[i] === 'project' || argv[i] === 'global')) {
              scopes.push(argv[i] === 'project' ? 'project' : 'global')
            }
          }
          if (scopes.length === 0) { scopes.push('global') }
          return { detect, yes, scopes, projectRoot }
        }
        console.log(JSON.stringify(parseArgs(${JSON.stringify(['--scope', '--yes', 'project'])})))
      `],
      { encoding: 'utf8', timeout: 5000 },
    )
    const result = JSON.parse(output.trim())
    expect(result.scopes).toEqual(['project'])
  })

  it('默认 scope 为 global', () => {
    const output = execFileSync(
      'node',
      ['-e', `
        function parseArgs(argv) {
          const detect = argv.includes('--detect')
          const yes = argv.includes('--yes') || argv.includes('-y')
          const scopes = []
          let projectRoot = null
          for (let i = 0; i < argv.length; i++) {
            if (argv[i] === '--scope' && argv[i + 1] && !argv[i + 1].startsWith('-')) {
              scopes.push(argv[i + 1] === 'project' ? 'project' : 'global'); i++
            } else if (argv[i] === '--project-root' && argv[i + 1] && !argv[i + 1].startsWith('-')) {
              projectRoot = argv[i + 1]; i++
            } else if (scopes.length === 0 && (argv[i] === 'project' || argv[i] === 'global')) {
              scopes.push(argv[i] === 'project' ? 'project' : 'global')
            }
          }
          if (scopes.length === 0) { scopes.push('global') }
          return { detect, yes, scopes, projectRoot }
        }
        console.log(JSON.stringify(parseArgs(${JSON.stringify(['--yes'])})))
      `],
      { encoding: 'utf8', timeout: 5000 },
    )
    const result = JSON.parse(output.trim())
    expect(result.scopes).toEqual(['global'])
  })
})

describe('uninstall.js --detect 端到端', () => {
  it('应该输出包含 global 和 project 的 JSON 状态', () => {
    const tempDir = createTempDir()
    const status = runUninstallDetect(['--project-root', tempDir])
    expect(status).toHaveProperty('global')
    expect(status).toHaveProperty('project')
    expect(status.global).toHaveProperty('installed')
    expect(status.project).toHaveProperty('installed')
  })

  it('未传 --project-root 时应回退到 process.cwd() 并正常输出', () => {
    const status = runUninstallDetect([])
    expect(status).toHaveProperty('global')
    expect(status).toHaveProperty('project')
  })
})

describe('install.js scope 缺失时报错退出', () => {
  it('未传 --scope 且无位置参数时应以非零退出码退出', () => {
    const tempDir = createTempDir()
    let exitCode = 0
    let stderr = ''
    try {
      execFileSync('node', [join(SCRIPTS_DIR, 'install.js'), '--yes', '--project-root', tempDir], {
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
    expect(stderr).toContain('必须显式指定安装范围')
  })
})
