# ai-agent-engine 基础规范

## 生效范围

- 本规则集只约束开发当前 `ai-agent-engine` 源码仓库的 OpenCode 会话。
- 面向插件用户的可分发能力只以 `src/` 下定义为真源。
- `AGENTS.md` 是本仓库规则入口，不会作为插件用户侧资产打包。
- `.opencode/rules/**/*.md` 是本仓库开发会话规则，不是插件运行时资产。

## 语言要求

- 代理与用户沟通、询问和总结使用中文。
- 代码注释、文档和 Git 提交信息使用中文。
- 面向插件用户的提示词、命令说明、工具描述和错误提示使用中文。

## 项目概况

- 项目类型：opencode 插件源码仓库。
- 运行时：Node.js ESM。
- 包管理器：npm。
- 核心依赖以 `package.json` 和 `package-lock.json` 为准，不要在规则里硬编码数量或版本结论。
- `src/index.ts` 是插件服务端入口，`src/tui.ts` 是 TUI 入口。

## 开发命令

- 构建：`npm run build`，实际执行 `tsc -p tsconfig.json && node scripts/postbuild.mjs`。
- 类型检查：`npm run typecheck`。
- 全量测试：`npm run test`。
- 单个测试：`npx vitest run tests/path/to/file.test.ts` 或 `npx vitest run src/path/to/file.test.ts`。
- 交付前至少运行与改动相关的 `typecheck`、测试或构建；无法运行时说明原因。

## 本地与产物目录边界

- `src/` 是插件源码和可分发资产真源。
- `dist/` 是 TypeScript 与 postbuild 生成产物，不要手工维护。
- `.opencode/plugins/` 是本仓库使用当前开发中插件的调试桥接目录，便于快速验证插件，不代表打包后插件内容。
- `.opencode/` 其余内容是开发当前仓库时生效的 opencode 配置、规则和本地依赖，不代表打包后插件内容。
- `docs/ae/`、`runs/`、`tmp/` 多为运行或调试产物；不要把其中内容当作插件能力真源。
- `opencode.json` 当前会加载 `AGENTS.md` 和 `.opencode/rules/**/*.md`；不要把该加载方式写成插件用户项目必须具备的结构。

## 运行时动态注入属性

- opencode 的 `ToolContext` 在运行时可能包含类型声明中未列出的额外属性，如 `history`。
- 使用 `as { prop?: Type }` 类型断言并配合存在性守卫访问这些属性，是合法的防御性写法。
- 只要代码提供合理降级路径，不要仅因 TypeScript 声明缺失就删除或报告这类访问。
