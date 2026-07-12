import { SKILL, TOOL, COMMAND } from '../schemas/ae-asset-schema.js'

const BROWSER_KEYWORDS = [
  'chrome-devtools',
  SKILL.CHROME_DEVTOOLS,
  `/${COMMAND.CHROME_DEVTOOLS}`,
  TOOL.AE_CHROME_DEVTOOLS_MCP,
  'chrome-devtools_navigate_page',
  'chrome-devtools_take_snapshot',
  'chrome-devtools_take_screenshot',
  'chrome-devtools_click',
  'chrome-devtools_fill',
  'chrome-devtools_type_text',
  'chrome-devtools_press_key',
  'chrome-devtools_hover',
  'chrome-devtools_wait_for',
  'chrome-devtools_evaluate_script',
  'chrome-devtools_lighthouse_audit',
  SKILL.WEB_FORGE,
  `/${COMMAND.WEB_FORGE}`,
  '@ui-architect',
  '@logic-weaver',
  '@browser-inspector',
]

const GATE_PATTERNS = [
  /ae:chrome-devtools\s+(技能|完成|注册)/i,
  /ae-chrome-devtools-mcp\s+action=check/i,
]

const ANTI_GATE_PATTERNS = [
  /chrome-devtools\s* MCP\s*(已注册|可用|已连接|就绪).{0,20}(无需|跳过|直接|即可).{0,10}(MCP|注册)/i,
  /(command\s*-v|Get-Command|where)\s*chrome-devtools-mcp/i,
  /(不要|无需|不需要|不用|禁止|千万别).{0,5}(调用|执行|运行|先调用).{0,10}ae-chrome-devtools-mcp/i,
]

const MCP_COMMAND_PATTERN = /chrome-devtools_\w+/g

function containsBrowserKeyword(text: string): boolean {
  return BROWSER_KEYWORDS.some((keyword) => text.toLowerCase().includes(keyword.toLowerCase()))
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

const GATE_INJECTION_TEMPLATE = `\n\n[chrome-devtools MCP 门禁] 目标新会话先使用 \`ae:chrome-devtools\` 技能完成浏览器 MCP 动态注册并确认连接就绪；\`ae:chrome-devtools\` 是浏览器 MCP 的唯一管理入口，不应直接调用 \`ae-chrome-devtools-mcp\` 工具。chrome-devtools MCP 已在配置中声明、用户声称已配置或本地进程检查成功，都不能替代注册确认结果。同一工作区的 chrome-devtools MCP 注册状态可以跨会话复用；MCP 未注册、注册失败或连接状态非 connected 时，目标新会话必须自行通过 \`ae:chrome-devtools\` 完成动态注册。`

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