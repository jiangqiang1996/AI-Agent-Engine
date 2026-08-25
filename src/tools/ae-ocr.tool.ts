import { existsSync } from 'node:fs'
import path from 'node:path'

import { tool } from '@opencode-ai/plugin'
import { z } from 'zod'

import { TOOL } from '../schemas/ae-asset-schema.js'
import { checkOcrInstalled, parseOcrJson, runOcr, writeOcrExecutionLog, type OcrDelegatePreview, type OcrDelegateRule } from '../services/ocr-service.js'

export const aeOcrTool = tool({
  description: [
    '通过 OpenCodeReview (ocr) CLI 的 delegate 委托模式获取代码审查规格。',
    '',
    '功能说明：',
    '- delegate 模式：OCR 负责确定性工程（文件选择 + 规则匹配 + 分组），不调用 LLM',
    '- 宿主代理（当前会话 LLM）拿到审查规格后自行执行审查',
    '- 无需 LLM 凭据配置，无需 API key/baseURL/model 注入',
    '- 审查模型 = 当前会话模型，天然一致',
    '',
    '两个子命令：',
    '- delegate preview：输出可审查文件清单（workspace/range/commit 模式）',
    '- delegate rule：输出按 glob pattern 分组的审查规则文本',
    '',
    '辅助命令：',
    '- version：显示 ocr 版本信息',
    '- completion：生成 shell 补全脚本',
    '',
    '适用场景：',
    '- 代码审查编排：先 preview 获取文件列表，再 rule 获取规则，最后由宿主代理审查',
    '- 审查范围预检：preview 查看哪些文件会被审查、哪些被排除及原因',
    '- 规则检查：rule 查看特定文件适用的审查规则',
    '',
    '不适用场景：',
    '- 需求/设计/原型文档审查（使用 ae:review）',
    '- 非代码文件的审查',
  ].join('\n'),
  args: {
    command: z.enum(['delegate', 'd', 'version', 'completion', 'auto']).default('auto').describe('ocr 命令名；auto 时根据参数推断'),
    subcommand: z.enum(['preview', 'rule']).optional().describe('delegate 子命令：preview（文件清单）/rule（审查规则）'),
    args: z.array(z.string()).optional().describe('直接透传给 ocr CLI 的额外参数'),

    // 审查范围参数
    repo: z.string().optional().describe('Git 仓库根目录，默认当前工作目录'),
    from: z.string().optional().describe('源 ref（如 main），用于 branch diff；需与 to 同时使用'),
    to: z.string().optional().describe('目标 ref（如 feature-branch），用于 branch diff'),
    commit: z.string().optional().describe('单个 commit hash，审查该 commit 相对父的变更'),

    // 上下文与过滤
    background: z.string().optional().describe('业务/需求上下文，嵌入 preview/rule 输出'),
    backgroundFile: z.string().optional().describe('从 Markdown 文件加载业务上下文'),
    exclude: z.string().optional().describe('排除模式（逗号分隔的 gitignore 风格）'),
    rule: z.string().optional().describe('自定义规则 JSON 文件路径'),

    // 输出控制
    format: z.enum(['text', 'json']).optional().describe('输出格式，工具层默认 json（CLI 原生默认 text）'),
    timeout: z.number().min(1).optional().describe('超时分钟数，默认 1（delegate 不调用 LLM，执行快）'),
    maxGitProcs: z.number().min(1).optional().describe('最大并发 git 子进程数，默认 16'),

    // rule 子命令专用
    paths: z.array(z.string()).optional().describe('delegate rule: 要解析规则的文件路径列表（必填，至少 1 个）'),

    // completion 专用
    shell: z.enum(['bash', 'zsh', 'fish', 'powershell']).optional().describe('completion: 目标 shell'),
  },
  execute: async (args, ctx) => {
    const rawCommand = resolveCommand(args)
    const sessionId = ctx.sessionID
    const cwd = args.repo ?? ctx.directory
    ctx.metadata({ title: `ocr ${rawCommand}`, metadata: { command: rawCommand } })

    try {
      if (rawCommand === 'version') {
        const info = await checkOcrInstalled()
        writeOcrExecutionLog(cwd, sessionId, {
          command: 'version',
          cliArgs: ['version'],
          stdout: info.installed ? `版本: ${info.version ?? 'unknown'}（来源: ${info.source}）` : 'ocr 未安装',
        })
        return {
          output: info.installed ? `ocr 版本: ${info.version ?? 'unknown'}（来源: ${info.source}）` : 'ocr 未安装',
          metadata: { tool: TOOL.AE_OCR, command: 'version', installed: info.installed },
        }
      }

      if (rawCommand === 'completion') {
        const shell = args.shell ?? 'bash'
        const cliArgs = ['completion', shell]
        const { stdout, stderr, exitCode } = await runOcr(cliArgs, { cwd, timeoutMs: 10000 })

        writeOcrExecutionLog(cwd, sessionId, { command: 'completion', cliArgs, exitCode, stdout, stderr })

        if (exitCode !== 0 && !stdout.trim()) {
          return {
            output: `ocr completion ${shell} 执行失败（exit code: ${exitCode}）。\nstderr: ${stderr}`,
            metadata: { tool: TOOL.AE_OCR, command: 'completion', exitCode, error: true },
          }
        }
        return {
          output: stdout.trim() || `ocr completion ${shell} 完成（无输出）`,
          metadata: { tool: TOOL.AE_OCR, command: 'completion', shell, exitCode },
        }
      }

      // delegate 模式
      const subcommand = args.subcommand ?? (args.paths ? 'rule' : 'preview')

      // 前置参数校验
      const validationError = validateDelegateArgs(subcommand, args, cwd)
      if (validationError) {
        writeOcrExecutionLog(cwd, sessionId, {
          command: `delegate ${subcommand}`,
          cliArgs: [],
          error: validationError,
        })
        return {
          output: validationError,
          metadata: { tool: TOOL.AE_OCR, command: 'delegate', subcommand, error: true },
        }
      }

      const cliArgs = buildDelegateArgs(subcommand, args)
      const timeoutMs = ((args.timeout ?? 1) * 60 * 1000)

      ctx.metadata({ title: `ocr delegate ${subcommand} 执行中...`, metadata: { command: 'delegate', subcommand, args: cliArgs } })

      const { stdout, stderr, exitCode } = await runOcr(cliArgs, { cwd, timeoutMs })

      writeOcrExecutionLog(cwd, sessionId, { command: `delegate ${subcommand}`, cliArgs, exitCode, stdout, stderr })

      if (exitCode !== 0 && !stdout.trim()) {
        return {
          output: `ocr delegate ${subcommand} 执行失败（exit code: ${exitCode}）。\nstderr: ${stderr}`,
          metadata: { tool: TOOL.AE_OCR, command: 'delegate', subcommand, exitCode, error: true },
        }
      }

      // 空输出兜底
      if (!stdout.trim()) {
        return {
          output: `ocr delegate ${subcommand} 未产出内容（exit code: ${exitCode}）。${stderr.trim() ? `stderr: ${stderr.trim()}` : '可能是无代码变更或无匹配规则。'}`,
          metadata: { tool: TOOL.AE_OCR, command: 'delegate', subcommand, exitCode, error: exitCode !== 0 },
        }
      }

      // JSON 格式时解析结构化输出
      const useJson = (args.format ?? 'json') === 'json'
      if (useJson) {
        try {
          if (subcommand === 'preview') {
            const result = parseOcrJson<OcrDelegatePreview>(stdout)
            return {
              output: formatPreviewResult(result, stderr, exitCode),
              metadata: {
                tool: TOOL.AE_OCR,
                command: 'delegate',
                subcommand: 'preview',
                exitCode,
                mode: result.mode,
                reviewableCount: result.reviewable_count ?? 0,
                excludedCount: result.excluded_count ?? 0,
              },
            }
          } else {
            const result = parseOcrJson<OcrDelegateRule>(stdout)
            return {
              output: formatRuleResult(result, stderr, exitCode),
              metadata: {
                tool: TOOL.AE_OCR,
                command: 'delegate',
                subcommand: 'rule',
                exitCode,
                groupCount: result.groups?.length ?? 0,
              },
            }
          }
        } catch {
          // JSON 解析失败，返回原始输出
        }
      }

      return {
        output: stdout.trim() || stderr.trim() || `ocr delegate ${subcommand} 完成（无输出）`,
        metadata: { tool: TOOL.AE_OCR, command: 'delegate', subcommand, exitCode },
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      writeOcrExecutionLog(args.repo ?? ctx.directory, ctx.sessionID, {
        command: resolveCommand(args),
        cliArgs: [],
        error: message,
      })
      return `ae-ocr 执行失败: ${message}`
    }
  },
})

/**
 * 推断 ocr 命令。
 */
export function resolveCommand(args: Record<string, unknown>): string {
  const command = args.command as string
  if (command && command !== 'auto') {
    return normalizeCommand(command)
  }
  if (args.shell) return 'completion'
  return 'delegate'
}

/**
 * 归一化命令别名到标准名。
 */
export function normalizeCommand(command: string): string {
  switch (command) {
    case 'd': return 'delegate'
    default: return command
  }
}

/**
 * 前置参数校验，返回错误消息或 undefined。
 *
 * 校验规则：
 * - from/to 必须成对使用
 * - commit 与 from/to 互斥
 * - rule 子命令必须传 paths（至少 1 个非空路径）
 * - backgroundFile 文件必须存在
 */
export function validateDelegateArgs(
  subcommand: string,
  args: Record<string, unknown>,
  cwd: string,
): string | undefined {
  const from = args.from as string | undefined
  const to = args.to as string | undefined
  const commit = args.commit as string | undefined

  // commit 与 from/to 互斥（优先于成对校验，避免歧义错误信息）
  if (commit && (from || to)) {
    return '参数错误：commit 与 from/to 互斥，不能同时指定。单 commit 审查请只传 commit，branch diff 请传 from + to。'
  }

  // from/to 成对校验
  if (from && !to) {
    return '参数错误：指定了 from 但缺少 to。branch diff 审查需要 from 和 to 同时传入。'
  }
  if (to && !from) {
    return '参数错误：指定了 to 但缺少 from。branch diff 审查需要 from 和 to 同时传入。'
  }

  // rule 子命令必须传 paths
  if (subcommand === 'rule') {
    const paths = (args.paths as string[] | undefined) ?? []
    const validPaths = paths.filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
    if (validPaths.length === 0) {
      return '参数错误：delegate rule 需要至少 1 个文件路径（paths 参数）。请从 delegate preview 的 reviewable_files 中提取文件路径后传入。'
    }
  }

  // backgroundFile 文件存在性检查
  const backgroundFile = args.backgroundFile as string | undefined
  if (backgroundFile) {
    const resolved = path.isAbsolute(backgroundFile) ? backgroundFile : path.resolve(cwd, backgroundFile)
    if (!existsSync(resolved)) {
      return `参数错误：backgroundFile 指向的文件不存在: ${backgroundFile}`
    }
  }

  // rule 自定义规则文件存在性检查
  const ruleFile = args.rule as string | undefined
  if (ruleFile) {
    const resolved = path.isAbsolute(ruleFile) ? ruleFile : path.resolve(cwd, ruleFile)
    if (!existsSync(resolved)) {
      return `参数错误：rule 指向的自定义规则文件不存在: ${ruleFile}`
    }
  }

  return undefined
}

/**
 * 构建 delegate 子命令的 CLI 参数。
 */
export function buildDelegateArgs(subcommand: string, args: Record<string, unknown>): string[] {
  const cliArgs: string[] = ['delegate', subcommand]

  // 输出格式
  if (subcommand === 'preview' || subcommand === 'rule') {
    cliArgs.push('--format', (args.format as string) ?? 'json')
  }

  // 审查范围
  if (args.from) cliArgs.push('--from', args.from as string)
  if (args.to) cliArgs.push('--to', args.to as string)
  if (args.commit) cliArgs.push('--commit', args.commit as string)

  // 上下文
  if (args.background) cliArgs.push('--background', args.background as string)
  if (args.backgroundFile) cliArgs.push('--background-file', args.backgroundFile as string)

  // 过滤
  if (args.exclude) cliArgs.push('--exclude', args.exclude as string)
  if (args.rule) cliArgs.push('--rule', args.rule as string)
  if (args.repo) cliArgs.push('--repo', args.repo as string)
  if (args.maxGitProcs !== undefined) cliArgs.push('--max-git-procs', String(args.maxGitProcs))

  // rule 子命令的文件路径参数
  if (subcommand === 'rule' && args.paths) {
    const paths = (args.paths as string[]).filter((p) => typeof p === 'string' && p.trim().length > 0)
    cliArgs.push(...paths)
  }

  // 追加用户直接透传的额外参数
  const rawArgs = (args.args as string[] | undefined) ?? []
  cliArgs.push(...rawArgs)

  return cliArgs
}

/**
 * 格式化 delegate preview 结果为 Markdown。
 */
export function formatPreviewResult(result: OcrDelegatePreview, stderr: string, exitCode: number): string {
  const lines: string[] = []

  lines.push('## OCR Delegate Preview — 审查文件清单')
  lines.push('')

  const mode = result.mode ?? 'unknown'
  const reviewable = result.reviewable_files ?? []
  const excluded = result.excluded_files ?? []

  lines.push(`**审查模式**: ${mode}`)
  if (result.from) lines.push(`**From**: ${result.from}`)
  if (result.to) lines.push(`**To**: ${result.to}`)
  if (result.commit) lines.push(`**Commit**: ${result.commit}`)
  if (result.merge_base) lines.push(`**Merge Base**: ${result.merge_base}`)
  if (result.background) lines.push(`**业务上下文**: ${result.background}`)
  lines.push(`**可审查文件**: ${reviewable.length}`)
  lines.push(`**排除文件**: ${excluded.length}`)
  if (result.total_insertions !== undefined) lines.push(`**总新增行**: ${result.total_insertions}`)
  if (result.total_deletions !== undefined) lines.push(`**总删除行**: ${result.total_deletions}`)
  lines.push('')

  if (reviewable.length > 0) {
    lines.push('### 可审查文件')
    lines.push('')
    for (const f of reviewable) {
      lines.push(`- \`${f.path}\` [${f.status}] +${f.insertions}/-${f.deletions}`)
    }
  }

  if (excluded.length > 0) {
    lines.push('')
    lines.push('### 排除文件')
    lines.push('')
    for (const f of excluded) {
      lines.push(`- ~~\`${f.path}\`~~ [${f.status}] +${f.insertions}/-${f.deletions} (${f.exclude_reason})`)
    }
  }

  if (reviewable.length === 0 && excluded.length === 0) {
    lines.push('无可审查的代码变更。')
  }

  if (stderr.trim()) {
    lines.push('')
    lines.push('---')
    lines.push(`**stderr**: ${stderr.trim()}`)
  }

  if (exitCode !== 0) {
    lines.push('')
    lines.push(`⚠️ ocr 退出码非 0（${exitCode}），结果可能不完整`)
  }

  return lines.join('\n')
}

/**
 * 格式化 delegate rule 结果为 Markdown。
 */
export function formatRuleResult(result: OcrDelegateRule, stderr: string, exitCode: number): string {
  const lines: string[] = []

  lines.push('## OCR Delegate Rule — 审查规则解析')
  lines.push('')

  const groups = result.groups ?? []
  lines.push(`**规则组数**: ${groups.length}`)
  lines.push('')

  for (const group of groups) {
    lines.push(`### 规则组 ${group.group_id}: ${group.source} / \`${group.pattern}\``)
    lines.push('')
    lines.push('**适用文件**:')
    for (const f of group.files) {
      lines.push(`- \`${f}\``)
    }
    lines.push('')
    lines.push('**规则内容**:')
    lines.push('')
    lines.push(group.rule)
    lines.push('')
  }

  if (groups.length === 0) {
    lines.push('无匹配的审查规则。')
  }

  if (stderr.trim()) {
    lines.push('---')
    lines.push(`**stderr**: ${stderr.trim()}`)
  }

  if (exitCode !== 0) {
    lines.push('')
    lines.push(`⚠️ ocr 退出码非 0（${exitCode}），结果可能不完整`)
  }

  return lines.join('\n')
}
