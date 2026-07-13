import { existsSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

interface Invariant {
  file: string
  label: string
  mustContain: string[]
  mustNotContain: string[]
}

const INVARIANTS: Invariant[] = [
  {
    file: 'src/assets/skills/ae-design/references/design-output-template.md',
    label: 'ae:design 管道边界',
    mustContain: [
      '无论文件大小，每个维度必须拆分为独立子文件',
    ],
    mustNotContain: ['根据选择路由'],
  },
  {
    file: 'src/assets/skills/ae-task-loop/SKILL.md',
    label: 'ae:task-loop 禁言令',
    mustContain: [
      '全流程禁止调用 ae:work 技能',
      '禁止提问，禁止调用 ae:work',
      'ae:review 无阻断发现 AND 成功条件全部达成',
      '两者独立校验不互蕴含',
    ],
    mustNotContain: ['默认创建独立 worktree', '一律准备创建独立 worktree'],
  },
  {
    file: 'src/assets/skills/ae-work/references/shipping-workflow.md',
    label: 'ae:work 产物迁移',
    mustContain: [
      'A→B 产物迁移',
      '不得声称已复制',
      '不修改 B 中代码、测试或其他项目文件',
      '不迁移 gate/review 运行时产物',
      '未迁移的需求/设计、图谱或 AE 项目配置产物不在交接文件中出现',
    ],
    mustNotContain: [],
  },
  {
    file: 'src/assets/skills/ae-work/references/startup-and-worktree-workflow.md',
    label: 'ae:work worktree 决策',
    mustContain: [
      '禁止自行拼接交接 Markdown',
      '必须调用 `ae-worktree-handoff` 工具生成交接文件',
      '创建 B 后，A 会话不得再写入 A worktree 的任何文件',
      'A→B 启动证明必须包含',
      '非 Git 场景不得伪造 branch 或 HEAD',
    ],
    mustNotContain: ['未显式声明时默认使用 `auto`', '默认创建独立 worktree'],
  },
  {
    file: 'src/assets/skills/ae-work/SKILL.md',
    label: 'ae:work 主技能约束',
    mustContain: [
      'worktree_decision',
      '不得进入普通交付模板',
      '在最终交付前必须汇总以下证据',
    ],
    mustNotContain: [],
  },
  {
    file: 'src/assets/skills/ae-save-experience/references/save-solution.md',
    label: 'ae:save-experience 脱敏门禁',
    mustContain: ['token', '私钥', '用户未确认时不得写入文件'],
    mustNotContain: [],
  },
  {
    file: 'src/assets/skills/ae-save-experience/SKILL.md',
    label: 'ae:save-experience 统一入口',
    mustContain: ['先保存 solution', '再按需提炼 rules'],
    mustNotContain: ['ae:save-rules'],
  },
  {
    file: 'src/assets/skills/ae-install/SKILL.md',
    label: 'ae:install 脚本执行',
    mustContain: ['scripts/install.js', '交互式 confirm'],
    mustNotContain: [],
  },
  {
    file: 'src/assets/skills/ae-review/references/scope-detection.md',
    label: 'ae:review worktree 指纹',
    mustContain: ['worktree', '字段缺失、不匹配或无法证明一致时'],
    mustNotContain: [],
  },
  {
    file: 'src/assets/skills/ae-review/references/synthesis-and-presentation.md',
    label: 'ae:review 审查后身份',
    mustContain: ['缺失或不匹配时保守视为未审查'],
    mustNotContain: [],
  },
  {
    file: 'src/assets/skills/ae-work/references/execution-workflow.md',
    label: 'ae:work 域代理核验',
    mustContain: ['不只依赖域代理自报的 artifacts'],
    mustNotContain: ['work-subagent-template', 'serial_subagent', 'parallel_subagent'],
  },
  {
    file: 'src/assets/agents/domains/review/specialists/research-reviewer.md',
    label: 'research-reviewer 经验库降级',
    mustContain: ['不得失败', '缺失、为空或没有相关命中'],
    mustNotContain: [],
  },
  {
    file: 'src/assets/skills/ae-design/SKILL.md',
    label: 'ae:design 强制维度拆分',
    mustContain: ['强制维度拆分', '无论文件大小，每个维度必须拆分为独立子文件', 'database（@database-designer）→ 为 api 提供表结构'],
    mustNotContain: ['unified/split', '<ae-design路径>'],
  },
]

describe('资产 prompt invariant 契约', () => {
  it.each(INVARIANTS.filter((i) => i.mustContain.length > 0 || i.mustNotContain.length > 0))(
    '$label',
    ({ file, mustContain, mustNotContain }) => {
      if (!existsSync(file)) {
        return
      }
      const text = readFileSync(file, 'utf8')
      for (const phrase of mustContain) {
        expect(text, `${file} 应包含 "${phrase}"`).toContain(phrase)
      }
      for (const phrase of mustNotContain) {
        expect(text, `${file} 不应包含 "${phrase}"`).not.toContain(phrase)
      }
    },
  )
})
