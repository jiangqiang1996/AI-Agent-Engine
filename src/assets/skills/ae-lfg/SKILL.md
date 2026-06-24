---
name: ae:lfg
description: "自包含一站式管道技能：内联澄清需求、设计、实施，仅调用 ae:review 审查；一次澄清后静默执行到底；同时支持软件和非软件任务"
argument-hint: "[task] [--compatible=true|false]"
disable-model-invocation: true
---

# AE LFG

自包含一站式管道技能。澄清需求、设计、实施均为内联逻辑，审查步骤调用 ae:review。一次澄清后静默执行到底，中途不再提问。同时支持软件和非软件任务。

## 参数说明

| 参数 | 必填 | 说明 |
|------|------|------|
| `task` | 是 | 任务描述、步骤、目标、或已有 lfg 产物路径 |
| `compatible` | 否 | 是否兼容历史版本：`true`（默认）/ `false`。false 时产物标记为不兼容更新 |

参数解析规则（三级策略）：
1. 显式命名：`key=value`、`key:value`、`--key=value` 直接绑定，优先级最高
2. 值特征推断：按值的模式自动匹配参数类型（仅在参数意图上下文中生效）

   | 值模式 | 推断为 |
   |--------|--------|
   | true / false | compatible |

3. 顺序兜底：第一个非布尔值参数为 task

**内部调用约定**：当本技能被其他技能自动调用时，所有参数必须使用显式命名格式（如 `task=重构登录模块 compatible=false`），不依赖值特征推断。

`#$ARGUMENTS` 解析规则：第一个非标记参数为 task，`compatible=false` 为不兼容模式。

**如果 task 为空，询问用户：** "你想完成什么任务？" 然后等待回复再继续。

## 任务路由

在进入管道之前判断任务类型：

- **简单问答**：直接回答，不进管道。判断信号："是什么""解释""命令含义""代码说明"等纯信息请求。
- **只读审查**：直接调用 `ae:review mode=report-only`，不进管道。判断信号：用户明确要求"审查""review""不要修改"。
- **提交请求**：走 Git 安全流程，不进管道。判断信号：用户明确要求"提交""commit""push"。
- **单文件文字修改**：直接修改，不进管道。判断信号：范围限于单个文件的文字内容修改（如修正拼写、改写注释、更新文档段落）。
- **其他所有场景**：走完整 7 步管道。

快捷路由（只读审查、提交请求）是管道的前置分流，避免对明确只读或提交意图的用户强制走完整管道。它们不替代管道步骤，而是直接委托对应能力。

## 恢复策略

如果 task 参数指向已有 lfg 产物路径：

- **需求文档**（`*-lfg-prd.md`）：跳过步骤 1 和 2，从步骤 3 设计开始
- **设计文档**（`*-lfg-plan.md`）：跳过步骤 1-4，从步骤 5 实施开始
- **design 目录**（`ae/designs/<name>-YYYY-MM-DD/design.md`）：跳过步骤 1-3，从步骤 4 审查设计开始（审查 design.md 一致性）

判断方式：task 参数以 `ae/` 开头且对应文件存在时，视为产物路径；按文件名中的 `-lfg-prd` 或 `-lfg-plan` 判断产物类型；按路径匹配 `ae/designs/*/design.md` 判断 design 产物。如果文件不存在，视为普通任务描述。如果文件存在但文件名不含 `-lfg-prd`、`-lfg-plan` 或不匹配 design 目录路径，视为普通任务描述（非产物路径），走完整 7 步管道，并提示用户该路径未被识别为 lfg 产物。

## 非软件任务

管道步骤和文档格式不假设代码产物。非软件任务下各步骤语义映射：

- 澄清需求 → 澄清目标和约束
- 审查需求 → 审查目标文档
- 设计 → 方案规划（步骤、资源、产出物）
- 审查设计 → 审查方案文档
- 实施 → 方案落地（撰写文档、整理资料、生成报告等）
- 审查结果 → 审查产出物文档

非软件任务的审查步骤均使用 `ae:review mode=headless domain=document`（步骤 2、4）和 `ae:review mode=autofix domain=document`（步骤 6）。

## 澄清原则

澄清阶段（步骤 1）应考虑本任务执行过程中所有可能存在的问题，包括但不限于：目标定义、范围边界、验收标准、技术可行性、数据兼容性、安全风险、性能影响、环境依赖、迁移策略、用户影响。所有问题都在澄清步骤询问，每次只提问一个问题。

可使用 `ae:brainstorm` 给出推荐答案供用户确认（可选依赖；不可用时降级为直接提问）。

**澄清完成后，后续步骤禁止向用户提问。** 在当前工作空间一次性执行完毕整个管道。若 ae:review 因权限不足、技能不可用等阻断性原因无法执行，管道立即中止并报告：已完成步骤、失败步骤、失败原因（ae:review 执行失败）、已产出物路径。

## 不兼容更新

当 `compatible=false` 时：

- 需求文档 frontmatter 含 `breakingChange: true`
- 设计文档 frontmatter 含 `breakingChange: true`
- 需求文档中明确记录"不兼容历史产物"
- 设计文档中写明"清除历史技术债务，彻底重构，直接达成最终目标"

默认 `compatible=true` 时，以上内容不出现。

## 管道步骤

### 步骤 1：澄清需求

内联提问，一次一个问题。可使用 `ae:brainstorm` 给出推荐答案。

产出：需求文档 `ae/prds/YYYY-MM-DD-<topic>-lfg-prd.md`，格式见 `@./references/lfg-templates.md`。

