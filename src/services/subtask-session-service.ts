import { getGlobalClient } from './client-holder.js'

/**
 * 子任务会话：创建临时会话 → 发送提示 → 提取结果 → 删除会话。
 *
 * 统一封装 ae-image/ae-audio/ae-video/ae-brainstorm/ae-review-scope-analyze
 * 五个工具共有的"临时会话调用 LLM"模式，消除各服务中重复的
 * create→prompt→delete 逻辑。
 */

export interface SubtaskSessionOptions {
  /** 会话标题，用于调试和日志追踪 */
  title: string
  /** 用户提示文本 */
  prompt: string
  /** 系统提示词；可选，不传时由 opencode 默认行为决定 */
  system?: string
  /** 模型引用 "provider/model"；可选，不传时由 opencode 动态路由 */
  model?: { providerID: string; modelID: string }
  /** 文件附件；可选，用于图片/音频/视频等多模态输入 */
  filePart?: { mime: string; url: string }
  /** 自定义工具权限；默认禁用文件修改和提问 */
  tools?: Record<string, boolean>
}

export interface SubtaskSessionResult {
  /** 从 assistant 响应中提取的纯文本 */
  text: string
  /** 会话 ID（已删除，仅供日志） */
  sessionId: string
}

/**
 * 解析 "provider/model" 格式的模型字符串为 { providerID, modelID }。
 * 不含 "/" 时返回 undefined，由调用方决定是否指定模型。
 */
export function parseModelReference(model: string | undefined): { providerID: string; modelID: string } | undefined {
  if (!model) return undefined
  const slashIndex = model.indexOf('/')
  if (slashIndex <= 0) return undefined
  const modelID = model.slice(slashIndex + 1)
  if (!modelID) return undefined
  return {
    providerID: model.slice(0, slashIndex),
    modelID,
  }
}

/**
 * 从 session.prompt 返回的 parts 中提取纯文本。
 */
function extractTextFromParts(parts: Array<{ type: string; text?: string }>): string {
  return parts
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text as string)
    .join('\n')
    .trim()
}

/**
 * 默认工具权限：启用所有工具但禁用文件修改和提问，确保子任务会话只读且无人值守。
 */
const DEFAULT_TOOLS: Record<string, boolean> = {
  '*': true,
  edit: false,
  write: false,
  patch: false,
  question: false,
}

export class SubtaskSessionError extends Error {
  constructor(public code: string, message: string) {
    super(message)
    this.name = 'SubtaskSessionError'
  }
}

/**
 * 运行一个临时子任务会话：创建 → 提示 → 提取文本 → 删除。
 *
 * 阻塞等待 LLM 完成后返回 SubtaskSessionResult。
 * 会话在完成后自动删除，失败时也尝试清理。
 *
 * @throws {SubtaskSessionError} 当客户端未初始化、会话创建失败或提示失败时抛出
 */
export async function runSubtaskSession(options: SubtaskSessionOptions): Promise<SubtaskSessionResult> {
  const client = getGlobalClient()
  if (!client) {
    throw new SubtaskSessionError(
      'client_unavailable',
      '子任务会话不可用：opencode 客户端未初始化。',
    )
  }

  let sessionId: string | undefined
  try {
    const createRes = await client.session.create({
      body: { title: options.title },
    })
    if (createRes.error || !createRes.data?.id) {
      throw new SubtaskSessionError(
        'session_create_failed',
        `创建临时会话失败 - ${createRes.error?.data?.message ?? createRes.error?.name ?? '未知错误'}`,
      )
    }
    sessionId = createRes.data.id

    const parts: Array<Record<string, unknown>> = [
      { type: 'text', text: options.prompt },
    ]
    if (options.filePart) {
      parts.push({ type: 'file', mime: options.filePart.mime, url: options.filePart.url })
    }

    const promptBody: Record<string, unknown> = {
      parts,
      tools: options.tools ?? DEFAULT_TOOLS,
    }
    if (options.system) {
      promptBody.system = options.system
    }
    if (options.model) {
      promptBody.model = options.model
    }

    const promptRes = await client.session.prompt({
      path: { id: sessionId },
      body: promptBody as Parameters<typeof client.session.prompt>[0]['body'],
    })

    if (promptRes.error) {
      throw new SubtaskSessionError(
        'prompt_failed',
        `模型调用失败 - ${promptRes.error.data?.message ?? promptRes.error.name ?? '未知错误'}`,
      )
    }

    const text = extractTextFromParts(promptRes.data?.parts ?? [])
    return { text, sessionId }
  } catch (error) {
    if (error instanceof SubtaskSessionError) throw error
    throw new SubtaskSessionError(
      'session_error',
      `子任务会话异常：${error instanceof Error ? error.message : String(error)}`,
    )
  } finally {
    if (sessionId) {
      await safeDeleteSession(client, sessionId)
    }
  }
}

/**
 * 安全删除临时会话：遇到速率限制时延迟重试一次，其余错误静默忽略。
 */
async function safeDeleteSession(client: NonNullable<ReturnType<typeof getGlobalClient>>, sessionId: string): Promise<void> {
  try {
    await client.session.delete({ path: { id: sessionId } })
  } catch (err) {
    if (!isRateLimitLikeError(err)) return
    await new Promise<void>((r) => setTimeout(r, 1200))
    try {
      await client.session.delete({ path: { id: sessionId } })
    } catch {
      // 重试仍失败时放弃清理，不影响主流程
    }
  }
}

/**
 * 判断错误是否为速率限制类错误。
 */
export function isRateLimitLikeError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const msg = error.message.toLowerCase()
  return /rate[\s_-]*limit|429|too\s*many|quota|capacity|throttl|resource[\s_-]*exhausted|overloaded|usage[\s_-]*limit/.test(msg)
}
