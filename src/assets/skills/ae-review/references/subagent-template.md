# 子代理提示模板

所有审查子代理位于 `reviewers/` 目录下。`ae-review-scope-analyze` 工具为每个激活代理构建完整 prompt（包含角色提示词、审查文件列表、审查模式和审查目标），编排器直接将 `tasks[].prompt` 传入 Task 调用。所有激活代理在同一轮回复中一次性发出 Task 调用，不分批次。代理只找问题不做修复，修复由合并层统一处理。

---

## 全并行调度说明

编排器在获得工具返回的 `tasks` 数组后，在**同一轮回复**中一次性发出所有 Task 调用：

```
// 伪代码：全并行调度
const tasks = toolResult.tasks.map(task => Task({
  agent: task.agent,
  prompt: task.prompt
}))
// 所有 Task 在同一轮发出，不串行等待
const results = await Promise.all(tasks)
```

禁止分批次派发、禁止串行等待前一个代理完成再派发下一个。所有代理并行执行，结果统一收集后进入合并层。

---

## prompt 结构

工具构建的每个代理 prompt 包含以下部分：

```
{角色提示词}

审查文件列表：
- {file_1}
- {file_2}
...

{审查模式说明}

{审查目标（非空时）}
```

---

## 输出契约

每个代理返回精简 JSON，每个发现包含合并层级字段：

```
title、severity、domain（可选）、location（含 file）、finding_type、confidence、evidence、causes、caused_by、suggested_fix。
```

不要在返回的 JSON 中包含 why_it_matters 的完整叙述，仅可包含简短摘要（1-2 句）。

置信度准则（0.0-1.0）：
- 0.00-0.49：不报告
- 0.50-0.59：仅 P0 可报告
- 0.60-0.69：明确可操作时包含
- 0.70-0.84：真实且重要，附完整证据
- 0.85-1.00：确定，报告

抑制阈值：0.60。不要发出低于 0.60 置信度的发现（0.50+ 的 P0 除外）。

需要主动抑制的误报类别：
- 与此变更无关的预存问题
- linter/formatter 会捕获的琐碎风格问题
- 看似错误但实际有意的代码
- 代码库中其他地方已处理的问题
- 没有具体故障模式的泛泛建议

规则：
- 你是 ae:review 工作流中的叶子审查代理。不要调用 AE 技能或代理。
- 你只找问题，不做修复。不要编辑项目文件或变更仓库状态。
- 不要设置 autofix_class——修复判定由合并层统一处理。
- 每个发现必须包含至少一项基于实际代码/内容的证据。
- 如果未发现问题，返回空的 findings 数组。
- **意图验证：** 如果代码做了意图未描述的事情，标记为发现。
- 使用你的抑制条件。不要标记属于其他代理的问题。
- **因果标注：** 如果发现 A 的修复会自动消除发现 B，在 A 的 causes 中填入 B 的标识，在 B 的 caused_by 中填入 A 的标识。
- 如果无法确定因果关系，causes 和 caused_by 留空数组。

---

## finding 产出格式

每个发现必须包含以下字段：

```json
{
  "title": "问题标题",
  "severity": "P0|P1|P2|P3",
  "location": {
    "type": "code",
    "file": "文件路径",
    "line": 42
  },
  "why_it_matters": "影响和故障模式描述",
  "finding_type": "error|omission|pre-existing",
  "evidence": ["基于实际内容的证据"],
  "confidence": 0.85,
  "causes": ["修复此问题会自动解决的 finding ID 列表"],
  "caused_by": ["此问题被哪些问题自动解决的 finding ID 列表"],
  "suggested_fix": "建议的修复方向（可选）"
}
```

---

## 合并层调用说明

所有代理返回结果后，编排器调用 `ae-specialist-aggregate` 执行合并层处理：

```
ae-specialist-aggregate({
  strategy: "union",
  results: [所有代理的返回结果],
  dispatchedAgents: [实际派发的代理名称列表]
})
```

合并层执行：
1. **指纹去重** — file + location + title 生成指纹，跨代理去重
2. **冲突解决** — 同问题不同 severity 取最高；建议方向相反的发现保留双方并标记 conflict
3. **因果分析** — 遍历 causes/caused_by 构建依赖图，识别根因发现，标记 auto_resolved
