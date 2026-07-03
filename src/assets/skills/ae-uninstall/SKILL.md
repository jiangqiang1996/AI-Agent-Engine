---
name: ae:uninstall
description: "卸载 AE 插件。自动检测已安装的范围，让用户选择卸载全局或项目级。"
---

# AE 插件卸载

卸载 AI Agent Engine 插件，删除桥接文件和克隆的仓库目录。

本技能不需要传入参数，流程自动检测安装状态后让用户选择卸载范围。

支持两种范围：

- **全局**：卸载 `~/.config/opencode/ai-agent-engine`，移除全局桥接文件
- **项目级**：卸载 `<当前项目根目录>/.opencode/ai-agent-engine`，移除项目级桥接文件

## 第零步：检测安装状态

在 AE 插件源码仓库根目录执行检测命令：

```bash
node scripts/uninstall.js --detect
```

脚本会输出 JSON 格式的安装状态，包含全局和项目级的安装信息：

```json
{
  "global": {
    "installed": true,
    "bridgeExists": true,
    "repoExists": true,
    "bridgeFile": "/path/to/bridge",
    "repoDir": "/path/to/repo"
  },
  "project": {
    "installed": false,
    "bridgeExists": false,
    "repoExists": false,
    "bridgeFile": "/path/to/bridge",
    "repoDir": "/path/to/repo"
  }
}
```

解析输出 JSON，确定哪些范围已安装。

## 第一步：使用 question 工具让用户选择

根据检测结果构建选项：

- 如果全局和项目级都未安装：告知用户"未检测到 AE 插件安装，无需卸载"并停止流程
- 如果只有全局已安装：选项为"卸载全局"和"不卸载"
- 如果只有项目级已安装：选项为"卸载项目级"和"不卸载"
- 如果两者都已安装：选项为"卸载全局"、"卸载项目级"、"卸载全局和项目级"和"不卸载"

使用 question 工具展示选项，每个选项附带路径说明（桥接文件和仓库目录路径）。

## 第二步：一次性授权确认

用户选择卸载范围后，使用 question 工具确认授权，**只确认一次**。确认内容必须包含：

1. 将要删除的具体路径（桥接文件 + 仓库目录）
2. 说明卸载后需重启 opencode 才能生效

用户确认授权后直接进入第三步执行脚本，**不再二次请求授权**。用户拒绝则停止流程。

## 第三步：执行卸载脚本

授权确认后，在 AE 插件源码仓库根目录执行：

```bash
# 卸载单个范围
node scripts/uninstall.js --scope global --yes
node scripts/uninstall.js --scope project --yes

# 同时卸载两个范围
node scripts/uninstall.js --scope global --scope project --yes
```

`--yes` 标志跳过脚本内交互式确认（授权已在第二步完成）。`--scope` 参数指定卸载范围。

脚本会自动完成以下全部步骤：

1. **检测安装状态**：判断目标目录和桥接文件是否存在
2. **删除桥接文件**：移除 `ae-server.js`
3. **删除仓库目录**：移除克隆的 `ai-agent-engine` 目录
4. **完成**：输出卸载结果

## 第四步：完成

展示卸载结果：

```
AE 插件已卸载完成（全局/项目级）

请重启 opencode 以使变更生效。

验证方式：重启后尝试 /ae-help，该命令不再可用即表示卸载成功。
```

## 注意事项

- 卸载过程不会影响用户的 `opencode.json` 配置（安装时未修改该文件的 `plugin` 字段）
- 项目级安装和全局安装可以独立卸载，互不影响
- 授权只确认一次，脚本使用 `--yes` 标志跳过交互式确认，避免二次授权
- 本技能不需要传入参数，流程自动检测后让用户选择
