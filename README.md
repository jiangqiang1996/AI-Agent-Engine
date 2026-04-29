# AI Agent Engine

AI Agent Engine（AE）是面向 opencode 的工程工作流插件，提供从构思、需求、计划、执行、审查到跨会话恢复的一组 AI 辅助能力。

## 文档分工

| 文件 | 职责 |
| --- | --- |
| `README.md` | 项目入口、安装、更新、卸载和开发信息 |
| [docs/usage-guide.md](docs/usage-guide.md) | 用户手册：使用场景、命令、代理、参数和前端流程 |
| [docs/builtin-mcp.md](docs/builtin-mcp.md) | 内置 MCP：默认项、优先级、禁用与覆盖方式 |
| `/ae-help` | 运行时权威帮助：输出当前可用技能、命令和代理 |

## 支持范围

本项目只支持 opencode（[官网](https://opencode.ai)）。

## 安装

AE 支持全局安装和项目级安装。

| 模式 | 安装位置 | 生效范围 | 适用场景 |
| --- | --- | --- | --- |
| 全局安装 | `~/.config/opencode/ai-agent-engine` | 所有项目 | 日常开发，所有项目共享 AE |
| 项目级安装 | `<项目根目录>/.opencode/ai-agent-engine` | 当前项目 | 特定项目需要独立版本或定制 |

### 全局安装

把下面这句话原样复制给 opencode AI 代理：

```text
Fetch and follow the global install instructions from https://gitee.com/jiangqiang1996/ai-agent-engine/raw/master/.opencode/INSTALL.md
```

### 项目级安装

把下面这句话原样复制给 opencode AI 代理：

```text
Fetch and follow the project-level install instructions from https://gitee.com/jiangqiang1996/ai-agent-engine/raw/master/.opencode/INSTALL.md
```

### 安装注意事项

安装前应检查项目中是否存在可能与 AE 不兼容的插件：

| 插件 |
| --- |
| `oh-my-openagent` |
| `oh-my-opencode` |
| `superpowers` |

如存在，先向用户说明潜在冲突，再继续安装。

## 更新

### 全局更新

```text
/ae-update
```

或把下面这句话原样复制给 opencode AI 代理：

```text
Fetch and follow the global update instructions from https://gitee.com/jiangqiang1996/ai-agent-engine/raw/master/.opencode/INSTALL.md
```

### 项目级更新

```text
/ae-update project
```

或把下面这句话原样复制给 opencode AI 代理：

```text
Fetch and follow the project-level update instructions from https://gitee.com/jiangqiang1996/ai-agent-engine/raw/master/.opencode/INSTALL.md
```

## 卸载

### 全局卸载

把下面这句话原样复制给 opencode AI 代理：

```text
Fetch and follow the global uninstall instructions from https://gitee.com/jiangqiang1996/ai-agent-engine/raw/master/.opencode/INSTALL.md
```

### 项目级卸载

把下面这句话原样复制给 opencode AI 代理：

```text
Fetch and follow the project-level uninstall instructions from https://gitee.com/jiangqiang1996/ai-agent-engine/raw/master/.opencode/INSTALL.md
```

## 安装后使用

```text
/ae-help
/ae-lfg 实现一个功能
```

更多使用方式见 [用户手册](docs/usage-guide.md)。

内置 MCP 的默认值、覆盖和禁用方式见 [docs/builtin-mcp.md](docs/builtin-mcp.md)。

## 开发

| 操作 | 命令 |
| --- | --- |
| 构建 | `npm run build` |
| 测试 | `npm run test` |
| 类型检查 | `npm run typecheck` |

TypeScript 源码位于 `src/`。受版本控制的 AE 资产真源位于 `src/assets/skills/`、`src/assets/agents/`、`src/assets/rules/`、`src/assets/commands/` 和 `src/assets/config/`。
