---
type: plan
status: drafted
date: 2026-07-06
title: worktree-handoff-plan-path-mandatory
depth: standard
format: human-readable-plan
sharded: false
---

# worktree 交接强制携带计划文件

## AI 解析契约
- canonicalKind: plan
- humanEquivalent: true
- stableIdsRequired: true
- implementationUnitsRequired: true
- noImplicitScope: true

## 来源与目标

当前 `ae:work` 在无上游 `ae:plan` 产物时创建 worktree 交接存在三个问题：

1. A 空间无上游计划时，`execution_baseline` 字段被迫承载任务背景和任务内容，但代码层无内容质量校验，B 可能缺乏足够信息构建待办
2. `ae-handoff` 工具的 `findLatestPlanFile` 函数会自动扫描 `ae/plans/` 目录找最新计划文件，可能将会话级交接误绑定到无关历史计划
3. B worktree 使用 `/ae-work-continue` 时，如果交接文件引用的 `plan_path` 不存在，当前规则是静默降级为无计划执行，而非询问用户；且没有禁止 B 搜索 `ae/plans/` 目录找替代计划

目标：worktree 交接必须携带计划文件路径；A 空间无上游计划时在交接前内联生成上下文派生计划文件；B 空间直接使用交接文件的 `plan_path`，不自行搜索；`plan_path` 不存在时停止并询问用户。

## 范围

### 包含
- `ae-worktree-handoff` 工具的 `plan_path` 从可选改为必填（schema + 校验）
- `worktree-handoff-generator` 服务层 `plan_path` 必填校验和 Markdown 生成逻辑调整
- `ae-handoff` 工具移除 `findLatestPlanFile` 自动扫描行为
- `ae:work` 技能提示词新增"上下文派生计划生成"步骤
- `ae:work` 技能提示词修改 B worktree 处理 `plan_path` 不存在的行为
- `/ae-work-continue` 命令增加禁止搜索替代计划规则
- 测试代码适配 `plan_path` 必填变更

### 不包含
- 不修改 `ae:plan` 技能本身
- 不修改 `ae-task-analyzer` 工具的 `mode:plan` 解析逻辑
- 不修改 `dist/` 下的构建产物（由 `npm run build` 重新生成）
- 不修改 `requirements_path`、`design_path`、`graph_path`、`ae_config_path` 的可选性（仍为可选）

### 约束
- 面向插件用户的可分发能力只以 `src/` 下定义为真源
- `plan_path` 改必填是破坏性变更，需确保 `writeHandoffFile` 的唯一调用方 `ae-worktree-handoff.tool.ts` 同步适配
- 计划文件命名与 `ae:plan` 产出一致：`<timestamp>-plan.md`
- 不调用 `ae:plan` 技能生成上下文派生计划，由 A 会话内联生成

## 需求追溯
| 需求 ID | 计划响应 |
|---------|----------|
| R1 | U1 |
| R2 | U2 |
| R3 | U3, U4, U5 |
| R4 | U6 |
| R5 | U7 |

## 高层技术设计

### 关键决策
- D1. `plan_path` 在 `ae-worktree-handoff` 工具 schema 中从 `optional` 改为必填 → 理由: worktree 交接必须携带计划文件，代码层强制校验比提示词约束更可靠
- D2. A 空间无上游计划时内联生成上下文派生计划文件，不调用 `ae:plan` 技能 → 理由: `ae:plan` 是重型流程（深度澄清、头脑风暴），worktree 交接前只需要把已确定的任务上下文结构化写入文件
- D3. B worktree 中 `plan_path` 不存在时停止询问用户，不静默降级 → 理由: `plan_path` 必填后，文件不存在只可能是插件故障或用户主动删除，属于异常场景
- D4. 移除 `ae-handoff` 的 `findLatestPlanFile`，保留 `findPlanFileFromHistory` → 理由: 从会话历史提取已提及的计划是安全的（用户明确讨论过），主动扫描目录找最新文件可能绑定到无关历史计划
- D5. 上下文派生计划文件命名与 `ae:plan` 一致（`<timestamp>-plan.md`），不区分来源 → 理由: B 端不需要区分来源，只按格式解析；统一命名简化流程

## 实现单元

### U1. worktree-handoff-generator 服务层 plan_path 必填校验
- [ ] 目标: 在服务层强制 `plan_path` 非空，移除无 `plan_path` 的 Markdown 生成分支
- [ ] 覆盖需求: R1
- [ ] 唯一产出物: `worktree-handoff-generator.ts` 中 `plan_path` 必填校验和统一的 Execution Baseline 生成逻辑
- [ ] 依赖: 无
- [ ] 文件:
  - src/services/worktree-handoff-generator.ts
- [ ] 方法:
  - `WorktreeHandoffInput` 接口：`plan_path` 从 `string?` 改为 `string`
  - `validateInput` 函数：增加 `if (!input.plan_path?.trim()) return 'plan_path 不能为空。worktree 交接必须携带计划文件路径。'`
  - `buildExecutionBaselineSection` 函数：移除 `if (input.plan_path?.trim())` 的 else 分支（`line 175-176`），统一输出"计划文档是本次执行的可选实现基线"
