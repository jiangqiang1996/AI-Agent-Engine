import { SKILL, TOOL, COMMAND } from '../schemas/ae-asset-schema.js'

const BROWSER_KEYWORDS = [
  'playwright',
  SKILL.PLAYWRIGHT,
  `/${COMMAND.PLAYWRIGHT}`,
  TOOL.AE_PLAYWRIGHT_MCP,
  // 所有 browser_* 工具名（78 个）均触发门禁检测
  // 不逐个列举，通过 browser_ 前缀通配匹配（见 containsBrowserKeyword）
  SKILL.WEB_FORGE,
  `/${COMMAND.WEB_FORGE}`,
  '@ui-architect',
  '@logic-weaver',
  '@browser-inspector',
]

const GATE_PATTERNS = [
  /ae:playwright\s+(技能|完成|注册)/i,
  /ae-playwright-mcp\s+action=check/i,
]

const ANTI_GATE_PATTERNS = [
  /playwright\s* MCP\s*(已注册|可用|已连接|就绪).{0,20}(无需|跳过|直接|即可).{0,10}(MCP|注册)/i,
  /(command\s*-v|Get-Command|where)\s*@playwright\/mcp/i,
  /(不要|无需|不需要|不用|禁止|千万别).{0,5}(调用|执行|运行|先调用).{0,10}ae-playwright-mcp/i,
]

const MCP_COMMAND_PATTERN = /browser_\w+/g

function containsBrowserKeyword(text: string): boolean {
  const lower = text.toLowerCase()
  // browser_ 前缀通配：覆盖全部 78 个 browser_* 工具
  if (lower.includes('browser_')) {
    return true
  }
  return BROWSER_KEYWORDS.some((keyword) => lower.includes(keyword.toLowerCase()))
}

function containsGatePattern(text: string): boolean {
  return GATE_PATTERNS.some((pattern) => pattern.test(text))
}

function containsAntiGatePattern(text: string): boolean {
  return ANTI_GATE_PATTERNS.some((pattern) => pattern.test(text))
}

function extractMcpCommandSegments(text: string): string[] {
  const matches = text.match(MCP_COMMAND_PATTERN)
  return matches ? [...new Set(matches)] : []
}

const GATE_INJECTION_TEMPLATE = `\n\n[Playwright MCP 门禁] 目标新会话先使用 \`ae:playwright\` 技能完成浏览器 MCP 动态注册并确认连接就绪；\`ae:playwright\` 是浏览器 MCP 的唯一管理入口，不应直接调用 \`ae-playwright-mcp\` 工具。Playwright MCP 已在配置中声明、用户声称已配置或本地进程检查成功，都不能替代注册确认结果。同一工作区的 Playwright MCP 注册状态可以跨会话复用；MCP 未注册、注册失败或连接状态非 connected 时，目标新会话必须自行通过 \`ae:playwright\` 完成动态注册。`

export function ensureBrowserEnvironmentGate(text: string): string {
  if (!text.trim()) {
    return text
  }

  if (!containsBrowserKeyword(text)) {
    return text
  }

  if (containsGatePattern(text) && !containsAntiGatePattern(text)) {
    return text
  }

  const mcpCommands = extractMcpCommandSegments(text)
  const gateBlock = mcpCommands.length > 0
    ? `${GATE_INJECTION_TEMPLATE}\n\n目标新会话在未完成 MCP 注册校验前不得执行以下工具调用：${mcpCommands.map((cmd) => `\`${cmd}\``).join('、')}。`
    : GATE_INJECTION_TEMPLATE

  return `${gateBlock}\n\n${text}`
}
