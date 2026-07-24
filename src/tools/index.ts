import type { ToolDefinition } from '@opencode-ai/plugin'

import { TOOL } from '../schemas/ae-asset-schema.js'
import { aeHandoffTool } from './ae-handoff.tool.js'
import { aeWorktreeHandoffTool } from './ae-worktree-handoff.tool.js'
import { aeCreateSessionTool } from './ae-create-session.tool.js'
import { aeHelpTool } from './ae-help.tool.js'
import { aeReviewProofTool } from './ae-review-proof.tool.js'
import { aeSwaggerParserTool } from './ae-swagger-parser.tool.js'
import { aeImageTool } from './ae-image.tool.js'
import { aeAudioTool } from './ae-audio.tool.js'
import { aeVideoTool } from './ae-video.tool.js'
import { aeDocExtractTool } from './ae-doc-extract.tool.js'
import { aeDomainCatalogTool } from './ae-domain-catalog.tool.js'
import { aeTimerTool } from './ae-timer.tool.js'
import { aeWorkSpecialistSelectTool } from './ae-work-specialist-select.tool.js'
import { aeSpecialistAggregateTool } from './ae-specialist-aggregate.tool.js'
import { aeReviewScopeAnalyzeTool } from './ae-review-scope-analyze.tool.js'
import { aeAsyncBashTool } from './ae-async-bash.tool.js'
import { aePdfTool } from './ae-pdf.tool.js'
import { aeBrainstormTool } from './ae-brainstorm.tool.js'
import { aeOfficecliTool } from './ae-officecli.tool.js'
import { aeOcrTool } from './ae-ocr.tool.js'
import { aeTestTriageTool } from './ae-test-triage.tool.js'

export function createToolRegistry(): Record<string, ToolDefinition> {
  return {
    [TOOL.AE_HANDOFF]: aeHandoffTool,
    [TOOL.AE_WORKTREE_HANDOFF]: aeWorktreeHandoffTool,
    [TOOL.AE_CREATE_SESSION]: aeCreateSessionTool,
    [TOOL.AE_HELP]: aeHelpTool,
    [TOOL.AE_REVIEW_PROOF]: aeReviewProofTool,
    [TOOL.AE_SWAGGER_PARSER]: aeSwaggerParserTool,

    [TOOL.AE_IMAGE]: aeImageTool,
    [TOOL.AE_AUDIO]: aeAudioTool,
    [TOOL.AE_VIDEO]: aeVideoTool,
    [TOOL.AE_DOC_EXTRACT]: aeDocExtractTool,
    [TOOL.AE_DOMAIN_CATALOG]: aeDomainCatalogTool,
    [TOOL.AE_TIMER]: aeTimerTool,
    [TOOL.AE_WORK_SPECIALIST_SELECT]: aeWorkSpecialistSelectTool,
    [TOOL.AE_SPECIALIST_AGGREGATE]: aeSpecialistAggregateTool,
    [TOOL.AE_REVIEW_SCOPE_ANALYZE]: aeReviewScopeAnalyzeTool,
    [TOOL.AE_ASYNC_BASH]: aeAsyncBashTool,
    [TOOL.AE_PDF]: aePdfTool,
    [TOOL.AE_BRAINSTORM]: aeBrainstormTool,
    [TOOL.AE_OFFICECLI]: aeOfficecliTool,
    [TOOL.AE_OCR]: aeOcrTool,
    [TOOL.AE_TEST_TRIAGE]: aeTestTriageTool,
  }
}
