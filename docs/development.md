# AE 插件开发指南

本指南面向 AE 插件源码仓库的贡献者。面向插件用户的运行时能力文档见 [usage-guide.md](usage-guide.md)。

## 仓库结构

| 路径 | 作用 |
| --- | --- |
| `src/index.ts` | server 插件入口，负责注册和依赖组装 |
| `src/tools/` | opencode 工具定义（21 个工具） |
| `src/services/` | 业务逻辑、注册逻辑和运行时服务 |
| `src/schemas/` | Zod Schema 与资产常量（`ae-asset-schema.ts` 是技能/命令/代理/工具名常量真源） |
| `src/utils/` | 无业务状态的通用工具函数 |
| `src/assets/skills/` | 技能提示词和参考文件 |
| `src/assets/commands/` | Markdown 命令 |
| `src/assets/agents/` | 子代理提示词 |
| `src/assets/rules/` | 注入用户会话的内置规则 |
| `src/assets/config/` | 内置 `ae.jsonc` 默认配置 |
| `dist/` | TypeScript 构建产物（不手工维护） |
| `.opencode/plugins/` | 本仓库调试桥接目录 |
| `.opencode/rules/` | 本仓库开发会话规则 |
| `tests/` | Vitest 测试 |

## 开发命令

| 操作 | 命令 |
| --- | --- |
| 安装依赖 | `npm install` |
| 构建 | `npm run build` |
| 类型检查 | `npm run typecheck` |
| 全量测试 | `npm run test` |
| 单个测试 | `npx vitest run tests/path/to/file.test.ts` |

## 架构概览

### 模块边界

```text
index.ts / tools → services → schemas / utils
```

- `tools/` 是最接近用户的工具边界，负责参数 Schema、调用服务、捕获错误并返回可恢复中文提示
- `services/` 封装业务逻辑和运行时注册逻辑
- `schemas/` 集中管理 Zod Schema 与资产常量
- `utils/` 只放无业务状态的通用工具函数
- 下层不依赖工具层或 UI toast；同层保持最小依赖，禁止循环依赖

### 资产名称常量化

技能名、命令名、代理名、工具名必须在 `src/schemas/ae-asset-schema.ts` 中定义为 `as const` 常量。新增资产先改常量，再改注册或资产文件。

### 关键服务文件

| 文件 | 职责 |
| --- | --- |
| `ae-catalog.ts` | Phase One 技能条目、PO/PA 变体、代理定义 |
| `command-registration.ts` | 命令配置构建 |
| `agent-registration.ts` | 代理配置构建 |
| `help-catalog-service.ts` | 帮助目录构建、过滤和格式化 |
| `asset-model-routing-catalog.ts` | 命令和代理的模型场景路由 |
| `runtime-asset-manifest.ts` | 运行时资产清单 |
| `recovery-service.ts` | AE 产物恢复和阶段回退 |

## 测试

使用 Vitest 作为测试框架。测试文件放在 `tests/` 目录下，按模块分类。

覆盖率要求：

| 模块 | 最低覆盖率 |
| --- | --- |
| `tools/` | 80% |
| `hooks/` | 80% |
| `services/` | 90% |
| `schemas/` | 90% |
| `utils/` | 90% |

## 开发规范

详细开发规范在 `AGENTS.md` 和 `.opencode/rules/**/*.md`：

| 规范 | 文件 |
| --- | --- |
| 基础规范 | `.opencode/rules/core/base.md` |
| 代码风格 | `.opencode/rules/core/code-style.md` |
| 架构规范 | `.opencode/rules/architecture/architecture.md` |
| 运行时独立性 | `.opencode/rules/architecture/runtime-independence.md` |
| Git 工作流 | `.opencode/rules/core/git-workflow.md` |
| 测试规范 | `.opencode/rules/core/testing.md` |
| OpenCode 原生资产 | `.opencode/rules/core/opencode-native-assets.md` |
| 命令模型路由 | `.opencode/rules/architecture/command-model-routing.md` |
| 前端规范 | `.opencode/rules/architecture/frontend.md` |

## 构建流程

`npm run build` 执行 `tsc -p tsconfig.json && node scripts/postbuild.mjs`。

postbuild 会：
1. bundle `dist/src/index.js`
2. 清理历史 TUI 残留文件
3. 写入 `.opencode/plugins/ae-server.js` 包装文件（供本仓库调试）
4. 复制 `src/assets/` 到 `dist/src/assets/`

## 运行时独立性

AE 插件运行时必须独立于源码仓库布局，支持仅依赖桥接文件和 `dist` 目录完成加载与执行。运行时代码不得把 `dist` 与桥接文件以外的仓库文件当作必需前提。

详见 `.opencode/rules/architecture/runtime-independence.md`。
