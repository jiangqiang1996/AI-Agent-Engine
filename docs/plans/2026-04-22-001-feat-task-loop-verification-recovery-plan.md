---
title: 增强 ae:task-loop 技能：结构化验证与恢复能力
type: feat
status: active
date: 2026-04-22
---

# 增强 ae:task-loop 技能：结构化验证与恢复能力

## 概览

为 `ae:task-loop` 技能新增两个核心能力：(1) 结构化完成条件工具（`ae-task-contract`），将验证从自然语言主观判断升级为客观校验；(2) 恢复能力（`ae-task-loop-state`），让迭代进度持久化、支持中断恢复，并融入 AE 管线。

## 问题框架

`ae:task-loop` 是目标驱动的迭代执行器，适用于探索性调试、环境搭建、遗留代码修复等场景。当前存在两个核心缺陷：

1. **验证不可靠**：完成条件由 LLM 推导为自然语言，验证子代理也用自然语言判断。缺乏结构化的条件 ID 和类型标注，判定步骤只能靠文本匹配识别通过/不通过状态。
2. **不可恢复**：整个循环过程不产出任何持久化产物。会话中断等于全部进度丢失。`recovery-service.ts` 的阶段映射中没有 `task-loop`，与 AE 管线完全脱节。

## 需求追溯

- R1. 完成条件具有稳定 ID 和类型标注（command / semantic），验证子代理可据此做客观校验
- R2. 每轮迭代后原子更新产物文件，记录轮次、条件状态、变更文件
- R3. 会话中断后可通过 `/ae-task-loop` 或 `ae:lfg` 恢复到中断轮次继续执行
- R4. task-loop 产物注册到 recovery 体系，其他技能可消费其状态
- R5. 新增工具遵循现有代码风格（Effect + Zod + tool() 模式）

## 范围边界

- 不修改 task-loop 的循环体核心逻辑（执行→验证→判定）和退出语义
- 不修改禁言令机制
- 不为 task-loop 添加动态技能切换能力（方向 E，后续迭代）
- 不为 task-loop 添加下游技能衔接（方向 D，后续迭代）

## 关键技术决策

- **契约格式化器而非条件生成器**：`ae-task-contract` 不做目标拆解推理，只负责给 LLM 推导的条件分配 ID、标注类型。理由：目标拆解是 LLM 的强项，工具做格式化可保持简单和可测试。
- **条件 ID 全局稳定**：一旦在 Phase 0 生成，循环期间 ID 不变。恢复时沿用已有 ID。理由：跨轮比较和恢复都需要稳定的 ID 对照。
- **专用工具写入产物**：新增 `ae-task-loop-state` 工具原子写入产物文件，而非让 LLM 用 edit 工具更新。理由：纯 SKILL.md 指示写入不可靠，LLM 可能忘记写或格式错误。
- **独立恢复阶段**：task-loop 作为 recovery-schema 中的独立 phase，有自己产物目录 `.context/ae/task-loop/`。理由：与 work 平行而非从属，task-loop 没有固定的上游依赖链。

## 实现单元

- [ ] **单元 1：Schema 层定义**

**目标：** 新增 task-contract 和 task-loop 产物的 Zod schema，扩展现有 artifact/recovery schema。

**需求：** R1, R4

**依赖：** 无

**文件：**
- 创建：`src/schemas/task-contract-schema.ts`
- 创建：`src/schemas/task-loop-artifact-schema.ts`
- 修改：`src/schemas/artifact-schema.ts`
- 修改：`src/schemas/recovery-schema.ts`
- 测试：`src/schemas/task-contract-schema.test.ts`

**方法：**
- `task-contract-schema.ts` 定义 `TaskConditionSchema`（id / description / type / hint）和 `TaskContractSchema`（goal + conditions）
- `task-loop-artifact-schema.ts` 定义产物 frontmatter schema（goal / toolchain / conditions 数组含 status / max_rounds / current_round）
- `artifact-schema.ts` 的 `ArtifactTypeSchema` 加 `'task-loop'`，`ArtifactStatusSchema` 加 `'in-progress'`
- `recovery-schema.ts` 的 `RecoveryPhaseSchema` 加 `'task-loop'`

**测试场景：**
- 正常路径：TaskConditionSchema 接受合法的 command 类型条件
- 正常路径：TaskConditionSchema 接受合法的 semantic 类型条件
- 边界情况：id 不匹配 COND-NNN 格式时校验失败
- 边界情况：conditions 数组超过 8 项时校验失败
- 错误路径：description 为空字符串时校验失败
- 错误路径：type 不是 command/semantic 时校验失败

**验证：** 所有 schema 校验测试通过

- [ ] **单元 2：ae-task-contract 工具**

