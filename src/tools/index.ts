import type { ToolDefinition } from '@opencode-ai/plugin/tool'

import { aeRecoveryTool } from './ae-recovery.tool.js'
import { aeReviewContractTool } from './ae-review-contract.tool.js'
import { aeHandoffTool } from './ae-handoff.tool.js'
import { todoreadTool } from './todoread.tool.js'

export function createToolRegistry(): Record<string, ToolDefinition> {
  return {
    'ae-recovery': aeRecoveryTool,
    'ae-review-contract': aeReviewContractTool,
    'ae-handoff': aeHandoffTool,
    'todoread': todoreadTool,
  }
}
