import { tool, type ToolDefinition } from '@opencode-ai/plugin/tool'
import { Effect } from 'effect'

import { createRuntimeAssetManifestFromRoot } from '../services/runtime-asset-manifest.js'
import { resolveRecovery } from '../services/recovery-service.js'

export const aeRecoveryTool: ToolDefinition = tool({
  description: [
    '返回 AE 恢复建议。',
    '',
    '功能说明：',
    '- 根据 docs 与 .context 产物返回恢复结论',
    '- 给出 resumePhase、nextSkill 与 fallbackSkill',
    '',
    '适用场景：',
    '- `/ae-lfg`、`ae:work`、`ae:review` 需要跨会话恢复时',
    '- 命令与技能需要统一恢复语义时',
    '',
    '不适用场景：',
    '- 不直接修改任何产物',
    '- 不决定业务内容，只返回恢复契约',
  ].join('\n'),
  args: {
    phase: tool.schema
      .enum(['brainstorm', 'document-review', 'plan', 'plan-review', 'work', 'review', 'lfg'])
      .describe('需要恢复的阶段'),
    expected_origin_fingerprint: tool.schema.string().optional().describe('期望的上游指纹'),
  },
  async execute(args, context) {
    return Effect.runPromise(
      Effect.sync(() => {
        const manifest = createRuntimeAssetManifestFromRoot(context.worktree)
        return JSON.stringify(
          resolveRecovery(manifest, args.phase, {
            expectedOriginFingerprint: args.expected_origin_fingerprint,
          }),
          null,
          2,
        )
      }),
    )
  },
})
