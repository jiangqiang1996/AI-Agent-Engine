# 命令模型场景配置规范

## 规则

1. **所有命令必须配置模型场景** — `src/services/asset-model-routing-catalog.ts` 中的 `COMMAND_SCENARIOS` 必须覆盖 `COMMAND` 常量中定义的每一个命令名（不含变体后缀），不得遗漏。
2. **变体命令继承原始命令的模型场景** — `-po`、`-pa` 等变体命令不得在 `COMMAND_SCENARIOS` 中单独声明不同场景，必须通过 `getCommandModelScenario` 的后缀剥离逻辑继承原始命令的场景配置。`-auto` 变体因命令名不遵循后缀剥离规则，允许显式声明但场景必须与原始命令一致。
3. **新增命令时同步更新** — 在 `src/schemas/ae-asset-schema.ts` 的 `SKILL`/`COMMAND` 中新增命令后，必须同步在 `COMMAND_SCENARIOS` 中添加对应的模型场景条目，并按命令复杂度选择场景：`quick`（查询/帮助类）、`standard`（创建/交互类）、`deep`（规划/审查/执行类）、`vision`（浏览器视觉类）。

## 适用范围

- 修改 `src/services/asset-model-routing-catalog.ts`
- 新增 AE 技能或命令时同步更新模型路由

## 语境

AE 插件源码维护专用规范。