**目标：** 实现契约格式化器工具，给 LLM 推导的完成条件分配稳定 ID 和类型标注。

**需求：** R1

**依赖：** 单元 1

**文件：**
- 创建：`src/tools/ae-task-contract.tool.ts`
- 创建：`src/tools/ae-task-contract.tool.test.ts`
- 修改：`src/tools/index.ts`

**方法：**
- 工具接收 `goal`（string）和 `conditions`（Array<{description, type, hint?}>）
- 为每个 condition 分配 `COND-001` 起始的递增 ID
- 透传 description 和 hint，直接使用传入的 type
- 返回结构化 JSON，含 goal 和带 ID 的 conditions 数组
- 使用 `Effect.sync` 包裹同步逻辑，与 `ae-review-contract` 模式一致

**需遵循的模式：**
- `src/tools/ae-review-contract.tool.ts` 的 tool() 定义模式
- description 使用列表格式（功能说明 / 适用场景 / 不适用场景）

**测试场景：**
- 正常路径：输入 3 个条件，返回带 COND-001/002/003 ID 的结构化 JSON
- 正常路径：goal 正确透传到输出
- 边界情况：输入 1 个条件时正常工作
- 边界情况：输入 8 个条件时全部获得正确 ID
- 边界情况：hint 字段为空时输出中 hint 为空字符串或省略

**验证：** 工具注册到 createToolRegistry()，测试全部通过

- [ ] **单元 3：ae-task-loop-state 工具**

**目标：** 实现 task-loop 产物原子写入工具，支持创建、更新、终态化三种操作。

**需求：** R2, R3

**依赖：** 单元 1

**文件：**
- 创建：`src/tools/ae-task-loop-state.tool.ts`
- 创建：`src/tools/ae-task-loop-state.tool.test.ts`
- 修改：`src/tools/index.ts`

**方法：**
- 三种 action：
  - `create`：根据 goal + toolchain + conditions + max_rounds 创建产物文件。生成文件名 `{date}-{slug}.md`，写入 `.context/ae/task-loop/`。条件初始 status 全部为 `pending`
  - `update`：读取已有产物文件，更新 current_round、指定条件的 status、追加 changed_files。原子写回
  - `finalize`：读取已有产物文件，设置 status 为 completed / aborted / blocked，写回
- 使用 `ToolContext.worktree` 解析 `.context/ae/task-loop/` 路径
- 使用 Effect + fs 操作，确保目录不存在时自动创建
- frontmatter 使用 YAML 格式，body 为空或包含摘要

**需遵循的模式：**
- `src/tools/ae-recovery.tool.ts` 的 worktree 使用方式
- `src/services/artifact-store.ts` 的文件读写模式

**测试场景：**
- 正常路径：create 动作成功创建产物文件并返回路径
- 正常路径：update 动作正确更新轮次和条件状态
- 正常路径：finalize 动作正确设置终态
- 边界情况：create 时 .context/ae/task-loop/ 目录不存在时自动创建
- 错误路径：update 时 artifact_path 指向不存在的文件时返回错误信息
- 错误路径：finalize 时 status 不是合法终态时返回错误信息
- 集成场景：create → update → finalize 完整流程

**验证：** 工具注册到 createToolRegistry()，完整流程测试通过

- [ ] **单元 4：Recovery 体系集成**

**目标：** 将 task-loop 注册到 recovery-service，支持 ae-recovery 工具查询 task-loop 产物。

**需求：** R3, R4

**依赖：** 单元 1

**文件：**
- 修改：`src/services/artifact-store.ts`
- 修改：`src/services/recovery-service.ts`
- 修改：`src/tools/ae-recovery.tool.ts`
- 修改：`src/tools/ae-recovery.tool.test.ts`（补充 task-loop 相关测试）

**方法：**
- `artifact-store.ts`：`ArtifactKind` 联合类型加 `'task-loop'`，`getArtifactDirectory` 加 task-loop → `.context/ae/task-loop/` 映射
- `recovery-service.ts`：
  - `fallbackSkillForPhase`：task-loop → `ae:task-loop`（回退到自身）
  - `preferredArtifactTypes`：task-loop → `['task-loop']`
  - `nextSkillForArtifact`：task-loop → `ae:task-loop`
  - `resumePhaseForArtifact`：task-loop → `task-loop`
  - `hasValidMetadata`：task-loop 产物需 goal 非空且至少一个 condition
- `ae-recovery.tool.ts`：phase enum 加 `'task-loop'`

**需遵循的模式：**
- recovery-service.ts 中已有的阶段映射模式

