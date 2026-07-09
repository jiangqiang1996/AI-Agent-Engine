import { getAndClearNeedsMediaHint } from '../services/model-capability-cache.js'

/**
 * 媒体识别工具引导系统提示。
 * 当模型能力未知时注入，引导 LLM 在遇到 "Cannot read" 错误时
 * 主动调用 ae-image/ae-audio/ae-video 工具识别媒体内容。
 *
 * 触发条件：messages.transform 或 chat.message hook 检测到
 * 有未解决的媒体文件（能力未知）时设置 needsMediaHint 标志。
 * 此函数读取并清除标志，仅在标志为 true 时注入。
 */
const MEDIA_HINT_PROMPT = [
  '<media-recognition-guide>',
  '如果收到 "Cannot read" 或 "this model does not support ... input" 错误，',
  '说明当前模型无法直接处理该媒体文件。请调用对应工具识别内容：',
  '- 图片 → ae-image（参数 file 传入文件路径，可选 prompt 指定识别重点）',
  '- 音频 → ae-audio（参数 file 传入文件路径，可选 prompt 指定识别重点）',
  '- 视频 → ae-video（参数 file 传入文件路径，可选 prompt 指定识别重点）',
  '</media-recognition-guide>',
].join('\n')

/**
 * 在 system.transform hook 中调用。
 * 读取 needsMediaHint 标志，为 true 时向 system 追加媒体识别引导提示。
 * 调用后自动清除标志，确保每次请求只注入一次。
 */
export function injectMediaHintIfNeeded(system: string[]): void {
  if (getAndClearNeedsMediaHint()) {
    system.push(MEDIA_HINT_PROMPT)
  }
}