- [ ] 需遵循的模式:
  - 现有 `validateInput` 的校验模式（非空检查 + 中文错误提示）
  - 现有 `buildExecutionBaselineSection` 的条件分支模式
- [ ] 测试场景:
  - 正常路径: `plan_path` 有值时校验通过，Markdown 正常生成
  - 边界情况: `plan_path` 为空字符串时校验失败
  - 边界情况: `plan_path` 为空白字符串时校验失败
  - 错误路径: `plan_path` 为 `undefined` 时校验失败
- [ ] 验证:
  - `npx vitest run tests/services/worktree-handoff-generator.test.ts`

### U2. ae-worktree-handoff 工具 plan_path schema 改必填
- [ ] 目标: 工具 schema 层面强制 `plan_path` 必填，更新字段描述
- [ ] 覆盖需求: R1
- [ ] 唯一产出物: `ae-worktree-handoff.tool.ts` 中 `plan_path` 必填 schema 和更新后的描述
- [ ] 依赖: U1
- [ ] 文件:
  - src/tools/ae-worktree-handoff.tool.ts
- [ ] 方法:
  - `plan_path` schema：从 `.optional()` 改为 `z.string().describe(...)`，移除 `.optional()`
  - 描述更新为：`'计划文档相对路径，例如 ae/plans/xxx-plan.md。worktree 交接必须携带计划文件路径；无上游 ae:plan 产物时，A 会话必须在交接前生成上下文派生计划文件并迁移到 B worktree。'`
  - `execution_baseline` 描述回归纯基线约束：`'执行基线声明，描述进入 B 后必须遵守的基线约束，例如"必须从 ae:work 阶段 1 的任务分析继续执行"'`
  - `execute` 函数：移除 `if (args.plan_path !== undefined)` 守卫，直接赋值 `input.plan_path = args.plan_path`
- [ ] 需遵循的模式:
  - 现有 schema 定义模式（`z.string().describe()`）
  - 现有 `execute` 函数的参数转发模式
- [ ] 测试场景:
  - 正常路径: 传入有效 `plan_path` 时工具正常生成交接文件
  - 错误路径: 不传 `plan_path` 时工具返回错误
  - 错误路径: `plan_path` 为空字符串时工具返回错误
- [ ] 验证:
  - `npx vitest run tests/tools/ae-worktree-handoff.tool.test.ts`

### U3. ae:work 技能新增"上下文派生计划生成"步骤
- [ ] 目标: 在 `startup-and-worktree-workflow.md` 中新增无上游计划时的计划生成步骤
- [ ] 覆盖需求: R2
- [ ] 唯一产出物: `startup-and-worktree-workflow.md` 中新增的"上下文派生计划生成"章节
- [ ] 依赖: 无
- [ ] 文件:
  - src/assets/skills/ae-work/references/startup-and-worktree-workflow.md
- [ ] 方法:
  - 在"Worktree 创建与 A→B 转移"小节、"交接文件生成"之前，新增"上下文派生计划生成（无上游计划时必需）"子章节
  - 内容包含：触发条件、生成要求（路径、格式、frontmatter）、内容要求（详细但不镀金、不蔓延、不遗漏）、与 `ae:plan` 技能的区别、迁移要求
  - 修改"交接文件生成"小节：增加 `plan_path` 必填说明，`execution_baseline` 回归纯基线约束
- [ ] 需遵循的模式:
  - 现有子章节的格式和语气
  - `ae:plan` 的 `plan-template.md` 结构（frontmatter + 实现单元 + 验证要求）
- [ ] 测试场景:
  - 无对应自动化测试（提示词文件）
  - 由 U7 的集成验证覆盖
- [ ] 验证:
  - 人工审查提示词内容完整性

### U4. ae:work 技能修改 B worktree 处理 plan_path 不存在的行为
- [ ] 目标: B worktree 中 `plan_path` 不存在时停止询问用户，禁止搜索替代计划
- [ ] 覆盖需求: R3
- [ ] 唯一产出物: `input-routing-workflow.md` 和 `task-analysis-workflow.md` 中修改后的处理规则
- [ ] 依赖: 无
- [ ] 文件:
  - src/assets/skills/ae-work/references/input-routing-workflow.md
  - src/assets/skills/ae-work/references/task-analysis-workflow.md
- [ ] 方法:
  - `input-routing-workflow.md` `line 15`：把当前一刀切规则改为三分支：
    - `plan_path` 不存在 → 停止执行，询问用户；禁止搜索 `ae/plans/` 目录
    - 交接文件未引用 `plan_path` → 异常场景，停止执行，询问用户
    - 需求/设计/图谱/AE 配置路径不存在 → 记录 `optional_context_missing`，继续执行
  - `task-analysis-workflow.md` `line 13`：简化为：
    - `plan_path` 存在且文件存在 → `mode:plan`
    - `plan_path` 缺失或文件不存在 → 不进入任务分析，先触发询问用户流程
  - 移除"无计划、计划路径不存在...手动构建待办"的静默降级路径
- [ ] 需遵循的模式:
  - 现有提示词的规则表达方式