**测试场景：**
- 正常路径：task-loop 阶段有未完成产物时返回 resolved
- 正常路径：task-loop 阶段无产物时返回 needs-upstream，fallbackSkill 为 ae:task-loop
- 正常路径：task-loop 阶段有多个产物时返回 needs-selection
- 错误路径：task-loop 产物 goal 为空时返回 invalid-artifact
- 集成场景：ae-recovery 工具以 phase=task-loop 调用成功返回恢复建议

**验证：** 所有 recovery 测试通过，包括新增的 task-loop 分支

- [ ] **单元 5：SKILL.md 更新**

**目标：** 更新 task-loop 的 SKILL.md 和 references 文件，集成两个新工具。

**需求：** R1, R2, R3

**依赖：** 单元 2, 单元 3, 单元 4

**文件：**
- 修改：`skills/ae-task-loop/SKILL.md`
- 修改：`skills/ae-task-loop/references/phase-zero.md`
- 修改：`skills/ae-task-loop/references/loop-body.md`
- 修改：`skills/ae-task-loop/references/exit-handling.md`
- 新建：`skills/ae-task-loop/references/artifact-persistence.md`

**方法：**
- `SKILL.md`：在流程部分增加产物和工具引用说明
- `phase-zero.md`：
  - 第 5 步改为：LLM 推导条件 → 调用 `ae-task-contract` 获取结构化输出 → 展示给用户确认
  - 新增第 7 步：调用 `ae-task-loop-state(action=create)` 创建产物文件
  - 恢复场景：检测到已有产物时跳过 Phase 0，读取产物恢复状态
- `loop-body.md`：
  - 执行子代理 prompt 使用结构化条件 JSON 替代自然语言
  - 验证子代理 prompt 使用结构化条件 JSON，command 类型优先用 hint 中的命令验证
  - 判定步骤后调用 `ae-task-loop-state(action=update)` 更新产物
- `exit-handling.md`：每个退出路径增加调用 `ae-task-loop-state(action=finalize)`
- `artifact-persistence.md`：产物格式规范、生命周期、frontmatter 字段说明

**测试场景：**
- 测试预期：无 -- SKILL.md 是 LLM 指令文档，通过人工审读验证

**验证：** SKILL.md 内容完整，references 文件交叉引用正确

- [ ] **单元 6：注册与构建验证**

**目标：** 确保新工具正确注册，构建和现有测试全部通过。

**需求：** R5

**依赖：** 单元 2, 单元 3

**文件：**
- 修改：`src/tools/index.ts`（确认注册）

**方法：**
- 确认 `createToolRegistry()` 包含 `ae-task-contract` 和 `ae-task-loop-state`
- 运行 `npm run build` 确保编译通过
- 运行 `npm run test` 确保所有测试通过

**测试场景：**
- 正常路径：createToolRegistry() 返回包含 6 个工具的注册表
- 集成场景：构建无错误
- 集成场景：所有测试通过

**验证：** `npm run build && npm run test` 成功

## 系统范围影响

- **交互图：** `ae:lfg` 管线通过 `ae-recovery` 可识别 task-loop 产物状态，恢复时路由到 `ae:task-loop`
- **错误传播：** `ae-task-loop-state` 工具写入失败时返回中文错误信息，不影响循环体继续执行（产物写入是增强而非阻塞）
- **状态生命周期风险：** update 操作非事务性——如果写入中途崩溃，产物文件可能处于不一致状态。缓解：工具先写临时文件再 rename（Node.js 的 renameSync 是原子的）
- **不变的行为：** 现有 4 个工具（ae-recovery、ae-review-contract、ae-handoff、todoread）行为不变；现有 recovery 映射不变；task-loop 的循环体核心逻辑和退出语义不变

## 风险与依赖

| 风险 | 缓解 |
|------|------|
| SKILL.md 指令更新后 LLM 不严格遵循工具调用流程 | SKILL.md 中用明确的步骤编号和"必须"标记；工具返回结构化 JSON 便于验证 |
| task-loop 产物文件在每轮 update 时写入失败导致状态丢失 | 工具返回错误信息但循环不中断；下一轮可重试 update；最坏情况仅丢失最近一轮的状态 |
| `.context/ae/task-loop/` 目录可能被 .gitignore 忽略 | 检查项目 .gitignore，确保 `.context/` 已被忽略（产物不需要版本控制） |
| recovery-service 新增 task-loop 分支可能影响已有阶段的测试 | 只新增分支，不修改已有 case；运行全量测试验证 |

## 来源与参考

- 相关代码：`src/tools/ae-review-contract.tool.ts`（契约工具模式参考）
- 相关代码：`src/tools/ae-recovery.tool.ts`（恢复工具模式参考）
- 相关代码：`src/services/recovery-service.ts`（阶段映射参考）
- 相关代码：`src/services/artifact-store.ts`（产物存储参考）
- 相关代码：`skills/ae-task-loop/SKILL.md`（当前技能定义）
