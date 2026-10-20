#!/usr/bin/env node
/**
 * OfficeCLI 官方 CLI 包装器（零依赖，可复制到任意技能内部使用）
 *
 * 用法：
 *   node officecli.mjs ensure                    检测 officecli 是否已安装，未安装则按优先级安装
 *   node officecli.mjs version                   输出已安装版本
 *   node officecli.mjs run -- <officecli 参数…>  执行官方 CLI 并落日志
 *   node officecli.mjs run --json -- <参数…>     额外输出 JSON 元信息
 *
 * 安装渠道优先级（一次只试一种，失败即换下一种）：
 *   1. npm  i -g @officecli/officecli     全平台
 *   2. brew install officecli              macOS / Linux
 *   3. scoop install officecli            Windows
 *   4. 官方安装脚本                        curl|bash (unix) / irm|iex (PowerShell)
 *
 * 共享真源：tools/shared/officecli.mjs
 * 同步到：skills/<skill>/scripts/officecli.mjs（由 tools/sync-shared.mjs 分发）
 */

import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SKILL_NAME = 'ae-officecli'
const LOG_DIR_NAME = ['ae', 'logs', 'officecli']
const IS_WINDOWS = process.platform === 'win32'

/* ------------------------------------------------------------------ *
 * 路径与日志
 * ------------------------------------------------------------------ */

function resolveLogDir(cwd = process.cwd()) {
  return join(resolve(cwd), ...LOG_DIR_NAME)
}

function timestamp(date = new Date()) {
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

function writeLog(label, content, cwd = process.cwd()) {
  const dir = resolveLogDir(cwd)
  const safeLabel = String(label ?? 'log').replace(/[^a-zA-Z0-9._-]+/g, '-')
  const filePath = join(dir, `${timestamp()}-${safeLabel}.log`)
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    // 忽略：日志目录创建失败不应阻断主流程
  }
  try {
    writeFileSync(filePath, content ?? '', 'utf8')
  } catch {
    // 忽略
  }
  return filePath
}

/* ------------------------------------------------------------------ *
 * 外部命令探测
 * ------------------------------------------------------------------ */

function commandExists(command) {
  const probe = IS_WINDOWS ? 'where' : 'which'
  const result = spawnSync(probe, [command], { encoding: 'utf8', shell: IS_WINDOWS })
  if (result.status !== 0) {
    return false
  }
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
  return output.length > 0
}

function resolveOfficeCliPath() {
  const probe = IS_WINDOWS ? 'where' : 'which'
  const result = spawnSync(probe, ['officecli'], { encoding: 'utf8', shell: IS_WINDOWS })
  if (result.status !== 0) {
    return null
  }
  const first = `${result.stdout ?? ''}`.split(/\r?\n/).map((line) => line.trim()).find(Boolean)
  return first ?? null
}

/* ------------------------------------------------------------------ *
 * 安装
 * ------------------------------------------------------------------ */

const INSTALL_SCRIPT_UNIX = 'https://raw.githubusercontent.com/iOfficeAI/OfficeCLI/main/install.sh'
const INSTALL_SCRIPT_WINDOWS = 'https://raw.githubusercontent.com/iOfficeAI/OfficeCLI/main/install.ps1'

/**
 * 依次尝试各安装渠道。每个渠道返回 { channel, ok, detail }。
 *
 * 注意：一次只应使用一种安装渠道。若此前用 Homebrew 装过，请先
 * `brew uninstall officecli/homebrew-officecli/officecli` 再换用其他渠道。
 */
function installCandidates() {
  const candidates = []

  if (commandExists('npm')) {
    candidates.push({ channel: 'npm', command: 'npm', args: ['install', '-g', '@officecli/officecli'] })
  }
  if (!IS_WINDOWS && commandExists('brew')) {
    candidates.push({ channel: 'brew', command: 'brew', args: ['install', 'officecli'] })
  }
  if (IS_WINDOWS && commandExists('scoop')) {
    candidates.push({ channel: 'scoop', command: 'scoop', args: ['install', 'officecli'] })
  }
  if (IS_WINDOWS) {
    candidates.push({
      channel: 'install-script',
      command: 'powershell',
      args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', `irm ${INSTALL_SCRIPT_WINDOWS} | iex`],
    })
  } else {
    candidates.push({
      channel: 'install-script',
      command: 'sh',
      args: ['-c', `curl -fsSL ${INSTALL_SCRIPT_UNIX} | bash`],
    })
  }

  return candidates
}

