#!/usr/bin/env node
/**
 * 后台命令执行器（零依赖）
 *
 * 以分离进程方式启动一条长驻命令，stdout/stderr 持续写入日志文件，
 * 立即返回 PID 与日志路径，不阻塞会话。
 *
 * 用法：
 *   node scripts/async-bash.mjs --command "npm run dev" [--cwd <目录>] [--encoding utf8|gbk|cp936|...] [--label <标签>]
 *
 * 输出：JSON 到 stdout
 *   { "pid": 12345, "logPath": "ae/logs/playwright/20261020-141233-dev.log", "command": "...", "startedAt": "..." }
 *
 * 编码：非 utf8 编码通过设置环境变量 LANG / chcp 让子进程使用对应代码页，
 * 日志文件本身始终以 UTF-8 写入。
 */

import { spawn } from 'node:child_process'
import { createWriteStream, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const LOG_ROOT = ['ae', 'logs', 'playwright']

const ENCODING_ENV = {
  utf8: { LANG: 'C.UTF-8' },
  gbk: { LANG: 'zh_CN.GBK' },
  cp936: { LANG: 'zh_CN.GBK' },
  gb2312: { LANG: 'zh_CN.GB2312' },
  big5: { LANG: 'zh_TW.BIG5' },
  shift_jis: { LANG: 'ja_JP.SJIS' },
  latin1: { LANG: 'C' },
  ascii: { LANG: 'C' },
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

function randomSuffix() {
  return Math.random().toString(36).slice(2, 8)
}

function resolveLogDir(cwd) {
  return join(resolve(cwd), ...LOG_ROOT)
}

function parseArgs(argv) {
  const options = { command: null, cwd: process.cwd(), encoding: 'utf8', label: null }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    const next = () => {
      const value = argv[i + 1]
      i += 1
      return value
    }
    if (item === '--command' || item === '-c') options.command = next()
    else if (item === '--cwd') options.cwd = next()
    else if (item === '--encoding') options.encoding = next()
    else if (item === '--label') options.label = next()
    else if (item === '--help' || item === '-h') options.help = true
  }
  return options
}

export function startBackgroundCommand(options) {
  const cwd = resolve(options.cwd ?? process.cwd())
  const command = options.command
  if (!command || !String(command).trim()) {
    throw new Error('缺少 --command')
  }

  const logDir = resolveLogDir(cwd)
  mkdirSync(logDir, { recursive: true })

  const label = (options.label ?? String(command).slice(0, 24))
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'cmd'
  const logPath = join(logDir, `${timestamp()}-${label}-${randomSuffix()}.log`)

  const env = { ...process.env, ...(ENCODING_ENV[options.encoding] ?? ENCODING_ENV.utf8) }

  const isWindows = process.platform === 'win32'
  const child = spawn(command, {
    cwd,
    env,
    shell: true,
    detached: !isWindows,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const logStream = createWriteStream(logPath, { flags: 'a', encoding: 'utf8' })
  logStream.write(`$ ${command}\ncwd: ${cwd}\nencoding: ${options.encoding}\nstarted: ${new Date().toISOString()}\n\n`)

  child.stdout?.on('data', (chunk) => logStream.write(chunk.toString()))
  child.stderr?.on('data', (chunk) => logStream.write(chunk.toString()))

  child.on('error', (error) => {
    logStream.write(`\n[spawn error] ${error.message}\n`)
    logStream.end()
  })

  child.on('close', (code) => {
    logStream.write(`\n[exited] code=${code} at ${new Date().toISOString()}\n`)
    logStream.end()
  })

  if (!isWindows) {
    try {
      child.unref()
    } catch {
      // 忽略：部分平台不支持 unref
    }
  }

  return {
    pid: child.pid ?? null,
    logPath,
    command,
    cwd,
    encoding: options.encoding,
    startedAt: new Date().toISOString(),
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    process.stdout.write([
      '用法: node async-bash.mjs --command "<命令>" [--cwd <目录>] [--encoding utf8] [--label <标签>]',
      '',
    ].join('\n'))
    return 0
  }

  try {
    const result = startBackgroundCommand(options)
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    return 0
  } catch (error) {
    process.stderr.write(`启动后台命令失败: ${error?.message ?? error}\n`)
    return 1
  }
}

const invokedDirectly = process.argv[1]
  ? process.argv[1].endsWith('async-bash.mjs')
  : false

if (invokedDirectly) {
  process.exitCode = main()
}
