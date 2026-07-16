import { tool } from '@opencode-ai/plugin'
import { z } from 'zod'

import { TOOL } from '../schemas/ae-asset-schema.js'
import { checkOcrInstalled, parseOcrJson, runOcr, spawnOcrViewer, type OcrFinding, type OcrJsonResult } from '../services/ocr-service.js'

/**
 * 所有 OCR 顶级命令。
 * command=auto 时由工具层根据 args 自动推断。
 */
const OCR_COMMANDS = [
  'auto',
  'review',
  'scan',
  'config',
  'llm',
  'rules',
  'viewer',
  'session',
  'version',
] as const

/**
 * 需要自动注入 LLM 环境变量的命令。
 * 其他命令（如 version、config set、session list）不需要 LLM。
 */
const LLM_REQUIRED_COMMANDS = new Set(['review', 'scan'])

/**
 * 输出 JSON 且需要解析为结构化审查发现的命令。
 */
const JSON_REVIEW_COMMANDS = new Set(['review', 'scan'])

export const aeOcrTool = tool({
  description: [
    '通过 OpenCodeReview (ocr) CLI 执行 AI 代码审查，自动从 opencode provider 配置获取 LLM 凭据。',
    '',
    '功能说明：',
    '- 支持 OCR 所有命令：review/scan/config/llm/rules/viewer/session/version',
    '- review: 基于 Git diff 审查代码变更（workspace/branch/commit 模式）',
    '- scan: 审查整个文件或目录（无需 Git diff）',
    '- config: 管理 OCR 配置（set/unset/provider/model）',
    '- llm: LLM 工具（test/providers）',
    '- rules: 检查规则匹配',
    '- viewer: 启动 WebUI 会话查看器',
    '- session: 列出/查看审查会话',
    '- version: 显示版本信息',
    '- command=auto（默认）时根据 args 自动推断命令',
    '- 自动从 opencode provider 配置获取 API key/baseURL/model，透传为 OCR_LLM_* 环境变量',
    '- review/scan 输出 JSON 格式，按 severity/category 分组返回结构化审查发现',
    '',
    '适用场景：',
    '- 审查 Git 变更（staged/unstaged/untracked、branch diff、单 commit）',
    '- 审查整个文件或目录（无 Git 历史场景）',
    '- 审查代码与目标期望是否一致（通过 background 参数传入需求上下文）',
    '- 管理 OCR 配置、检查 LLM 连通性、查看审查会话',
    '',
    '不适用场景：',
    '- 需求/设计/原型文档审查（使用 ae:review）',
    '- 非代码文件的审查',
  ].join('\n'),
  args: {
    command: z.enum(OCR_COMMANDS).default('auto').describe('ocr 命令，auto 时根据 args 自动推断'),
    args: z.array(z.string()).optional().describe('直接透传给 ocr CLI 的额外参数数组，如 ["--from","main","--to","feature"] 或 ["set","provider","anthropic"]'),

    // review/scan 常用参数（便捷映射，等价于 args 透传）
    repo: z.string().optional().describe('Git 仓库根目录，默认当前工作目录'),
    from: z.string().optional().describe('源 ref（如 main），用于 branch diff 审查'),
    to: z.string().optional().describe('目标 ref（如 feature-branch），用于 branch diff 审查'),
    commit: z.string().optional().describe('单个 commit hash，审查该 commit 相对父的变更'),
    path: z.string().optional().describe('scan 命令的扫描路径，或 rules check 的文件路径'),
    background: z.string().optional().describe('业务/需求上下文，提升审查质量'),
    backgroundFile: z.string().optional().describe('从 Markdown 文件加载业务上下文（最多 8000 字符）'),
    rule: z.string().optional().describe('自定义规则 JSON 文件路径'),
    exclude: z.string().optional().describe('排除模式（逗号分隔的 gitignore 风格）'),
    timeout: z.number().min(1).optional().describe('超时分钟数，默认 10'),
    concurrency: z.number().min(1).optional().describe('并发文件审查数，默认 8'),
    model: z.string().optional().describe('覆盖 LLM 模型'),
    format: z.enum(['text', 'json']).optional().describe('输出格式，默认 json（review/scan）'),
    preview: z.boolean().optional().describe('预览将审查的文件列表（不调用 LLM）'),
    resume: z.string().optional().describe('从之前的审查会话恢复（review 命令）'),
    audience: z.enum(['human', 'agent']).optional().describe('输出受众，默认 agent'),

    // scan 专属参数
    noPlan: z.boolean().optional().describe('scan: 跳过 per-file PLAN 预处理'),
    noDedup: z.boolean().optional().describe('scan: 跳过 per-batch 去重'),
    noSummary: z.boolean().optional().describe('scan: 跳过项目级摘要'),
    batch: z.string().optional().describe('scan: 批处理策略 none/by-language/by-directory'),
    maxTokensBudget: z.number().min(0).optional().describe('scan: token 总量上限'),

    // session 子命令参数
    sessionSubcommand: z.enum(['list', 'show']).optional().describe('session 子命令：list/show'),
    sessionId: z.string().optional().describe('session show 的会话 ID'),
    json: z.boolean().optional().describe('session/config: 输出 JSON 格式'),
    limit: z.number().min(0).optional().describe('session list: 限制列出数量'),

    // config 子命令参数
    configSubcommand: z.enum(['set', 'unset', 'provider', 'model']).optional().describe('config 子命令'),
    key: z.string().optional().describe('config set/unset 的键名'),
    value: z.string().optional().describe('config set 的值'),

    // viewer 参数
    addr: z.string().optional().describe('viewer: 监听地址，默认 localhost:5483'),

    // review/scan 高级参数
    tools: z.string().optional().describe('自定义工具配置 JSON 文件路径（覆盖内置工具配置）'),
    maxTools: z.number().min(0).optional().describe('每个文件最大工具调用轮次（0=模板默认，最小 10）'),
    maxGitProcs: z.number().min(0).optional().describe('最大并发 git 子进程数，默认 16'),
  },
  execute: async (args, ctx) => {
    const resolvedCommand = resolveCommand(args)
    ctx.metadata({ title: `ocr ${resolvedCommand}`, metadata: { command: resolvedCommand } })

    try {
      if (resolvedCommand === 'version') {
        const info = await checkOcrInstalled()
        return {
          output: info.installed ? `ocr 版本: ${info.version ?? 'unknown'}（来源: ${info.source}）` : 'ocr 未安装',
          metadata: { tool: TOOL.AE_OCR, command: 'version', installed: info.installed },
        }
      }

      if (resolvedCommand === 'viewer') {
        const viewerArgs = buildCliArgs('viewer', args)
        const addr = (args.addr as string) ?? 'localhost:5483'
        const { pid, logPath } = spawnOcrViewer(viewerArgs, { cwd: args.repo ?? ctx.directory })

        ctx.metadata({ title: `ocr viewer 已启动 (PID: ${pid})`, metadata: { command: 'viewer', addr, pid, logPath } })

        return {
          output: [
            'ocr viewer 已在后台启动',
            `PID: ${pid}`,
            `监听地址: http://${addr}`,
            `日志路径: ${logPath}`,
            '',
            '子进程在后台独立运行，不会阻塞当前会话。',
            `可在浏览器中打开 http://${addr} 查看审查会话。`,
            '请读取上述日志文件分析执行情况；建议等待若干秒后再次读取，对比内容以确认服务已就绪。',
            `如需停止: taskkill /PID ${pid} /F（Windows）或 kill ${pid}（Unix）。`,
          ].join('\n'),
          metadata: { tool: TOOL.AE_OCR, command: 'viewer', addr, pid, logPath },
        }
      }

      const cliArgs = buildCliArgs(resolvedCommand, args)

      const needsLlm = LLM_REQUIRED_COMMANDS.has(resolvedCommand) && !args.preview
      const isTest = resolvedCommand === 'llm' && (args.args?.includes('test') ?? false)
      const timeoutMs = ((args.timeout ?? 10) * 60 * 1000)

      ctx.metadata({ title: `ocr ${resolvedCommand} 执行中...`, metadata: { command: resolvedCommand, args: cliArgs } })

      const { stdout, stderr, exitCode, llmEnvError } = await runOcr(cliArgs, {
        cwd: args.repo ?? ctx.directory,
        timeoutMs: needsLlm || isTest ? timeoutMs : 30000,
        skipLlmEnv: !needsLlm && !isTest,
      })

      if (exitCode !== 0 && !stdout.trim()) {
        const hint = llmEnvError ? `\nLLM 配置获取失败: ${llmEnvError}` : ''
        return {
          output: `ocr ${resolvedCommand} 执行失败（exit code: ${exitCode}）。${hint}\nstderr: ${stderr}`,
          metadata: { tool: TOOL.AE_OCR, command: resolvedCommand, exitCode, error: true, llmEnvError },
        }
      }

      if (JSON_REVIEW_COMMANDS.has(resolvedCommand) && (args.format ?? 'json') === 'json' && !args.preview) {
        try {
          const result = parseOcrJson(stdout)
          const findings = result.comments ?? []
          const grouped = groupFindingsBySeverity(findings)

          return {
            output: formatReviewResult(result, grouped, stderr, exitCode),
            metadata: {
              tool: TOOL.AE_OCR,
              command: resolvedCommand,
              exitCode,
              filesReviewed: result.summary?.files_reviewed ?? 0,
              totalFindings: findings.length,
              highCount: grouped.high.length,
              mediumCount: grouped.medium.length,
              lowCount: grouped.low.length,
            },
          }
        } catch {
          // JSON 解析失败，返回原始输出
        }
      }

      return {
        output: stdout.trim() || stderr.trim() || `ocr ${resolvedCommand} 完成（无输出）`,
        metadata: { tool: TOOL.AE_OCR, command: resolvedCommand, exitCode },
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return `ae-ocr 执行失败: ${message}`
    }
  },
})

function resolveCommand(args: Record<string, unknown>): string {
  if (args.command && args.command !== 'auto') return args.command as string

  const rawArgs = (args.args as string[] | undefined) ?? []
  if (rawArgs.length > 0) {
    const known = ['review', 'scan', 'config', 'llm', 'rules', 'viewer', 'session', 'version', 'r', 's', 'v', 'sessions']
    if (known.includes(rawArgs[0])) return rawArgs[0]
  }

  if (args.from || args.to || args.commit || args.background || args.backgroundFile || args.resume) return 'review'
  if (args.path || args.noPlan !== undefined || args.batch) return 'scan'
  if (args.preview) return 'review'

  return 'review'
}

function buildCliArgs(command: string, args: Record<string, unknown>): string[] {
  const rawArgs = (args.args as string[] | undefined) ?? []
  const cliArgs: string[] = [command]

  if (command === 'review') {
    cliArgs.push('--audience', (args.audience as string) ?? 'agent')
    if (args.preview) cliArgs.push('--preview')
    else cliArgs.push('--format', (args.format as string) ?? 'json')
    if (args.from) cliArgs.push('--from', args.from as string)
    if (args.to) cliArgs.push('--to', args.to as string)
    if (args.commit) cliArgs.push('--commit', args.commit as string)
    if (args.background) cliArgs.push('--background', args.background as string)
    if (args.backgroundFile) cliArgs.push('--background-file', args.backgroundFile as string)
    if (args.rule) cliArgs.push('--rule', args.rule as string)
    if (args.exclude) cliArgs.push('--exclude', args.exclude as string)
    if (args.concurrency) cliArgs.push('--concurrency', String(args.concurrency))
    if (args.model) cliArgs.push('--model', args.model as string)
    if (args.resume) cliArgs.push('--resume', args.resume as string)
    if (args.repo) cliArgs.push('--repo', args.repo as string)
    if (args.timeout) cliArgs.push('--timeout', String(args.timeout))
    if (args.tools) cliArgs.push('--tools', args.tools as string)
    if (args.maxTools !== undefined) cliArgs.push('--max-tools', String(args.maxTools))
    if (args.maxGitProcs !== undefined) cliArgs.push('--max-git-procs', String(args.maxGitProcs))
  } else if (command === 'scan') {
    cliArgs.push('--audience', (args.audience as string) ?? 'agent')
    if (args.preview) cliArgs.push('--preview')
    else cliArgs.push('--format', (args.format as string) ?? 'json')
    if (args.path) cliArgs.push('--path', args.path as string)
    if (args.exclude) cliArgs.push('--exclude', args.exclude as string)
    if (args.concurrency) cliArgs.push('--concurrency', String(args.concurrency))
    if (args.model) cliArgs.push('--model', args.model as string)
    if (args.repo) cliArgs.push('--repo', args.repo as string)
    if (args.timeout) cliArgs.push('--timeout', String(args.timeout))
    if (args.background) cliArgs.push('--background', args.background as string)
    if (args.noPlan) cliArgs.push('--no-plan')
    if (args.noDedup) cliArgs.push('--no-dedup')
    if (args.noSummary) cliArgs.push('--no-summary')
    if (args.batch) cliArgs.push('--batch', args.batch as string)
    if (args.maxTokensBudget !== undefined) cliArgs.push('--max-tokens-budget', String(args.maxTokensBudget))
    if (args.tools) cliArgs.push('--tools', args.tools as string)
    if (args.maxTools !== undefined) cliArgs.push('--max-tools', String(args.maxTools))
    if (args.maxGitProcs !== undefined) cliArgs.push('--max-git-procs', String(args.maxGitProcs))
  } else if (command === 'config') {
    const sub = (args.configSubcommand as string) ?? rawArgs[0]
    if (sub) {
      cliArgs.push(sub)
      if (sub === 'set' && args.key) {
        cliArgs.push(args.key as string)
        if (args.value !== undefined) cliArgs.push(args.value as string)
      } else if (sub === 'unset' && args.key) {
        cliArgs.push(args.key as string)
      }
    }
  } else if (command === 'llm') {
    const sub = rawArgs[0] ?? 'test'
    cliArgs.push(sub)
  } else if (command === 'rules') {
    cliArgs.push('check')
    if (args.path) cliArgs.push(args.path as string)
    if (args.repo) cliArgs.push('--repo', args.repo as string)
    if (args.rule) cliArgs.push('--rule', args.rule as string)
  } else if (command === 'viewer') {
    if (args.addr) cliArgs.push('--addr', args.addr as string)
  } else if (command === 'session' || command === 'sessions') {
    const sub = (args.sessionSubcommand as string) ?? rawArgs[0] ?? 'list'
    cliArgs.push(sub)
    if (sub === 'show' && args.sessionId) {
      cliArgs.push(args.sessionId as string)
    }
    if (sub === 'list' || sub === 'ls') {
      if (args.repo) cliArgs.push('--repo', args.repo as string)
      if (args.json) cliArgs.push('--json')
      if (args.limit !== undefined) cliArgs.push('--limit', String(args.limit))
    }
    if (sub === 'show') {
      if (args.repo) cliArgs.push('--repo', args.repo as string)
      if (args.json) cliArgs.push('--json')
    }
  }

  // 追加用户直接透传的额外参数（去掉已被结构化参数覆盖的第一个子命令词）
  const skipFirst = ['config', 'llm', 'session', 'sessions'].includes(command) && rawArgs.length > 0
  const extraArgs = skipFirst ? rawArgs.slice(1) : rawArgs
  cliArgs.push(...extraArgs)

  return cliArgs
}

interface GroupedFindings {
  high: OcrFinding[]
  medium: OcrFinding[]
  low: OcrFinding[]
}

function groupFindingsBySeverity(findings: OcrFinding[]): GroupedFindings {
  const grouped: GroupedFindings = { high: [], medium: [], low: [] }
  for (const f of findings) {
    const severity = (f.severity ?? '').toLowerCase()
    if (severity === 'critical' || severity === 'high') {
      grouped.high.push(f)
    } else if (severity === 'medium') {
      grouped.medium.push(f)
    } else {
      grouped.low.push(f)
    }
  }
  return grouped
}

function formatReviewResult(
  result: OcrJsonResult,
  grouped: GroupedFindings,
  stderr: string,
  exitCode: number,
): string {
  const lines: string[] = []
  const total = (result.comments ?? []).length
  const filesReviewed = result.summary?.files_reviewed ?? 0

  lines.push('## OCR 代码审查结果')
  lines.push('')
  lines.push(`**审查文件数**: ${filesReviewed > 0 ? filesReviewed : 'unknown'}`)
  lines.push(`**发现问题数**: ${grouped.high.length} high / ${grouped.medium.length} medium / ${grouped.low.length} low`)
  if (result.session_id) {
    lines.push(`**Session ID**: ${result.session_id}`)
  }
  if (result.status && result.status !== 'success') {
    lines.push(`**状态**: ${result.status}`)
  }
  if (result.message && total === 0) {
    lines.push(`**消息**: ${result.message}`)
  }
  if (exitCode !== 0) {
    lines.push(`⚠️ ocr 退出码非 0（${exitCode}），结果可能不完整`)
  }
  lines.push('')

  if (grouped.high.length > 0) {
    lines.push('### High Priority')
    lines.push('')
    for (const f of grouped.high) lines.push(formatFinding(f))
  }

  if (grouped.medium.length > 0) {
    lines.push('### Medium Priority')
    lines.push('')
    for (const f of grouped.medium) lines.push(formatFinding(f))
  }

  if (grouped.low.length > 0) {
    lines.push('### Low Priority')
    lines.push('')
    for (const f of grouped.low) lines.push(formatFinding(f))
  }

  if (total === 0) {
    lines.push('审查完成 — 未发现问题。')
  }

  if (stderr.trim()) {
    lines.push('')
    lines.push('---')
    lines.push(`**stderr**: ${stderr.trim()}`)
  }

  return lines.join('\n')
}

function formatFinding(f: OcrFinding): string {
  const location = f.path
    ? `**\`${f.path}:${f.start_line ?? 0}${f.end_line && f.end_line !== f.start_line ? `-${f.end_line}` : ''}\`**`
    : '**(未定位)**'

  const category = f.category ? ` [${f.category}]` : ''
  const content = f.content ?? '(无描述)'

  let line = `- ${location}${category} — ${content}`

  if (f.suggestion_code) {
    const suggestion = f.suggestion_code.length > 200
      ? f.suggestion_code.slice(0, 200) + '…'
      : f.suggestion_code
    line += `\n  > 建议修复: \`${suggestion}\``
  }

  return line
}