function runInstallCandidate(candidate, cwd) {
  const result = spawnSync(candidate.command, candidate.args, {
    encoding: 'utf8',
    cwd,
    shell: false,
    maxBuffer: 20 * 1024 * 1024,
  })
  const output = [
    `$ ${candidate.command} ${candidate.args.join(' ')}`,
    `exit=${result.status}`,
    result.stdout ?? '',
    result.stderr ?? '',
  ].join('\n')
  const logPath = writeLog(`install-${candidate.channel}`, output, cwd)
  return {
    channel: candidate.channel,
    ok: result.status === 0,
    detail: output.slice(0, 2000),
    logPath,
  }
}

/**
 * 检测 officecli 是否可用；不可用则尝试安装。
 * @returns {{ installed: boolean, version: string|null, channel: string, path: string|null, attempts: object[] }}
 */
export function ensureOfficeCli(options = {}) {
  const cwd = options.cwd ?? process.cwd()
  const autoInstall = options.autoInstall !== false

  const existingPath = resolveOfficeCliPath()
  if (existingPath) {
    const version = probeVersion(cwd)
    if (version) {
      return { installed: true, version, channel: 'existing', path: existingPath, attempts: [] }
    }
  }

  if (!autoInstall) {
    return { installed: false, version: null, channel: 'none', path: null, attempts: [] }
  }

  const attempts = []
  for (const candidate of installCandidates()) {
    const attempt = runInstallCandidate(candidate, cwd)
    attempts.push(attempt)
    if (!attempt.ok) {
      continue
    }
    const installedPath = resolveOfficeCliPath()
    if (!installedPath) {
      continue
    }
    const version = probeVersion(cwd)
    if (version) {
      return { installed: true, version, channel: candidate.channel, path: installedPath, attempts }
    }
  }

  return { installed: false, version: null, channel: 'failed', path: null, attempts }
}

function probeVersion(cwd) {
  const result = spawnSync('officecli', ['--version'], { encoding: 'utf8', cwd, shell: IS_WINDOWS })
  if (result.status !== 0) {
    return null
  }
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
  return output.split(/\r?\n/)[0]?.trim() || 'unknown'
}

/* ------------------------------------------------------------------ *
 * 执行
 * ------------------------------------------------------------------ */

/**
 * 执行 officecli 命令，stdout 直通，stderr 收集，日志落盘。
 * @returns {Promise<{ code: number, stdout: string, stderr: string, logPath: string }>}
 */
export function runOfficeCli(args, options = {}) {
  const cwd = options.cwd ?? process.cwd()
  const timeoutMs = options.timeoutMs ?? 30000
  const label = options.label ?? (args[0] ?? 'cmd')
  const command = options.binary ?? 'officecli'

  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      env: { ...process.env, ...(options.env ?? {}) },
    })

    let stdout = ''
    let stderr = ''
    let settled = false

    const timer = timeoutMs > 0
      ? setTimeout(() => {
        if (settled) {
          return
        }
        settled = true
        try {
          child.kill('SIGTERM')
        } catch {
          // 忽略
        }
        const logPath = writeLog(label, `TIMEOUT after ${timeoutMs}ms\n${stdout}\n${stderr}`, cwd)
        resolvePromise({ code: 124, stdout, stderr, logPath, timedOut: true })
      }, timeoutMs)
      : null

    child.stdout?.on('data', (chunk) => {
      const text = chunk.toString()
      stdout += text
      if (options.echo !== false) {
        process.stdout.write(text)
      }
    })
    child.stderr?.on('data', (chunk) => {
      const text = chunk.toString()
      stderr += text
      if (options.echo !== false) {
        process.stderr.write(text)
      }
    })
    child.on('error', (error) => {
      if (settled) {
        return
      }
      settled = true
      if (timer) {
        clearTimeout(timer)
      }
      const logPath = writeLog(label, `SPAWN ERROR: ${error.message}\n${stderr}`, cwd)
      resolvePromise({ code: 127, stdout, stderr: `${stderr}${error.message}`, logPath })
    })
    child.on('close', (code) => {
      if (settled) {
        return
      }
      settled = true
      if (timer) {
        clearTimeout(timer)
      }
      const logPath = writeLog(label, `$ officecli ${args.join(' ')}\n\n${stdout}\n${stderr}`, cwd)
      resolvePromise({ code: code ?? 0, stdout, stderr, logPath, timedOut: false })
    })
  })
}

