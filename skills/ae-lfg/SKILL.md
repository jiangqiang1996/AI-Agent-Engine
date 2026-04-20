---
name: ae:lfg
description: 默认入口：驱动从需求到执行的 AE 主流程；若已有产物则优先恢复，否则从头脑风暴开始
argument-hint: "[需求描述|已有产物路径]"
disable-model-invocation: true
---

# AE LFG

全自主工程管道。按顺序执行每个步骤，**不得跳过任何必需步骤，不得提前进入编码或实现。**

## 输入

<feature_description> #$ARGUMENTS </feature_description>

**如果上面的描述为空，询问用户：** "你想构建什么？请描述功能、问题或改进。" 然后等待回复再继续。

## 任务分类

在进入管道之前，分类任务是否属于软件工程：

- **软件任务**（继续管道）— 涉及代码、仓库、API、数据库，或要求构建/修改/调试/部署软件
- **非软件任务**（停止管道）— 不涉及上述任何信号。告知用户：`"ae:lfg 专注于软件工程管道。此任务不属于软件范畴，请直接描述你的需求，我将尽力协助。"` 然后停止，不进入任何管道步骤
- **不明确**（询问用户）— 无法判断时，询问："这是否涉及构建或修改软件？"

## 恢复策略

优先使用 `ae-recovery` 工具检查是否已有可恢复产物：

- 若存在单一候选，则恢复到对应阶段
- 若存在多个候选，则要求显式选择
- 若没有产物，则从步骤 1 开始

## 管道步骤

### 步骤 1（可选）：依赖安装

如果 `ae-setup` 技能可用，运行 `/ae-setup`。如果不可用或失败，跳过并继续步骤 2。

### 步骤 2：需求探索

运行 `ae:brainstorm $ARGUMENTS`

GATE：停止。验证 `ae:brainstorm` 产出了需求文档（`docs/brainstorms/*-requirements.md`）。如果未产出且需求已经足够清晰，继续。如果需求模糊且未产出文档，重新运行 `ae:brainstorm $ARGUMENTS`。在继续步骤 3 之前，**必须**有足够的产物流入计划阶段。

### 步骤 3：需求审查

运行 `ae:document-review`

审查步骤 2 产出的需求文档。

GATE：停止。如果审查报告 P0/P1 发现，确认是否需要修正后再继续。

### 步骤 4：创建计划

运行 `ae:plan`

GATE：停止。验证 `ae:plan` 在 `docs/plans/` 中产出了计划文件。如果未产出计划文件，重新运行 `ae:plan`。**在计划文件存在之前不得继续步骤 5。** 记录计划文件路径 —— 它将传递给步骤 7 的 `ae:review`。

### 步骤 5：计划审查

运行 `ae:plan-review`

GATE：停止。验证计划审查通过。如果审查未通过，根据发现修正计划后重新审查。

### 步骤 6：执行实现

运行 `ae:work`

GATE：停止。验证实现工作已执行 —— 超出计划范围的文件被创建或修改。**如果没有代码变更，不得继续步骤 7。**

### 步骤 7：代码审查

运行 `ae:review mode:autofix plan:<plan-path-from-step-4>`

传递步骤 4 的计划文件路径，以便 `ae:review` 可以验证需求完整性。

GATE：停止。如果审查结论为"不可合并"，根据发现修正后重新审查。

### 步骤 8：待办清理

检查 `.context/ae/todos/` 目录是否存在 `ready` 状态的待办文件：

- 如果存在，逐一处理：阅读待办内容、实施修复、运行相关测试、标记为已完成
- 如果不存在待办文件，跳过此步骤

GATE：停止。验证所有 `ready` 待办已处理或显式推迟。

### 步骤 9：浏览器测试

检查项目中是否有 UI 相关文件（`src/app/*`、`src/components/*`、`src/views/*`、`*.html` 等）：

- 如果存在 UI 文件且 `agent-browser` 已安装，运行 `ae:test-browser`
- 如果存在 UI 文件但 `agent-browser` 未安装，输出提示："`agent-browser` 未安装，跳过浏览器测试。运行 `/ae-setup` 安装。"
- 如果项目无 UI 文件，跳过此步骤

GATE：停止。如果浏览器测试全部失败，输出警告但允许继续。

### 步骤 10：完成

输出 `<promise>DONE</promise>`

---

标准主链路：`ae:brainstorm` → `ae:document-review` → `ae:plan` → `ae:plan-review` → `ae:work` → `ae:review` → 待办清理 → 浏览器测试

从步骤 2 现在开始。记住：先计划，再工作。永远不要跳过计划。

参考：@./references/pipeline.md