- [ ] 测试场景:
  - 无对应自动化测试（提示词文件）
  - 由 U7 的集成验证覆盖
- [ ] 验证:
  - 人工审查提示词内容完整性

### U5. /ae-work-continue 命令增加禁止搜索替代计划规则
- [ ] 目标: 命令文件中明确 `plan_path` 不存在时禁止搜索替代计划
- [ ] 覆盖需求: R3
- [ ] 唯一产出物: `ae-work-continue.md` 中修改后的执行要求
- [ ] 依赖: 无
- [ ] 文件:
  - src/assets/commands/ae-work-continue.md
- [ ] 方法:
  - 修改第 10 条规则：区分 `plan_path` 和其他可选上下文
  - `plan_path` 不存在时：停止执行，询问用户；禁止搜索 `ae/plans/` 目录
  - 其他可选上下文不存在时：记录缺失，继续执行
- [ ] 需遵循的模式:
  - 现有命令文件的执行要求格式
- [ ] 测试场景:
  - 无对应自动化测试（命令文件）
  - 由 U7 的集成验证覆盖
- [ ] 验证:
  - 人工审查命令内容完整性

### U6. ae-handoff 工具移除 findLatestPlanFile
- [ ] 目标: 移除自动扫描 `ae/plans/` 目录找最新计划的行为
- [ ] 覆盖需求: R4
- [ ] 唯一产出物: `ae-handoff.tool.ts` 中移除 `findLatestPlanFile` 函数和调用后的精简代码
- [ ] 依赖: 无
- [ ] 文件:
  - src/tools/ae-handoff.tool.ts
- [ ] 方法:
  - 删除 `findLatestPlanFile` 函数（`line 70-83`）
  - 修改 `line 127-128`：移除 `?? findLatestPlanFile(plansDir)` 调用，只保留 `findPlanFileFromHistory`
  - 清理不再使用的导入：`statSync`、`readDirSync as readDirSync`（`line 5`）
- [ ] 需遵循的模式:
  - 现有代码风格和导入规范
- [ ] 测试场景:
  - 正常路径: 会话历史中提及过计划文件时，`findPlanFileFromHistory` 仍能提取
  - 边界情况: 会话历史中未提及计划文件时，不再自动扫描目录
  - 错误路径: `ae/plans/` 目录不存在时不报错
- [ ] 验证:
  - `npx vitest run tests/tools/ae-handoff.tool.test.ts`
  - `npm run typecheck`

### U7. 测试代码适配 plan_path 必填变更
- [ ] 目标: 适配现有测试用例，新增 `plan_path` 必填校验测试
- [ ] 覆盖需求: R5
- [ ] 唯一产出物: 修改后的 `worktree-handoff-generator.test.ts` 和 `ae-worktree-handoff.tool.test.ts`
- [ ] 依赖: U1, U2
- [ ] 文件:
  - tests/services/worktree-handoff-generator.test.ts
  - tests/tools/ae-worktree-handoff.tool.test.ts
- [ ] 方法:
  - `worktree-handoff-generator.test.ts`：
    - 修改 `无计划和需求文档时不应在交接文件中提及这些文件` 用例（`line 109-128`）：`plan_path: undefined` 现在应报错，改为期望 `'error' in result` 为 `true`
    - 修改 `design_borne_by_plan=true 且无 plan_path 时不应提及设计由计划承载` 用例（`line 130-143`）：提供有效 `plan_path`，只移除 `requirements_path` 和 `design_path`
    - 新增用例：`plan_path 为空时应报错`
    - 新增用例：`plan_path 为空白时应报错`
  - `ae-worktree-handoff.tool.test.ts`：
    - 新增用例：`plan_path 缺失时应报错`
- [ ] 需遵循的模式:
  - 现有测试文件的 `describe`/`it` 结构
  - 现有 `validInput` 辅助函数模式
  - 测试描述使用中文
- [ ] 测试场景:
  - 正常路径: 有效 `plan_path` 时所有现有测试通过
  - 边界情况: `plan_path` 为空/空白/undefined 时报错
  - 错误路径: 工具层 `plan_path` 缺失时返回错误提示
- [ ] 验证:
  - `npx vitest run tests/services/worktree-handoff-generator.test.ts`
  - `npx vitest run tests/tools/ae-worktree-handoff.tool.test.ts`

## 风险与应对
| 风险 | 影响 | 应对措施 |
|------|------|----------|
| `plan_path` 改必填是破坏性变更 | 如果有其他代码依赖 `plan_path` 可选会受影响 | 经检查 `writeHandoffFile` 只被 `ae-worktree-handoff.tool.ts` 调用，影响范围可控 |
| 上下文派生计划质量依赖 LLM | 代码层只能强制 `plan_path` 非空，无法校验内容质量 | 通过提示词中"详细但不镀金"指引和计划模板格式约束保障 |
| 现有测试用例需要适配 | 2 个测试用例设置了 `plan_path: undefined`，会失败 | U7 中明确修改这些用例 |

## 一致性检查
- implementationUnitsCount: 7
- tracedRequirementsCount: 5
- decisionsCount: 5
- risksCount: 3