/* ------------------------------------------------------------------ *
 * CLI 入口
 * ------------------------------------------------------------------ */

function printManualInstructions() {
  const lines = [
    'officecli 自动安装失败，请手动安装其一：',
    '  npm  install -g @officecli/officecli',
  ]
  if (!IS_WINDOWS) {
    lines.push('  brew install officecli')
    lines.push(`  curl -fsSL ${INSTALL_SCRIPT_UNIX} | bash`)
  } else {
    lines.push('  scoop install officecli')
    lines.push(`  irm ${INSTALL_SCRIPT_WINDOWS} | iex`)
  }
  lines.push('安装后校验：officecli --version')
  return lines.join('\n')
}

async function main() {
  const argv = process.argv.slice(2)
  const sub = argv[0]

  if (!sub || sub === '--help' || sub === '-h' || sub === 'help') {
    process.stdout.write([
      '用法:',
      '  node officecli.mjs ensure',
      '  node officecli.mjs version',
      '  node officecli.mjs run [--json] [--timeout <ms>] -- <officecli 参数…>',
      '',
    ].join('\n'))
    return 0
  }

  if (sub === 'ensure') {
    const result = ensureOfficeCli()
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    if (!result.installed) {
      process.stderr.write(`${printManualInstructions()}\n`)
      return 1
    }
    return 0
  }

  if (sub === 'version') {
    const version = probeVersion(process.cwd())
    if (!version) {
      process.stderr.write('officecli 未安装，请先运行: node officecli.mjs ensure\n')
      return 1
    }
    process.stdout.write(`${version}\n`)
    return 0
  }

  if (sub === 'run') {
    let json = false
    let timeoutMs = 30000
    const rest = []

    for (let i = 1; i < argv.length; i += 1) {
      const item = argv[i]
      if (item === '--') {
        rest.push(...argv.slice(i + 1))
        break
      }
      if (item === '--json') {
        json = true
        continue
      }
      if (item === '--timeout') {
        timeoutMs = Number(argv[i + 1]) || timeoutMs
        i += 1
        continue
      }
      rest.push(item)
    }

    if (rest.length === 0) {
      process.stderr.write('缺少 officecli 参数。用法: node officecli.mjs run -- <参数…>\n')
      return 2
    }

    const binary = resolveOfficeCliPath()
    if (!binary) {
      const ensured = ensureOfficeCli()
      if (!ensured.installed) {
        process.stderr.write(`${printManualInstructions()}\n`)
        return 1
      }
    }

    const result = await runOfficeCli(rest, { timeoutMs })
    if (json) {
      process.stderr.write(`${JSON.stringify({
        code: result.code,
        logPath: result.logPath,
        timedOut: Boolean(result.timedOut),
      })}\n`)
    }
    return result.code
  }

  process.stderr.write(`未知子命令: ${sub}\n`)
  return 2
}

const invokedDirectly = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false

if (invokedDirectly) {
  main()
    .then((code) => {
      process.exitCode = code
    })
    .catch((error) => {
      process.stderr.write(`${error?.stack ?? error}\n`)
      process.exitCode = 1
    })
}

export { SKILL_NAME, resolveOfficeCliPath, commandExists, printManualInstructions }
