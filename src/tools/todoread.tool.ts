import { tool, type ToolDefinition } from '@opencode-ai/plugin/tool'
import { z } from 'zod'
import { readFile, readdir } from 'fs/promises'
import { existsSync, statSync } from 'fs'
import { join, extname, resolve, normalize, relative } from 'path'

/**
 * todoread工具：【handoff技能专用工具】读取当前会话相关/ae-plan生成的计划文件中的待办任务列表
 * 优先选择当前会话中使用过的计划文件，多个则提示用户选择，默认推荐最后使用的计划
 * 无会话相关计划时读取docs/plans/下最新的计划文件，解析实现单元中的复选框任务
 * 支持指定file_path参数读取特定计划文件
 */
export const todoreadTool: ToolDefinition = tool({
  description: [
    '【handoff技能专用工具】读取当前会话相关/ae-plan生成的计划文件中的待办任务列表。',
    '优先选择当前会话中使用过的计划文件，多个则提示用户选择，默认推荐最后使用的计划。',
    '无会话相关计划时读取docs/plans/下最新的计划文件，解析实现单元中的复选框任务。',
    '支持指定file_path参数读取特定计划文件。',
  ].join('\n'),
  args: {
    file_path: z.string().optional().describe('可选：指定要读取的计划文件路径，默认自动识别当前会话相关的计划文件'),
  },
  async execute(args, context) {
    const todoItems: string[] = []
    const workDir = context.directory
    const plansDir = join(workDir, 'docs', 'plans')
    const absolutePlansDir = resolve(plansDir)

    // 安全校验：确保目标路径在docs/plans/目录下，防止路径遍历
    const validatePathInPlansDir = (inputPath: string): string | null => {
      const absolutePath = resolve(workDir, normalize(inputPath))
      if (!absolutePath.startsWith(absolutePlansDir)) {
        return null
      }
      if (!existsSync(absolutePath)) {
        return null
      }
      if (extname(absolutePath) !== '.md' || !absolutePath.endsWith('-plan.md')) {
        return null
      }
      return absolutePath
    }

    // 1. 确定要读取的文件路径（优先级：用户指定 > 当前会话提到过的 > 近期唯一 > 最新）
    let targetFile: string | null = args.file_path ? validatePathInPlansDir(args.file_path) : null

    if (args.file_path && !targetFile) {
      return '无效的文件路径：仅支持读取docs/plans/目录下的*-plan.md格式计划文件。'
    }

    if (!targetFile) {
      if (!existsSync(plansDir)) {
        return '当前无待办任务：未找到docs/plans/计划目录。'
      }

      try {
        // 读取目录下所有符合ae-plan命名规范的计划文件
        const allPlanFiles = (await readdir(plansDir))
          .filter(f => extname(f) === '.md' && f.endsWith('-plan.md'))
          .map(f => ({
            path: join(plansDir, f),
            mtime: statSync(join(plansDir, f)).mtime.getTime(),
            name: f
          }))
          .sort((a, b) => b.mtime - a.mtime)

        if (allPlanFiles.length === 0) {
          return '当前无待办任务：docs/plans/目录下无计划文件。'
        }

        // 优先级1：从当前会话历史中提取所有提到过的计划文件
        const mentionedPlans = new Map<string, { path: string, name: string }>()
        const ctx = context as { history?: Array<{ content?: string }> }
        if (ctx.history && Array.isArray(ctx.history)) {
          for (let i = ctx.history.length - 1; i >= 0; i--) {
            const msg = ctx.history[i]
            if (typeof msg.content === 'string') {
              const matches = msg.content.match(/(docs\/plans\/[a-zA-Z0-9\-_.]+\-plan\.md)/g)
              if (matches?.length) {
                matches.forEach((relativePath: string) => {
                  if (mentionedPlans.has(relativePath)) return
                  const validatedPath = validatePathInPlansDir(relativePath)
                  if (validatedPath) {
                    mentionedPlans.set(relativePath, {
                      path: validatedPath,
                      name: relativePath.replace('docs/plans/', '')
                    })
                  }
                })
              }
            }
          }
        }

        // 处理提到过的计划
        if (mentionedPlans.size > 0) {
          const planList = Array.from(mentionedPlans.values())
          if (planList.length === 1) {
            targetFile = planList[0].path
          } else {
            const fileOptions = planList.map((p, idx) =>
              `${idx + 1}. ${p.name}${idx === 0 ? ' (最后使用，默认)' : ''}`
            ).join('\n')
            return `检测到当前会话提到过多个计划文件，请通过 file_path 参数指定要读取的文件：\n${fileOptions}`
          }
        }

        // 优先级2：没有提到过的计划，看近期（24小时内）的计划
        if (!targetFile) {
          const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000
          const recentPlans = allPlanFiles.filter(f => f.mtime > oneDayAgo)

          if (recentPlans.length === 1) {
            targetFile = recentPlans[0].path
          } else if (recentPlans.length > 1) {
            const fileList = recentPlans.map(f => `- ${f.name}`).join('\n')
            return `检测到多个近期计划文件，请通过 file_path 参数指定要读取的文件：\n${fileList}`
          } else {
            targetFile = allPlanFiles[0].path
          }
        }
      } catch (e) {
        return '读取计划目录失败：' + (e as Error).message
      }
    }

    // 2. 读取计划文件并解析待办任务
    try {
      const content = await readFile(targetFile!, 'utf-8')
      const lines = content.split('\n')
      let inImplementUnitSection = false

      for (let i = 0; i < lines.length; i++) {
        const trimmedLine = lines[i].trim()

        if (trimmedLine === '## 实现单元') {
          inImplementUnitSection = true
          continue
        }

        // 遇到下一个非子标题的二级标题，退出实现单元章节
        if (inImplementUnitSection && trimmedLine.startsWith('## ') && !trimmedLine.startsWith('### ')) {
          break
        }

        if (inImplementUnitSection) {
          // 匹配实现单元的待办任务：- [ ] **单元 X：名称** 或 - [x] **单元 X：名称**
          // ae-plan模板格式：- [ ] **单元 1：[名称]**
          if (trimmedLine.match(/^- \[[ xX]\] \*\*单元 \d+：/)) {
            todoItems.push(trimmedLine)
          }
        }
      }
    } catch (e) {
      return `读取计划文件失败：${(e as Error).message}`
    }

    // 3. 格式化返回结果
    if (todoItems.length === 0) {
      return '当前无待办任务：计划文件中未找到待办实现单元。'
    }

    const relativePath = relative(workDir, targetFile!)
    return [
      `# 待办任务列表（来源：${relativePath}）`,
      '',
      ...todoItems
    ].join('\n')
  },
})
