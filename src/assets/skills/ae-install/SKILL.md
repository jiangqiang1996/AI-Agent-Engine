---
name: ae:install
description: "安装或更新 AE 插件。自动判断：已安装则拉取最新代码并重新构建，未安装则全新安装。支持全局和项目级两种范围。"
argument-hint: "[global|project]"
---

# AE 插件安装或更新

安装或更新 AI Agent Engine 插件。自动判断当前范围是否已安装：

- **已安装** → 还原仓库到干净状态，拉取最新代码，重新安装依赖和构建（即更新）
- **未安装** → 克隆仓库，安装依赖，构建产物，写入桥接文件（即全新安装）

支持两种范围：

- **全局**（默认）：安装到 `~/.config/opencode/ai-agent-engine`，对所有项目生效
- **项目级**：安装到 `<当前项目根目录>/.opencode/ai-agent-engine`，仅对当前项目生效

## 第零步：确定安装范围

检查用户传入的参数：

- 如果参数为 `project` 或用户明确要求项目级安装，执行项目级安装
- 如果参数为 `global`、未传参数或参数为空，默认执行全局安装

确定安装路径：

- 全局：`~/.config/opencode/ai-agent-engine`
- 项目级：`<当前项目根目录>/.opencode/ai-agent-engine`

> Windows 环境下 `~` 对应 `%USERPROFILE%`，`~/.config/opencode/` 实际路径为 `%USERPROFILE%\.config\opencode\`

## 第一步：执行安装或更新脚本

本技能的所有实际操作由脚本 `scripts/install.js` 完成。脚本内置交互式 confirm，在执行 destructive Git 操作（`git reset --hard`、`git clean -fd`、`git pull`）或文件系统写操作前会在终端等待用户确认。

执行任何 Git 写操作前，必须确认目标仓库是 AE 插件安装或源码维护仓库，并取得用户对目标仓库、目标分支、工作区、完整命令参数、授权来源和具体命令的明确授权。未授权时必须停止安装流程。必须提示这些命令会丢弃该安装仓库中的本地未提交修改和未追踪文件。

在安装仓库目录（已安装时）或目标父目录（未安装时）执行：

```bash
node scripts/install.js [global|project]
```

脚本会自动完成以下全部步骤：

1. **检测安装状态**：判断目标目录是否已存在且是 git 仓库
2. **已安装时（更新流程）**：
   - 请求用户授权 `git reset --hard HEAD`、`git clean -fd --exclude=node_modules`、`git pull`
   - 还原仓库到干净状态并拉取最新代码
   - 运行 `npm install` 和 `npm run build`
   - 重新写入 server 桥接文件
3. **未安装时（全新安装流程）**：
   - 克隆仓库到目标目录
   - 运行 `npm install` 和 `npm run build`
   - 创建 server 桥接文件，指向 `dist/src/index.js`
4. **完成**：输出安装或更新结果

> 脚本通过交互式 confirm 确保所有 destructive 操作得到用户明确授权，无需 LLM 层额外请求授权。

## 第二步：完成

展示安装或更新结果：

```
AE 插件已安装/更新完成（全局/项目级）

请重启 opencode 以加载最新版本。

如需验证，重启后尝试 /ae-help 命令。
```

## 注意事项

- 安装或更新过程不会影响用户的 `opencode.json` 配置
- 保留 node_modules 可避免每次全量下载依赖（更新场景）
- 项目级安装和全局安装可以共存，项目级优先加载
- 脚本内置交互式 confirm，destructive 操作前会在终端等待用户确认
