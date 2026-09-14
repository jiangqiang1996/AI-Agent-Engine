# AI Agent Engine

- 本仓库是 AE 的 oh-my-pi（omp）插件 marketplace 仓库：可分发真源为 `ae-omp-plugin/`（纯资产包）与仓库根 `.omp-plugin/marketplace.json` catalog。
- 安装、双 scope、代理发现门控与验证流程以 `ae-omp-plugin/README.md` 为准；用户侧远程安装（gitee `oh-my-pi` 分支、一键提示词、`scripts/install.mjs`/`uninstall.mjs`）以 `docs/INSTALL.md` 为准；仓库开发规范与发布流程以 `docs/development.md` 为准。
- `AGENTS.md` 只约束开发本仓库的 omp 会话，不会作为插件用户侧资产打包。
- `ae/`、`tmp/` 等内容按本仓库开发、调试或运行产物理解，不要当作插件用户侧能力真源。
