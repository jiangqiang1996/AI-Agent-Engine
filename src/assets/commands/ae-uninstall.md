---
description: 卸载 AE 插件，自动检测已安装范围后让用户选择卸载全局或项目级，一次授权直接执行
model: $standard
subtask: false
---

<!-- 与 docs/INSTALL.md 的"卸载"章节保持同步 -->

卸载 AI Agent Engine 插件。本命令不需要传入参数，流程自动检测安装状态后让用户选择卸载范围。

支持两种范围：

- **全局**：卸载 `~/.config/opencode/plugins/` 下的 `ae-server.js` 和 `ai-agent-engine/`
- **项目级**：卸载 `<当前项目根目录>/.opencode/plugins/` 下的 `ae-server.js` 和 `ai-agent-engine/`

## 第零步：检测安装状态

`/ae-uninstall` 命令仅在 AE 插件已加载时可用，因此脚本必然已存在于安装目录。按 scope 解析脚本绝对路径：

- **全局**：`~/.config/opencode/ai-agent-engine-src/scripts/uninstall.js`（Windows: `%USERPROFILE%\.config\opencode\ai-agent-engine-src\scripts\uninstall.js`）
- **项目级**：`<当前项目根目录>/.opencode/ai-agent-engine-src/scripts/uninstall.js`

> 当前项目根目录取 `process.cwd()`，即执行命令时的工作目录。

执行检测命令（分别检测全局和项目级）：

```bash
node "<全局脚本路径>" --target-dir "~/.config/opencode" --detect
node "<项目级脚本路径>" --target-dir "<当前项目根目录>/.opencode" --detect
```

脚本输出 JSON 格式的安装状态，解析后确定哪些范围已安装。

## 第一步：使用 question 工具让用户选择

根据检测结果构建选项：

- 如果全局和项目级都未安装：告知用户"未检测到 AE 插件安装，无需卸载"并停止流程
- 如果只有全局已安装：选项为"卸载全局"和"不卸载"
- 如果只有项目级已安装：选项为"卸载项目级"和"不卸载"
- 如果两者都已安装：选项为"卸载全局"、"卸载项目级"、"卸载全局和项目级"和"不卸载"

使用 question 工具展示选项，每个选项附带路径说明。

## 第二步：一次性授权确认

用户选择卸载范围后，使用 question 工具确认授权，**只确认一次**。确认内容必须包含：

1. 将要删除的具体路径（bundle 文件、assets 目录、仓库目录）
2. 说明卸载后需重启 opencode 才能生效

用户确认授权后直接进入第三步，**不再二次请求授权**。用户拒绝则停止流程。

## 第三步：执行卸载脚本

根据第一步用户选择的范围，对每个范围执行卸载命令（`<target-dir>` 按范围填充）：

```bash
node "<脚本绝对路径>" --target-dir "<target-dir>" --yes
```

可对全局和项目级分别执行，脚本自动完成卸载。

## 第四步：完成

```
AE 插件已卸载完成（全局/项目级）

请重启 opencode 以使变更生效。

验证方式：重启后尝试 /ae-help，该命令不再可用即表示卸载成功。
```

## 注意事项

- 卸载过程不会影响用户的 `opencode.json` 配置
- 项目级安装和全局安装可以独立卸载，互不影响
- 授权只确认一次，脚本使用 `--yes` 标志跳过交互式确认，避免二次授权
- 本命令不需要传入参数，流程自动检测后让用户选择
- 卸载脚本只删除 `plugins/` 下的 `ae-server.js` 和 `ai-agent-engine/`，不触碰其他插件文件
