import { spawn, type ChildProcess } from 'node:child_process'
import { closeSync, createWriteStream, existsSync, mkdirSync, openSync, type WriteStream } from 'node:fs'
import path from 'node:path'

import iconv from 'iconv-lite'

/**
 * Node.js 原生 Buffer.toString 支持的编码
 */
const NATIVE_ENCODINGS = new Set([
  'utf8', 'utf-8', 'latin1', 'ascii', 'utf16le', 'ucs2', 'base64', 'hex',
])

/**
 * 将 Buffer 按指定编码解码为字符串。
 *
 * - utf8/latin1/ascii 等 Node.js 原生编码直接用 Buffer.toString
 * - gbk/cp936/gb2312/big5/shift_jis 等通过 iconv-lite 解码
 */
function decodeBuffer(buf: Buffer, encoding: string): string {
  const lower = encoding.toLowerCase()
  if (NATIVE_ENCODINGS.has(lower)) {
    return buf.toString(lower as BufferEncoding)
  }
  return iconv.decode(buf, encoding)
}

export interface AsyncSpawnOptions {
  /**
   * 完整 shell 命令字符串。
   *
   * 安全说明：shell=true 时此字符串直接传给 shell 执行，
   * 调用方须确保 command 来源可信或已转义，避免命令注入。
   */
  command: string
  /** 工作目录 */
  cwd: string
  /** 日志文件绝对路径 */
  logPath: string
  /** 解码子进程输出使用的编码，默认 utf8。
   *  子进程输出按此编码解码后以 UTF-8 写入日志文件，避免乱码。 */
  encoding?: string
  /** 是否使用 shell 执行，默认 true */
  shell?: boolean
}

export interface AsyncSpawnResult {
  pid: number
  logPath: string
  child: ChildProcess
}

/**
 * 以后台进程启动命令，通过 Node.js pipe 捕获 stdout/stderr，
 * 按 encoding 解码后以 UTF-8 流式追加写入日志文件。
 *
 * 架构要点：
 * - stdio: pipe（非 inherit），Node.js 完全控制 I/O 和编码转换
 * - 日志文件始终 UTF-8，通过 WriteStream 流式写入（非同步 I/O）
 * - 不向当前控制台输出任何内容，避免干扰 opencode 终端
 * - Unix: detached + unref，子进程独立存活，不阻止事件循环退出
 * - Windows: 不使用 detached（Node.js 限制：detached + shell + pipe 不传数据），
 *   仅 unref 让事件循环不等待子进程；opencode 为长驻进程，会话期间子进程持续运行
 */
export function spawnAsyncWithLogging(opts: AsyncSpawnOptions): AsyncSpawnResult {
  const { command, cwd, logPath, encoding = 'utf8', shell = true } = opts

  // 确保日志目录存在
  const logDir = path.dirname(logPath)
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true })
  }

  // 预创建日志文件，确保调用方可立即读取
  const touchFd = openSync(logPath, 'a')
  closeSync(touchFd)

  // 创建可写流复用于日志写入，避免同步 I/O 阻塞事件循环
  const logStream: WriteStream = createWriteStream(logPath, { flags: 'a', encoding: 'utf8' })

  const isWin32 = process.platform === 'win32'

  const child = spawn(command, {
    cwd,
    // Windows 上 detached + shell + pipe 不传数据（Node.js 已知限制），
    // 仅 Unix 使用 detached 实现子进程独立存活
    detached: !isWin32,
    shell,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  // 统一处理 stdout/stderr 数据：解码后以 UTF-8 写日志文件
  // 不向当前控制台输出，避免干扰 opencode 终端
  function handleOutput(buf: Buffer) {
    try {
      const text = decodeBuffer(buf, encoding)
      logStream.write(text)
    } catch {
      // 解码或写入失败时忽略，避免中断子进程
    }
  }

  child.stdout?.on('data', (buf: Buffer) => handleOutput(buf))
  child.stderr?.on('data', (buf: Buffer) => handleOutput(buf))

  // spawn 错误兜底写入日志
  child.on('error', (err) => {
    try {
      logStream.write(`\n[spawn error] ${err.message}\n`)
    } catch {
      // 忽略
    }
  })

  // 记录子进程退出信息，便于判断是否异常终止
  child.on('exit', (code, signal) => {
    const parts: string[] = ['\n[process exit]']
    if (code !== null) {
      parts.push(`code=${code}`)
    }
    if (signal !== null) {
      parts.push(`signal=${signal}`)
    }
    try {
      logStream.write(parts.join(' ') + '\n')
    } catch {
      // 忽略
    }
  })

  child.unref()

  const pid = child.pid
  if (pid === undefined) {
    throw new Error('子进程启动失败，未能获取 PID')
  }

  return { pid, logPath, child }
}
