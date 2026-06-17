import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { tool } from '@opencode-ai/plugin'
import { z } from 'zod'

export const aeBackgroundExecTool = tool({
  description: [
    '后台命令执行器：启动指定命令后立即返回，不等待命令完成，不阻塞当前会话。',
    '',
    '功能说明：',
    '- 以 detached 子进程启动命令，父进程（工具）立即返回',
    '- 子进程在后台独立运行，不受会话或 opencode 进程生命周期影响',
    '- 可选将 stdout/stderr 重定向到日志文件，便于后续排查',
    '- 返回子进程 PID，便于后续管理或终止',
    '',
    '适用场景：',
    '- 启动本地开发服务器、静态服务器等需要长期运行的进程',
    '- 任何需要"fire-and-forget"的命令执行场景',
    '',
    '不适用场景：',
    '- 需要获取命令输出或退出码的场景（使用 bash 工具）',
    '- 需要等待命令完成的场景（使用 bash 工具）',
    '- 短期命令（直接用 bash 工具即可）',
    '',
    '注意事项：',
    '- 命令通过 shell 执行，支持管道、重定向等 shell 语法',
    '- 不指定 logPath 时，子进程输出将被丢弃',
    '- 子进程不会随会话结束而终止，需用户手动管理进程生命周期',
  ].join('\n'),
  args: {
    command: z.string().min(1).describe('要在后台执行的 shell 命令'),
    cwd: z.string().optional().describe('工作目录，默认为当前会话目录'),
    logPath: z.string().optional().describe('日志文件路径（相对或绝对），子进程 stdout 和 stderr 将追加写入此文件；不指定则丢弃输出'),
  },
  execute: async (args, ctx) => {
    const cwd = args.cwd ? path.resolve(ctx.directory, args.cwd) : ctx.directory

    if (!fs.existsSync(cwd)) {
      return `错误: 工作目录 "${cwd}" 不存在`
    }

    let stdio: ['ignore', number, number] | ['ignore', 'ignore', 'ignore'] = ['ignore', 'ignore', 'ignore']
    let logFd: number | null = null
    let resolvedLogPath: string | null = null

    if (args.logPath) {
      resolvedLogPath = path.resolve(cwd, args.logPath)
      const logDir = path.dirname(resolvedLogPath)
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true })
      }
      logFd = fs.openSync(resolvedLogPath, 'a')
      stdio = ['ignore', logFd, logFd]
    }

    let child: ReturnType<typeof spawn>
    try {
      child = spawn(args.command, {
        cwd,
        detached: true,
        shell: true,
        stdio,
      })
    } catch (e) {
      if (logFd !== null) fs.closeSync(logFd)
      return `错误: 启动命令失败 — ${e instanceof Error ? e.message : String(e)}`
    }

    child.unref()

    if (logFd !== null) {
      fs.closeSync(logFd)
    }

    const pid = child.pid

    if (pid === undefined) {
      return `错误: 子进程启动失败，未能获取 PID`
    }

    await new Promise((r) => setTimeout(r, 500))

    try {
      if (child.exitCode !== null) {
        return `错误: 命令启动后立即退出，退出码 ${child.exitCode}。${resolvedLogPath ? `请查看日志: ${resolvedLogPath}` : ''}`
      }
    } catch {
      // child 已 unref，访问 exitCode 可能抛出，忽略
    }

    ctx.metadata({ title: `后台命令已启动 (PID: ${pid})`, metadata: { pid, command: args.command } })

    const lines = [
      '后台命令已启动',
      `PID: ${pid}`,
      `命令: ${args.command}`,
      `工作目录: ${cwd}`,
    ]
    if (resolvedLogPath) {
      lines.push(`日志: ${resolvedLogPath}`)
    }
    lines.push('', '命令在后台独立运行，不会阻塞当前会话。')

    return {
      title: `后台命令已启动 (PID: ${pid})`,
      output: lines.join('\n'),
      metadata: { pid, command: args.command, cwd, logPath: resolvedLogPath ?? undefined },
    }
  },
})
