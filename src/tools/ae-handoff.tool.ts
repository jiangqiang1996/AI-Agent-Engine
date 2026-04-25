import { tool, type ToolDefinition } from '@opencode-ai/plugin/tool'
import { z } from 'zod'
import { Effect } from 'effect'
import { readFile, readdir } from 'node:fs/promises'
import { existsSync, statSync, readdirSync as readDirSync } from 'node:fs'
import { join, resolve, normalize, relative } from 'node:path'

import { getGlobalClient } from '../services/client-holder.js'
import { executeHandoff } from '../services/handoff.service.js'
import { isInsideRoot } from '../utils/path-utils.js'
import { showToast } from '../services/toast-holder.js'

function extractTodosFromPlanFile(filePath: string): Promise<string[]> {
  return readFile(filePath, 'utf-8').then((content) => {
    const lines = content.split('\n')
    let inSection = false
    const todos: string[] = []

    for (const raw of lines) {
      const trimmed = raw.trim()
      if (trimmed === '## 实现单元') {
        inSection = true
        continue
      }
      if (inSection && trimmed.startsWith('## ') && !trimmed.startsWith('### ')) {
        break
      }
      if (inSection && trimmed.match(/^- \[[ xX]\] \*\*单元 \d+：/)) {
        todos.push(trimmed)
      }
    }
    return todos
  })
}

function findPlanFileFromHistory(
  history: Array<{ content?: string }>,
  plansDir: string,
  workDir: string,
): string | null {
  const mentioned = new Map<string, string>()

  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i]
    if (typeof msg.content !== 'string') continue

    const normalizedContent = msg.content.replace(/\\/g, '/')
    const matches = normalizedContent.match(/(?:\.\/)?docs\/ae\/plans\/[a-zA-Z0-9\-_.]+\-plan\.md/g)
    if (!matches) continue

    for (const relPath of matches) {
      if (mentioned.has(relPath)) continue
      const absPath = resolve(workDir, normalize(relPath))
      if (!isInsideRoot(workDir, absPath)) continue
      if (existsSync(absPath)) {
        mentioned.set(relPath, absPath)
      }
    }
  }

  if (mentioned.size === 1) {
    return mentioned.values().next().value ?? null
  }
  if (mentioned.size > 1) {
    return mentioned.values().next().value ?? null
  }
  return null
}

function findLatestPlanFile(plansDir: string): string | null {
  if (!existsSync(plansDir)) return null

  try {
    const files = readDirSync(plansDir)
      .filter((f) => f.endsWith('.md') && f.endsWith('-plan.md'))
      .map((f) => ({ name: f, mtime: statSync(join(plansDir, f)).mtime.getTime() }))
      .sort((a, b) => b.mtime - a.mtime)

    return files.length > 0 ? join(plansDir, files[0].name) : null
  } catch {
    return null
  }
}

