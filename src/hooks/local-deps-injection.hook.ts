import { existsSync } from 'node:fs'
import type { Hooks } from '@opencode-ai/plugin'

import { computeLocalDeps, formatLocalDepsForInjection, isLocalDepsSupported } from '../services/local-deps-service.js'
import { resolve } from 'node:path'
import { isInsideRoot } from '../utils/path-utils.js'

/**
 * tool.execute.after hook：Edit 工具后置即时依赖注入。
 *
 * 核心理念（来自头脑风暴共识）：
 * - 不依赖持久化图谱，消除 freshness 滞后问题
 * - LLM 调用 Edit 工具编辑文件后，自动即时解析该文件的上下游依赖
 * - 将依赖分析追加到工具输出，帮助 LLM 了解影响范围并决定后续操作
 *
 * 为什么用 tool.execute.after 而非 .before：
 * - tool.execute.before 的 output.args 是工具参数，修改会破坏工具执行
 * - tool.execute.after 的 output.output 是字符串结果，可安全追加上下文
 * - 编辑后注入依赖信息，LLM 可据此决定是否需要同步更新调用方
 *
 * 行为：
 * - 拦截 opencode 内置 edit/write/patch 工具调用
 * - 从 input.args 提取目标文件路径
 * - 对目标文件调用 computeLocalDeps（仅上游依赖，下游扫描异步延迟）
 * - 将格式化结果追加到 output.output
 * - 异常静默，不阻断编辑操作
 */

const EDIT_TOOL_NAMES = new Set(['edit', 'write', 'patch'])

function isEditTool(toolName: string | undefined): boolean {
  if (!toolName) {
    return false
  }
  return EDIT_TOOL_NAMES.has(toolName.toLowerCase())
}

function extractTargetFilePath(args: unknown): string | undefined {
  if (!args || typeof args !== 'object') {
    return undefined
  }
  const candidates = ['filePath', 'file', 'path', 'filename', 'target_file', 'file_path']
  const record = args as Record<string, unknown>
  for (const key of candidates) {
    const value = record[key]
    if (typeof value === 'string' && value.length > 0) {
      return value
    }
  }
  return undefined
}

/**
 * 从 hook input 获取 worktree。
 * opencode 的 tool.execute.after input 不含 worktree，
 * 但插件初始化时可通过闭邦捕获 hostWorktree。
 *
 * @param hostWorktree 插件初始化时从 input.worktree 获取的确定性路径
 */
export function createLocalDepsInjectionHook(hostWorktree: string): NonNullable<Hooks['tool.execute.after']> {
  const resolvedWorktree = resolve(hostWorktree)

  return async (input, output) => {
    try {
      const toolName = input.tool
      if (!isEditTool(toolName)) {
        return
      }

      const filePath = extractTargetFilePath(input.args)
      if (!filePath) {
        return
      }

      if (!isLocalDepsSupported(filePath)) {
        return
      }

      // 跳过不存在的文件或工作区外的文件
      const absolutePath = resolve(resolvedWorktree, filePath)
      if (!isInsideRoot(resolvedWorktree, absolutePath) || !existsSync(absolutePath)) {
        return
      }

      // 仅解析上游依赖（快速，单文件解析），下游扫描异步延迟避免阻塞
      const result = computeLocalDeps(resolvedWorktree, filePath, { skipDownstream: true })
      const injectionText = formatLocalDepsForInjection(result)

      if (typeof output.output === 'string') {
        output.output = `${output.output}\n\n${injectionText}`
      }
    } catch {
      // 注入失败绝不阻断编辑操作
    }
  }
}
