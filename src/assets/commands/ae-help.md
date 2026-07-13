---
description: 列出 AE 插件中所有可调用的技能、命令和代理，或查询指定元素的详情
model: $quick
subtask: false
---

获取 AE 插件中所有可调用的技能、命令和代理的完整列表。
帮助结果还包含内置 agent/command 的静态模型路由总览，展示其声明的 `quick`、`standard`、`deep`、`vision`、`audio`、`video` 场景。

## 执行方式

**必须调用 `ae-help` 工具**，将结果原样返回给用户。

- 无参数：调用 `ae-help` 工具，不传入 `query`，返回完整列表
- 有关键词：调用 `ae-help` 工具，将用户输入传入 `query`，返回子串匹配的过滤列表
- 有元素名：传入完整元素名（如 `ae:design`、`/ae-design`、`@correctness-reviewer`），精确匹配时返回该元素的详情视图，包含描述、属性和关联元素
- 查询模型路由：将 `model`、场景名或资产名传入 `query`

**禁止手动列举或扫描文件**，列表内容只能来自 `ae-help` 工具的返回值。

## 域代理目录

如需了解域代理及其专精代理的详细信息（选择条件、能力摘要），可调用 `ae-domain-catalog` 工具：

- 按 `domain` 参数查询指定域（如 `review`、`development`）
- 不传参数时返回所有域的目录信息

## 模型路由说明

- 用户可在 `ae.jsonc` 的顶层 `modelScenarios` 中配置场景到模型字符串的映射。
- Agent/command Markdown frontmatter 的 `model` 可以写 `$deep` 这类场景变量，也可以写模型常量名；变量未配置时原样传给 opencode。
- 稳定场景为 `quick`、`standard`、`deep`、`vision`、`audio`、`video`；具体模型标识由用户自己的 opencode 环境决定。
- `vision` 只表示视觉任务场景，`audio` 只表示音频任务场景，`video` 只表示视频任务场景，首版不探测模型是否支持对应模态输入。
- 首版不支持 fallback、capabilities、params、动态路由或内置推荐模型链。

## 适用与退出

- 适用输入：查询有哪些技能、命令、代理，或询问某个 AE 入口该怎么用。
- 退出条件：`ae-help` 工具已返回结果，并被原样输出给用户。
- 产物：工具返回的 Markdown 帮助文本；本命令自身不创建额外文档。
- 失败恢复：如果工具失败，直接报告失败原因，不手动扫描仓库补造帮助列表。
- 下一步：需要执行某个技能、命令或代理时，由用户或上游技能基于帮助结果再做选择。

## 输出格式

直接将 `ae-help` 工具返回的 Markdown 文本输出给用户，不做任何修改、精简或二次加工。
