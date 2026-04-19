---
name: ae:update
description: "拉取 AE 插件最新代码并重新构建，完成本地更新。"
---

# AE Update

拉取最新代码后重新构建，桥接文件无需变动。

## 第一步：定位安装目录

确定 AE 插件的本地安装路径。默认安装目录为：

- Linux / macOS: `~/.config/opencode/ai-agent-engine`
- Windows: `%USERPROFILE%\.config\opencode\ai-agent-engine`

如果用户提供了自定义安装路径，使用用户提供的路径。

使用 Bash 工具检查目录是否存在以及是否为 git 仓库：

```bash
git -C <安装目录> rev-parse --is-inside-work-tree
```

- 目录存在且为 git 仓库：继续下一步
- 目录不存在或不是 git 仓库：提示用户先安装 AE 插件，终止更新流程

## 第二步：检查当前版本

使用 Bash 工具查看当前安装的版本：

```bash
git -C <安装目录> log -1 --format="%h %s (%cr)"
```

将当前版本信息告知用户。

## 第三步：拉取最新代码

使用 Bash 工具执行：

```bash
git -C <安装目录> pull
```

- 如果拉取成功且无新提交：告知用户已经是最新版本，无需继续
- 如果拉取成功且有新提交：继续下一步
- 如果拉取失败（网络问题、本地冲突等）：向用户报告错误信息并建议手动处理

## 第四步：安装依赖

检查 `package.json` 中的依赖版本是否有变更：

```bash
git -C <安装目录> diff HEAD~1 -- package.json
```

- 如果 `package.json` 有变更（特别是 `dependencies` 或 `devDependencies`）：必须执行 `npm install`
- 如果无变更：可以跳过，但仍建议执行以确保依赖完整

询问用户是否要执行 `npm install`（当依赖有变更时直接执行而非询问）。

如需安装，使用 Bash 工具执行：

```bash
npm install --prefix <安装目录>
```

## 第五步：构建

使用 Bash 工具执行构建：

```bash
npm run build --prefix <安装目录>
```

- 构建成功：继续下一步
- 构建失败：向用户报告错误信息，建议检查 Node.js 版本或提交 issue

## 第六步：完成

展示更新结果：

✅ AE 插件已更新完成

请重启 opencode 以加载最新版本。

如需验证，重启后尝试 `/ae-lfg` 或让代理列出 `ae:*` 技能。

## 注意事项

- 更新过程不会影响用户的 `opencode.json` 配置
- 桥接文件（`ae-server.js`、`ae-tui.js`）无需重新创建
- 如果 `npm install` 因网络问题失败，可尝试配置 npm 镜像源后重试
- Windows 环境下 `~` 对应 `%USERPROFILE%`，`~/.config/opencode/` 实际路径为 `%USERPROFILE%\.config\opencode\`
