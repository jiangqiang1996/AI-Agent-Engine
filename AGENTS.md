# AI Agent Engine

- 本仓库是 AE opencode 插件源码仓库；面向插件用户的可分发能力只以 `src/` 下定义为真源。
- `AGENTS.md` 只约束开发当前仓库的 OpenCode 会话，不会作为插件用户侧资产打包。
- 详细开发规范在 `.opencode/rules/**/*.md`，当前 `opencode.json` 会同时加载本文件和这些规则。
- `.opencode/`、`graphify-out/`、`docs/ae/`、`runs/`、`tmp/`、`figma-exports/` 等内容优先按本仓库开发、调试或运行产物理解，不要当作插件用户侧能力真源。
