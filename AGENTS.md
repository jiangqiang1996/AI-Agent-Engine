# AI Agent Engine

本仓库实现一套以 AE 为前缀的 opencode 插件能力。

## 当前约定

- 公开技能以 `ae:*` 命名
- 公开命令以 `/ae-*` 命名
- 根目录 `skills/`、`commands/`、`agents/` 是受版本控制的真源
- 运行时产物写入 `.opencode/plugins/`、`.opencode/commands/`、`.opencode/agents/ae/`
- 默认用户入口为 `/ae-lfg`

## 开发方式

- 构建：`npm run build`
- 测试：`npm run test`
- TypeScript 源码位于 `src/`
- 集成测试位于 `tests/integration/`

## 资产同步

- `skills/` 通过 plugin `config.skills.paths` 注入
- `commands/` 在构建时同步到 `.opencode/commands/`
- `agents/` 在构建时同步到 `.opencode/agents/ae/`

## 文档

- requirements：`docs/ae/brainstorms/2026-04-18-ae-plugin-phase-one-requirements.md`
- 当前计划：`docs/ae/plans/2026-04-18-001-feat-ae-phase-one-workflow-plugin-plan.md`
