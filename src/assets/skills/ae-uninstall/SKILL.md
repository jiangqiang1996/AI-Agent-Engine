---
name: ae:uninstall
description: "卸载 AE 插件。删除桥接文件和克隆的仓库目录，支持全局和项目级两种范围。"
argument-hint: "[global|project]"
---

# AE 插件卸载

卸载 AI Agent Engine 插件，删除桥接文件和克隆的仓库目录。

支持两种范围：

- **全局**（默认）：卸载 `~/.config/opencode/ai-agent-engine`，移除全局桥接文件
- **项目级**：卸载 `<当前项目根目录>/.opencode/ai-agent-engine`，移除项目级桥接文件

## 第零步：确定卸载范围

检查用户传入的参数：

- 如果参数为 `project` 或用户明确要求项目级卸载，执行项目级卸载
- 如果参数为 `global`、未传参数或参数为空，默认执行全局卸载

确定路径：

- 全局：
  - 桥接文件：`~/.config/opencode/plugins/ae-server.js`
  - 仓库目录：`~/.config/opencode/ai-agent-engine`
- 项目级：
  - 桥接文件：`<当前项目根目录>/.opencode/plugins/ae-server.js`
  - 仓库目录：`<当前项目根目录>/.opencode/ai-agent-engine`

> Windows 环境下 `~` 对应 `%USERPROFILE%`，`~/.config/opencode/` 实际路径为 `%USERPROFILE%\.config\opencode\`

## 第一步：执行卸载脚本

本技能的所有实际操作由脚本 `scripts/uninstall.js` 完成。脚本内置交互式 confirm，在执行文件系统删除操作前会在终端等待用户确认。

在仓库目录或目标父目录执行：

```bash
node scripts/uninstall.js [global|project]
```

脚本会自动完成以下全部步骤：

1. **检测安装状态**：判断目标目录和桥接文件是否存在
2. **请求授权**：通过交互式 confirm 请求用户对删除操作的明确授权
3. **删除桥接文件**：移除 `ae-server.js`
4. **删除仓库目录**：移除克隆的 `ai-agent-engine` 目录
5. **完成**：输出卸载结果

> 脚本通过交互式 confirm 确保所有删除操作得到用户明确授权，无需 LLM 层额外请求授权。

## 第二步：完成

展示卸载结果：

```
AE 插件已卸载完成（全局/项目级）

请重启 opencode 以使变更生效。

验证方式：重启后尝试 /ae-help，该命令不再可用即表示卸载成功。
```

## 注意事项

- 卸载过程不会影响用户的 `opencode.json` 配置（安装时未修改该文件的 `plugin` 字段）
- 脚本内置交互式 confirm，删除操作前会在终端等待用户确认
- 项目级安装和全局安装可以独立卸载，互不影响