**门控：** 所有待定问题已解决，目标、范围和验收标准已确认。需求文档已写入磁盘。

### 步骤 2：审查需求

调用 `ae:review mode=headless domain=document <requirements-doc-path>`。

**门控：** ae:review 返回无 P0/P1 阻断发现。最多重试 3 次（根据审查发现自主修正文档后重新审查；修正时禁止向用户提问，仅依据审查发现和需求文档已有信息决策）。3 次后仍有 P0/P1 阻断发现则中止管道，报告已完成步骤、失败步骤、失败原因、已产出物路径。若 ae:review 执行失败（非审查发现），立即中止管道。

### 步骤 3：设计

内联生成轻量版 design 目录，作为 work 阶段的一致性核验依据和 review 闭环的审查输入。

基于需求文档中的目标、范围和验收标准，规划实现步骤、文件变更和验证命令。按需求文档 frontmatter 的 `time_scope` 标注触发的必产出维度（与 ae:design 维度触发规则一致），生成对应维度的核心契约内容。

**产出：** `ae/designs/<需求描述名>-YYYY-MM-DD/design.md`，包含：
- `overview` 章节（必产出）
- 按 `time_scope` 标注触发的必产出维度的核心契约内容（内联在 design.md 中，不拆分子文件）
- Split Manifest（`status: unified`）
- 实现步骤、文件变更和验证命令（内联在 design.md 中或作为附录章节）

同时产出设计文档 `ae/plans/YYYY-MM-DD-NNN-<type>-<topic>-lfg-plan.md`，引用 design 目录路径作为实现依据。

**门控：** design.md 和设计文档已写入磁盘。

### 步骤 4：审查设计

调用 `ae:review mode=headless domain=document <design-doc-path>`。

**门控：** ae:review 返回无 P0/P1 阻断发现。最多重试 3 次（根据审查发现自主修正文档后重新审查；修正时禁止向用户提问，仅依据审查发现和需求文档已有信息决策）。3 次后仍有 P0/P1 阻断发现则中止管道，报告已完成步骤、失败步骤、失败原因、已产出物路径。若 ae:review 执行失败（非审查发现），立即中止管道。

### 步骤 5：实施

内联执行：按设计文档中的实现步骤和文件变更列表，直接编辑文件、运行命令。

软件任务：编辑代码文件、运行构建和测试命令。实现时对照步骤 3 产出的 design.md 各维度契约核验一致性（UI 实现对照 ui-ux 维度、API 实现对照 api 维度、数据层实现对照 database 维度等）。
非软件任务：撰写文档、整理资料、生成报告等。

**门控：** 产出物与设计文档中的文件变更列表一致。

### 步骤 5.5：技能内 review 闭环

实施完成后、最终审查之前，对实际改动文件运行技能内 review 闭环。

**审查调用：** 调用 `ae:review mode=headless domain=code <changed-files>`，传入 `plan=<plan-path>` 作为实现意图上下文，传入 `has_design_contract=true`（步骤 3 已产出 design.md）。`mode=headless` 表示 ae:review 不输出下一步引导，仅返回审查结果给本技能。

**审查者调度：** 按存在的 design 维度自动调度对应一致性审查者（design-consistency-reviewer、ui-consistency-reviewer[若 hasUi]、test-coverage-reviewer、correctness-reviewer、testing-reviewer）。

**auto 修复范围：** 与 design 契约不一致的代码、测试覆盖缺口、验证未通过的发现。ae:review 返回的 auto 可修复发现由本技能自动应用修复，修复后重新运行审查。

**收敛协议（上限 2 轮）：**
- 第 1 轮：初次审查 → auto 修复 → 重新审查
- 收敛判定：重新审查后无新增 P0/P1 发现即为收敛
- 未收敛处理：2 轮后仍有 P0/P1 阻断，在最终报告中标注"review 闭环未收敛"，继续进入步骤 6 最终审查

**非软件任务：** 跳过本步骤，直接进入步骤 6。

### 步骤 6：审查结果

调用 `ae:review mode=autofix <产物路径或审查范围>`。

软件任务：`ae:review mode=autofix`（默认 domain=code）。
非软件任务：`ae:review mode=autofix domain=document <产出物路径>`。

**门控：** ae:review 返回可合并结论。最多重试 3 次（根据审查发现自主修正后重新审查）。3 次后仍不可合并则中止管道，报告已完成步骤、失败步骤、失败原因、已产出物路径。若 ae:review 执行失败（非审查发现），立即中止管道。

审查产物存 `ae/reviews/` 目录。

## 交付证据

最终交付前汇总以下证据：

- 需求文档路径
- design 目录路径（步骤 3 产出）
- 设计文档路径
- 实际运行的验证命令及结果（每条包含 command、exit_code、output）
- 技能内 review 闭环状态（收敛/未收敛，轮数）
- 审查状态和审查产物路径
- 实际修改的文件列表
- 剩余风险

验证或审查存在阻断项时，必须先补齐阻断项再继续，不得输出 `<promise>DONE</promise>`。

最终回复必须包含以下分区：已完成、已验证、未验证/无法验证、Git 操作状态、审查状态、剩余风险。

输出 `<promise>DONE</promise>`

---

标准管道：澄清需求 → 审查需求 → 设计（产出轻量 design 目录）→ 审查设计 → 实施 → 技能内 review 闭环 → 审查结果

从步骤 1 现在开始。

参考：@./references/lfg-templates.md