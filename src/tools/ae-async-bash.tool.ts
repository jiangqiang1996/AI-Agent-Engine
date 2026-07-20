import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { tool } from '@opencode-ai/plugin'
import { z } from 'zod'

import { spawnAsyncWithLogging } from '../utils/async-spawn.js'

const LOG_BASE_DIR = 'ae/logs'

function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  )
}

/**
 * 生成默认日志文件路径：ae/logs/<command>-<timestamp>-<random>.log
 * 文件名中的非 ASCII 字符替换为连字符，确保跨平台与 shell 安全。
 */
function generateDefaultLogPath(worktree: string, command: string): string {
  const safeName = command.replace(/[^\x20-\x7E]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'command'
  const timestamp = formatTimestamp(new Date())
  const random = randomBytes(3).toString('hex')
  const fileName = `${safeName}-${timestamp}-${random}.log`
  return path.join(worktree, LOG_BASE_DIR, fileName)
}

export const aeAsyncBashTool = tool({
  description: [
    '异步命令执行器：bash 工具的非阻塞版本，启动指定命令后立即返回，禁止阻塞当前上下文。',
    '',
    '功能说明：',
    '- 以后台子进程启动命令，父进程（工具）立即返回',
    '- Unix 上使用 detached 子进程独立存活；Windows 上依赖 opencode 长驻进程保活（Node.js 限制）',
    '- 通过 Node.js pipe 捕获 stdout/stderr，按 encoding 解码后以 UTF-8 流式追加写入日志文件',
    '- 同时将原始字节原样输出到控制台，由终端自行解码显示',
    '- 不指定 logPath 时，自动生成到当前项目 ae/logs/ 目录下的日志文件',
    '- 返回子进程 PID 和日志文件路径，便于后续排查或终止',
    '- 不返回错误码或退出码：子进程真实执行状态需通过读取日志文件判断',
    '',
    '编码说明（重要）：',
    '- encoding 参数：解码子进程输出使用的编码，默认 utf8',
    '- 日志文件始终以 UTF-8 编码写入，确保跨平台可读',
    '- 控制台输出保持子进程原始字节，由终端自行解码显示',
    '- 日志出现乱码时，更换 encoding 重试：Windows 中文原生程序用 gbk 或 cp936',
    '- 支持: utf8, gbk, cp936, gb2312, big5, shift_jis, latin1, ascii 等',
    '',
    '输出与日志读取指引（重要）：',
    '- 返回值中包含 "日志路径" 字段，指向一个 .log 文件',
    '- 该日志文件是动态追加写入的：子进程持续运行期间，stdout/stderr 会不断追加到文件末尾',
    '- 要判断命令是否真正启动成功，需读取该日志文件查看输出内容',
    '- 读取日志后建议等待若干秒再读一次，对比两次内容以确认子进程仍在产出输出或已稳定',
    '- 日志中出现错误堆栈、异常信息或进程已退出的提示，即代表执行失败',
    '- 日志长时间无新增内容且无监听端口/服务就绪标志，也视为启动异常',
    '- 禁止因调用本工具失败或日志显示失败而降级使用 bash 工具执行阻塞型命令',
    '',
    '重复启动同一服务的前置检查（硬约束）：',
    '- 启动服务类命令（web 服务器、watch 进程、长连接服务等）前，若与之前已启动的命令指向同一服务，必须先检查旧进程是否仍在运行',
    '- 检查方式：用 bash 工具按返回的 PID 验证存活（Windows: tasklist /FI "PID eq <pid>"；Unix: ps -p <pid>），或读取旧日志路径确认服务仍就绪',
    '- 旧进程仍在运行时二选一：',
    '  - 复用：无需重启则直接复用旧实例，后续引用旧 PID 和日志路径，不再调用本工具',
    '  - 杀死重启：需应用新配置/新代码或旧实例异常时，先用 bash 工具终止旧进程（Windows: taskkill /PID <pid> /F；Unix: kill <pid>，必要时 kill -9），再重新调用本工具',
    '- 禁止在未检查的情况下重复启动同一服务，避免端口占用、资源泄漏或多实例冲突',
    '- 仅可终止由本工具（或本会话）启动的进程，不得以此流程终止用户其他进程',
    '',
    '适用场景：',
    '- 启动本地开发服务器、静态服务器等需要长期运行的进程',
    '- 任何需要"fire-and-forget"的命令执行场景',
    '',
    '不适用场景：',
    '- 需要获取命令输出或退出码的场景（使用 bash 工具，但前提是命令本身不存在阻塞风险）',
    '- 需要等待命令完成的场景（使用 bash 工具，但前提是命令本身不存在阻塞风险）',
    '- 确定会自行终止且有明确终点的一次性命令（如 git、ls、build、test，直接用 bash 工具即可）',
    '',
    '注意事项：',
    '- 命令通过 shell 执行，支持管道、重定向等 shell 语法',
    '- 日志文件始终以追加模式写入，保留历史输出',
    '- 子进程不会随会话结束而终止，需用户手动管理进程生命周期',
    '- 调用失败时禁止在任何情况下降级使用 bash 工具执行阻塞型命令（如 web 服务、watch 进程等）',
    '- 不确定命令是否存在阻塞风险时，必须使用本工具后台执行，禁止用 bash 工具',
  ].join('\n'),
  args: {
    command: z.string().min(1).describe('要在后台执行的 shell 命令'),
    cwd: z.string().optional().describe('工作目录，默认为当前会话目录'),
    logPath: z.string().optional().describe('日志文件路径（相对或绝对），子进程 stdout 和 stderr 将追加写入此文件；不指定则自动生成到 ae/logs/ 目录'),
    encoding: z.string().default('utf8').describe(
      '解码子进程输出使用的编码，默认 utf8。' +
      '日志出现乱码时更换此值重试：Windows 中文原生程序用 gbk 或 cp936。' +
      '支持: utf8, gbk, cp936, gb2312, big5, shift_jis, latin1, ascii 等',
    ),
  },
  execute: async (args, ctx) => {
    const cwd = args.cwd ? path.resolve(ctx.directory, args.cwd) : ctx.directory

    if (!fs.existsSync(cwd)) {
      return `错误: 工作目录 "${cwd}" 不存在`
    }

    const resolvedLogPath = args.logPath ? path.resolve(cwd, args.logPath) : generateDefaultLogPath(cwd, args.command)

    let result: { pid: number; logPath: string }

    try {
      result = spawnAsyncWithLogging({
        command: args.command,
        cwd,
        logPath: resolvedLogPath,
        encoding: args.encoding,
      })
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e)
      return `错误: 启动命令失败 — ${reason}。日志路径: ${resolvedLogPath}`
    }

    const pid = result.pid

    if (pid === -1) {
      return `错误: 子进程启动失败，未能获取 PID。日志路径: ${resolvedLogPath}`
    }

    ctx.metadata({ title: `异步命令已启动 (PID: ${pid})`, metadata: { pid, command: args.command, logPath: resolvedLogPath } })

    const lines = [
      '异步命令已启动',
      `PID: ${pid}`,
      `命令: ${args.command}`,
      `工作目录: ${cwd}`,
      `日志路径: ${resolvedLogPath}`,
      `解码编码: ${args.encoding}`,
      '',
      '子进程在后台运行，不会阻塞当前会话。',
      'stdout/stderr 通过 Node.js pipe 捕获，按指定编码解码后以 UTF-8 流式写入日志文件，同时原样输出到控制台。',
      '请读取上述日志文件分析执行情况；建议等待若干秒后再次读取，对比内容以确认子进程状态。',
      '日志出现错误堆栈/异常/进程退出提示即代表失败；长时间无新增输出也视为启动异常。',
      '日志出现乱码时，更换 encoding 参数重试（如 gbk、cp936）。',
      '禁止因本工具失败而降级使用 bash 工具执行阻塞型命令。',
      '',
      '重复启动同一服务前（硬约束）：若后续需再次启动同一服务，必须先用 bash 按上述 PID 检查旧进程是否存活',
      '（Windows: tasklist /FI "PID eq ' + pid + '"；Unix: ps -p ' + pid + '）；',
      '存活则复用本实例（引用上述 PID/日志，不再调用本工具），或需重启时先用 bash 终止旧进程',
      '（Windows: taskkill /PID ' + pid + ' /F；Unix: kill ' + pid + '，必要时 kill -9）再重新启动。',
      '禁止未检查重复启动，避免端口占用/资源泄漏/多实例冲突；仅可终止由本工具或本会话启动的进程。',
    ]

    return {
      title: `异步命令已启动 (PID: ${pid})`,
      output: lines.join('\n'),
      metadata: { pid, command: args.command, cwd, logPath: resolvedLogPath, encoding: args.encoding },
    }
  },
})
