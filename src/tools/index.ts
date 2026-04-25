import type { ToolDefinition } from '@opencode-ai/plugin/tool'

import { TOOL } from '../schemas/ae-asset-schema.js'
import { aeRecoveryTool } from './ae-recovery.tool.js'
import { aeReviewContractTool } from './ae-review-contract.tool.js'
import { aeHandoffTool } from './ae-handoff.tool.js'
import { aePromptOptimizeTool } from './ae-prompt-optimize.tool.js'
import { aeHelpTool } from './ae-help.tool.js'

export function createToolRegistry(): Record<string, ToolDefinition> {
  return {
    [TOOL.AE_RECOVERY]: aeRecoveryTool,
    [TOOL.AE_REVIEW_CONTRACT]: aeReviewContractTool,
    [TOOL.AE_HANDOFF]: aeHandoffTool,
    [TOOL.AE_PROMPT_OPTIMIZE]: aePromptOptimizeTool,
    [TOOL.AE_HELP]: aeHelpTool,
  }
}
