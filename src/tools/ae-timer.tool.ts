import { tool } from '@opencode-ai/plugin'
import { z } from 'zod'

export const aeTimerTool = tool({
  description: [
    '倒计时等待工具：暂停当前会话指定时长后继续执行下一步任务。',
    '',
    '功能说明：',
    '- 设置指定秒数的倒计时，倒计时期间 LLM 会话暂停（不消耗 token）',
    '- 倒计时结束后工具返回结果，LLM 自动继续执行后续步骤',
    '- 等待期间每 30 秒发送一次心跳更新进度，防止超时断连',
    '- 支持用户中断提前结束等待',
    '- 可传入 nextStep 描述等待结束后应执行的下一步操作，工具返回时会原样携带，防止长时间等待后上下文丢失',
    '',
    '适用场景：',
    '- 页面加载后等待固定时长再操作',
    '- 等待异步任务完成（配合状态检查轮询使用）',
    '- 任何需要在操作之间插入固定等待的场景',
    '',
    '不适用场景：',
    '- 不用于轮询检查页面状态（返回后应使用对应工具检查）',
    '- 不用于需要精确到毫秒级的定时任务',
  ].join('\n'),
  args: {
    duration: z.number().int().min(1).describe('等待时长（秒）'),
    label: z.string().optional().describe('等待原因描述，例如"等待页面加载"、"等待资源就绪"'),
    nextStep: z.string().optional().describe('等待结束后应执行的下一步操作描述，工具返回时原样携带，防止长等待后上下文丢失'),
  },
  execute: async (args, ctx) => {
    const seconds = args.duration
    const label = args.label ?? '等待'
    const nextStep = args.nextStep ?? ''
    const startTime = Date.now()

    ctx.metadata({ title: `${label}... 剩余 ${seconds}s`, metadata: { remaining: seconds, total: seconds } })

    return new Promise((resolve) => {
      const HEARTBEAT_MS = 30_000

      const heartbeat = setInterval(() => {
        const elapsed = Math.round((Date.now() - startTime) / 1000)
        const remaining = Math.max(0, seconds - elapsed)
        ctx.metadata({ title: `${label}... 剩余 ${remaining}s`, metadata: { remaining, total: seconds } })
      }, HEARTBEAT_MS)

      const mainTimer = setTimeout(() => {
        clearInterval(heartbeat)
        const elapsed = Math.round((Date.now() - startTime) / 1000)
        resolve(formatResult(label, seconds, elapsed, false, nextStep))
      }, seconds * 1000)

      if (ctx.abort) {
        ctx.abort.addEventListener('abort', () => {
          clearTimeout(mainTimer)
          clearInterval(heartbeat)
          const elapsed = Math.round((Date.now() - startTime) / 1000)
          resolve(formatResult(label, seconds, elapsed, true, nextStep))
        }, { once: true })
      }
    })
  },
})

function formatResult(label: string, planned: number, elapsed: number, aborted: boolean, nextStep: string): { output: string; metadata: Record<string, unknown> } {
  const parts = [`${label}完成，已等待 ${elapsed} 秒${aborted ? `（计划 ${planned} 秒，被中断）` : ''}。`]
  if (nextStep) {
    parts.push('')
    parts.push(`下一步操作：${nextStep}`)
  } else {
    parts.push('请继续执行下一步任务。')
  }
  return {
    output: parts.join('\n'),
    metadata: { duration: planned, elapsed, label, aborted: aborted || undefined, nextStep: nextStep || undefined },
  }
}
