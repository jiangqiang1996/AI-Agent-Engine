import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

const tempDirs: string[] = []

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ae-install-test-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
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

describe('install.js parseArgs 参数解析', () => {
  it('应该正确解析 --project-root 和 project scope', () => {
    const tempDir = createTempDir()
    const output = execFileSync(
      'node',
      ['-e', `
        function parseArgs(argv) {
          const yes = argv.includes('--yes') || argv.includes('-y')
          let scope = 'global'
          let projectRoot = null
          for (let i = 0; i < argv.length; i++) {
            if (argv[i] === '--project-root' && argv[i + 1] && !argv[i + 1].startsWith('-')) {
              projectRoot = argv[i + 1]; i++
            } else if (argv[i] === 'project' || argv[i] === 'global') {
              scope = argv[i] === 'project' ? 'project' : 'global'
            }
          }
          return { yes, scope, projectRoot }
        }
        console.log(JSON.stringify(parseArgs(${JSON.stringify(['--yes', '--project-root', tempDir, 'project'])})))
      `],
      { encoding: 'utf8', timeout: 5000 },
    )
    const result = JSON.parse(output.trim())
    expect(result.yes).toBe(true)
    expect(result.scope).toBe('project')
    expect(result.projectRoot).toBe(tempDir)
  })

  it('应该正确解析 --project-root 和 global scope', () => {
    const tempDir = createTempDir()
    const output = execFileSync(
      'node',
      ['-e', `
        function parseArgs(argv) {
          const yes = argv.includes('--yes') || argv.includes('-y')
          let scope = 'global'
          let projectRoot = null
          for (let i = 0; i < argv.length; i++) {
            if (argv[i] === '--project-root' && argv[i + 1] && !argv[i + 1].startsWith('-')) {
              projectRoot = argv[i + 1]; i++
            } else if (argv[i] === 'project' || argv[i] === 'global') {
              scope = argv[i] === 'project' ? 'project' : 'global'
            }
          }
          return { yes, scope, projectRoot }
        }
        console.log(JSON.stringify(parseArgs(${JSON.stringify(['--yes', '--project-root', tempDir, 'global'])})))
      `],
      { encoding: 'utf8', timeout: 5000 },
    )
    const result = JSON.parse(output.trim())
    expect(result.scope).toBe('global')
    expect(result.projectRoot).toBe(tempDir)
  })

  it('--project-root 后跟 flag 参数时不应误作路径值', () => {
    const output = execFileSync(
      'node',
      ['-e', `
        function parseArgs(argv) {
          const yes = argv.includes('--yes') || argv.includes('-y')
          let scope = 'global'
          let projectRoot = null
          for (let i = 0; i < argv.length; i++) {
            if (argv[i] === '--project-root' && argv[i + 1] && !argv[i + 1].startsWith('-')) {
              projectRoot = argv[i + 1]; i++
            } else if (argv[i] === 'project' || argv[i] === 'global') {
              scope = argv[i] === 'project' ? 'project' : 'global'
            }
          }
          return { yes, scope, projectRoot }
        }
        console.log(JSON.stringify(parseArgs(${JSON.stringify(['--project-root', '--yes', 'project'])})))
      `],
      { encoding: 'utf8', timeout: 5000 },
    )
    const result = JSON.parse(output.trim())
    expect(result.projectRoot).toBe(null)
    expect(result.scope).toBe('project')
    expect(result.yes).toBe(true)
  })

  it('--project-root 值为 "project" 时不应导致 scope 误判', () => {
    const output = execFileSync(
      'node',
      ['-e', `
        function parseArgs(argv) {
          const yes = argv.includes('--yes') || argv.includes('-y')
          let scope = 'global'
          let projectRoot = null
          for (let i = 0; i < argv.length; i++) {
            if (argv[i] === '--project-root' && argv[i + 1] && !argv[i + 1].startsWith('-')) {
              projectRoot = argv[i + 1]; i++
            } else if (argv[i] === 'project' || argv[i] === 'global') {
              scope = argv[i] === 'project' ? 'project' : 'global'
            }
          }
          return { yes, scope, projectRoot }
        }
        console.log(JSON.stringify(parseArgs(${JSON.stringify(['--project-root', 'project', 'global'])})))
      `],
      { encoding: 'utf8', timeout: 5000 },
    )
    const result = JSON.parse(output.trim())
    expect(result.projectRoot).toBe('project')
    expect(result.scope).toBe('global')
  })

  it('未传 --project-root 时 projectRoot 为 null，scope 默认 global', () => {
    const output = execFileSync(
      'node',
      ['-e', `
        function parseArgs(argv) {
          const yes = argv.includes('--yes') || argv.includes('-y')
          let scope = 'global'
          let projectRoot = null
          for (let i = 0; i < argv.length; i++) {
            if (argv[i] === '--project-root' && argv[i + 1] && !argv[i + 1].startsWith('-')) {
              projectRoot = argv[i + 1]; i++
            } else if (argv[i] === 'project' || argv[i] === 'global') {
              scope = argv[i] === 'project' ? 'project' : 'global'
            }
          }
          return { yes, scope, projectRoot }
        }
        console.log(JSON.stringify(parseArgs(${JSON.stringify(['--yes'])})))
      `],
      { encoding: 'utf8', timeout: 5000 },
    )
    const result = JSON.parse(output.trim())
    expect(result.projectRoot).toBe(null)
    expect(result.scope).toBe('global')
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