export const aeHandoffTool: ToolDefinition = tool({
  description: [
    '基于当前会话创建独立的新交接会话，自动提取核心上下文注入新会话，并直接在终端打开新窗口。',
    '',
    '功能说明：',
    '- 自动提取当前会话的核心结论、已确定决策、待办任务、项目上下文',
    '- 自动脱敏所有敏感信息（API密钥、密码、个人隐私信息、私钥等）',
    '- 创建完全独立的新会话，与原会话无历史关联',
    '- 支持压缩等级参数（1-5，默认1）：1=最详细（内容最长，默认），5=最简洁（内容最短）',
    '- 优先注入为系统提示词，不支持时自动降级为系统消息',
    '- 自动跳转到新会话窗口，效果等同于执行 /new 命令',
    '- 返回完整提取内容，无显示长度限制',
    '',
    '适用场景：',
    '- 需要将会话交接给其他团队成员处理时',
    '- 需要开启新会话但不想重复解释当前上下文时',
    '- 需要保存当前工作状态并在新会话中继续时',
  ].join('\n'),
  args: {
    user_requests: z.string().describe('【用户原始请求】：完整保留用户最初提出的需求内容，不做任何修改或转述'),
    goal: z.string().describe('【任务目标】：用一句话概括当前任务的最终目标和后续方向'),
    work_completed: z.string().describe('【已完成工作】：已完成的任务列表，包含相关文件路径和关键实现决策'),
    current_state: z.string().describe('【当前状态】：代码库当前状态、构建/测试状态、环境配置状态'),
    pending_tasks: z.string().describe('【待办任务】：未完成的任务清单、下一步计划、阻塞问题'),
    key_files: z.string().default('None').describe('【关键文件】：最多10个关键文件路径及简要说明，优先包含Git变更和会话中提到的文件'),
    important_decisions: z.string().default('None').describe('【重要决策】：已确定的技术选型、方案选择、优先级决策、权衡考量'),
    explicit_constraints: z.string().default('None').describe('【明确约束】：用户明确要求的限制、项目规范约定，完整保留原文'),
    context_for_continuation: z.string().default('None').describe('【续会注意事项】：需要留意的坑点、警告、相关文档引用'),
    compression_level: z.number().min(1).max(5).default(1).describe('压缩等级：1=最详细（内容最长，默认），2=详细，3=中等，4=简洁，5=最简洁（内容最短）'),
  },
  async execute(args, context) {
    const client = getGlobalClient()
    if (!client) {
      showToast('客户端初始化失败，无法创建新会话，请重启 OpenCode 后重试')
      return '❌ 客户端初始化失败，无法创建新会话，请重启 OpenCode 后重试。'
    }

    const workDir = context.directory
    const plansDir = join(workDir, 'docs', 'ae', 'plans')
    let enrichedPendingTasks = args.pending_tasks

    const ctx = context as { history?: Array<{ content?: string }> }
    if (ctx.history && Array.isArray(ctx.history)) {
      const planFile = findPlanFileFromHistory(ctx.history, plansDir, workDir)
        ?? findLatestPlanFile(plansDir)

      if (planFile) {
        try {
          const todos = await extractTodosFromPlanFile(planFile)
          if (todos.length > 0) {
            const relativePlanPath = relative(workDir, planFile)
            const todoBlock = todos.map((t) => `  ${t}`).join('\n')
            enrichedPendingTasks = `${args.pending_tasks}\n\n计划文件待办（来源：${relativePlanPath}）：\n${todoBlock}`
          }
        } catch {
          // 读取计划文件失败，使用调用方提供的 pending_tasks
        }
      }
    }

    const extractResult = {
      userRequests: args.user_requests,
      goal: args.goal,
      workCompleted: args.work_completed,
      currentState: args.current_state,
      pendingTasks: enrichedPendingTasks,
      keyFiles: args.key_files,
      importantDecisions: args.important_decisions,
      explicitConstraints: args.explicit_constraints,
      contextForContinuation: args.context_for_continuation,
      compressionLevel: args.compression_level,
    }

    return Effect.runPromise(
      executeHandoff(context, client, extractResult).pipe(
        Effect.map((result) => {
          if (!result.success) {
            return `❌ 会话交接失败：${result.error}`
          }

          const lines = [
            '✅ 会话交接成功！已自动切换到新会话窗口。',
            '',
            `新会话地址：${result.sessionUrl}`,
            result.fallbackMode ? '⚠️ 已使用降级模式：上下文已作为普通消息注入新会话' : '',
            '',
            '已提取核心信息：',
          ]

          if (result.extractedSummary.userRequests && result.extractedSummary.userRequests !== 'None') lines.push(`用户请求：${result.extractedSummary.userRequests}`)
          if (result.extractedSummary.goal && result.extractedSummary.goal !== 'None') lines.push(`任务目标：${result.extractedSummary.goal}`)
          if (result.extractedSummary.workCompleted && result.extractedSummary.workCompleted !== 'None') lines.push(`已完成工作：${result.extractedSummary.workCompleted}`)
          if (result.extractedSummary.currentState && result.extractedSummary.currentState !== 'None') lines.push(`当前状态：${result.extractedSummary.currentState}`)
          if (result.extractedSummary.pendingTasks && result.extractedSummary.pendingTasks !== 'None') lines.push(`待办任务：${result.extractedSummary.pendingTasks}`)
          if (result.extractedSummary.keyFiles && result.extractedSummary.keyFiles !== 'None') lines.push(`关键文件：${result.extractedSummary.keyFiles}`)
          if (result.extractedSummary.importantDecisions && result.extractedSummary.importantDecisions !== 'None') lines.push(`重要决策：${result.extractedSummary.importantDecisions}`)
          if (result.extractedSummary.explicitConstraints && result.extractedSummary.explicitConstraints !== 'None') lines.push(`明确约束：${result.extractedSummary.explicitConstraints}`)
          if (result.extractedSummary.contextForContinuation && result.extractedSummary.contextForContinuation !== 'None') lines.push(`续会注意事项：${result.extractedSummary.contextForContinuation}`)
          if (result.extractedSummary.compressionLevel) lines.push(`压缩等级：${result.extractedSummary.compressionLevel}`)

          if (result.extractedSummary.truncated) lines.push('⚠️ 会话内容过长，已自动裁剪非核心历史记录')

          return lines.filter(Boolean).join('\n')
        }),
        Effect.catch((error) => {
          const message = error instanceof Error ? error.message : String(error)
          showToast(`会话交接失败：${message}`)
          return Effect.succeed(`❌ 会话交接失败：${message}`)
        }),
      ),
    )
  },
})
