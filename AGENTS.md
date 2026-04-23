# AI Agent Engine

AE opencode 插件，提供从需求到交付的完整 AI 辅助工作流。

## 约定

- 公开技能以 `ae:*` 命名
- 公开命令以 `/ae-*` 命名
- `src/assets/` 下的 `skills/`、`agents/`、`rules/` 是受版本控制的真源
- 运行时产物写入 `.opencode/plugins/`
- 默认用户入口为 `/ae-lfg`

## 开发方式

- 构建：`npm run build`
- 测试：`npm run test`
- 类型检查：`npm run typecheck`
- TypeScript 源码位于 `src/`

## 架构

- `src/assets/skills/` 通过 plugin `config.skills.paths` 注入
- `src/assets/agents/` 在构建时同步到 `.opencode/agents/ae/`
- `src/assets/rules/` 通过 `config.instructions` 注入
- 自定义工具：`ae-recovery`、`ae-review-contract`、`ae-handoff`
- 代理分层：30 required + 3 gilded = 33 个代理

## 文档

- 需求文档：`docs/ae/brainstorms/`
- 计划文档：`docs/ae/plans/`
