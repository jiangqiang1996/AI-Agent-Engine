---
name: ae:update
description: "拉取 AE 插件最新代码并重新构建，完成本地更新。"
---

# AE Update

拉取最新代码后清理缓存、重新安装依赖并构建，桥接文件无需变动。

> **缓存说明**：更新过程中必须清理构建产物和过期的 `node_modules`，否则可能出现旧代码残留、模块找不到等运行时问题。

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

## 第四步：清理旧构建产物

**必须执行此步骤**，避免旧产物残留导致运行时异常。

使用 Bash 工具执行：

```bash
# 清理 dist 目录（旧构建产物）
rm -rf <安装目录>/dist
# 清理 TypeScript 增量编译缓存
rm -f <安装目录>/tsconfig.tsbuildinfo
```

- Windows 环境使用等价命令：
  ```powershell
  Remove-Item -Recurse -Force <安装目录>\dist -ErrorAction SilentlyContinue
  Remove-Item -Force <安装目录>\tsconfig.tsbuildinfo -ErrorAction SilentlyContinue
  ```

## 第五步：安装依赖

检查 `package.json` 和 `package-lock.json` 是否有变更：

```bash
git -C <安装目录> diff HEAD~1 -- package.json package-lock.json
```

根据变更情况选择安装策略：

| 变更情况 | 操作 |
|---------|------|
| `package.json` 或 `package-lock.json` 有变更 | **必须**删除 `node_modules` 后全量重装（见下方命令 A） |
| 无变更但仍想确保依赖完整 | 可选执行标准安装（见下方命令 B） |
| 无变更且用户确认跳过 | 跳过此步骤 |

命令 A — 全量重装（依赖变更时**必须**执行）：

```bash
rm -rf <安装目录>/node_modules
npm install --prefix <安装目录> --prefer-online
```

命令 B — 标准安装（可选）：

```bash
npm install --prefix <安装目录>
```

> `--prefer-online` 强制 npm 优先从注册表拉取而非使用本地缓存，避免缓存导致的版本不一致。

## 第六步：构建

使用 Bash 工具执行构建：

```bash
npm run build --prefix <安装目录>
```

- 构建成功：继续下一步
- 构建失败：向用户报告错误信息，建议检查 Node.js 版本或提交 issue

## 第七步：完成

展示更新结果：

✅ AE 插件已更新完成

请重启 opencode 以加载最新版本。

如需验证，重启后尝试 `/ae-help` 或让代理列出 `ae:*` 技能。

## 注意事项

- 更新过程不会影响用户的 `opencode.json` 配置
- 桥接文件（`ae-server.js`、`ae-tui.js`）无需重新创建
- 如果 `npm install` 因网络问题失败，可尝试配置 npm 镜像源后重试
- Windows 环境下 `~` 对应 `%USERPROFILE%`，`~/.config/opencode/` 实际路径为 `%USERPROFILE%\.config\opencode\`
- 清理 `dist/` 和 `tsconfig.tsbuildinfo` 是必要步骤，不能跳过；增量构建可能在文件删除或重命名时残留旧产物
