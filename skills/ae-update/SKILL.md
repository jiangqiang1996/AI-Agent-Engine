---
name: ae:update
description: "将 AE 插件仓库还原为干净状态并拉取最新代码，重新安装依赖和构建，避免缓存残留。"
---

# AE Update

将已有的本地仓库还原到未更改状态，拉取最新代码，清理未纳入版本管理的文件（保留 node_modules），然后重新安装依赖和构建。跳过安装阶段的兼容性检查。

## 第一步：还原仓库并拉取最新代码

在已有的克隆仓库目录中依次执行：

1. 将工作区和暂存区强制重置到上次提交的干净状态：

```bash
cd ~/.config/opencode/ai-agent-engine
git reset --hard HEAD
```

2. 删除未被版本管理的文件和目录，但保留 node_modules 以节省后续安装时间：

```bash
git clean -fd --exclude=node_modules
```

3. 拉取远程最新代码：

```bash
git pull
```

> 先清理再拉取，避免未追踪文件与远程新文件产生冲突。

## 第二步：重新安装依赖和构建

在仓库目录中执行：

```bash
npm install
npm run build
```

## 第三步：确认桥接文件

在全局插件目录 `~/.config/opencode/plugins/` 下重新写入桥接文件（内容幂等，可安全覆写）：

```bash
# ae-server.js
echo "export { default } from '../ai-agent-engine/dist/src/index.js'" > ~/.config/opencode/plugins/ae-server.js

# ae-tui.js
echo "export { default } from '../ai-agent-engine/dist/src/tui.js'" > ~/.config/opencode/plugins/ae-tui.js
```

> 桥接文件内容仅依赖安装路径，只要路径不变则不会变化。跳过安装阶段的兼容性检查（oh-my-openagent / oh-my-opencode / superpowers 检测），因为用户首次安装时已确认兼容性。

## 第四步：完成

展示更新结果：

✅ AE 插件已更新完成

请重启 opencode 以加载最新版本。

如需验证，重启后尝试 `/ae-help` 或让代理列出 `ae:*` 技能。

## 异常处理

如果上述流程因本地仓库损坏或其他原因失败，回退为完全卸载+全新安装：

1. 删除桥接文件和仓库目录：

```bash
rm ~/.config/opencode/plugins/ae-server.js
rm ~/.config/opencode/plugins/ae-tui.js
rm -rf ~/.config/opencode/ai-agent-engine
```

2. 按照 INSTALL.md 的安装章节重新安装。

## 注意事项

- 更新过程不会影响用户的 `opencode.json` 配置
- 保留 node_modules 可避免每次全量下载依赖，显著加快更新速度
- 如果 `npm install` 因网络问题失败，可尝试配置 npm 镜像源后重试
- Windows 环境下 `~` 对应 `%USERPROFILE%`，`~/.config/opencode/` 实际路径为 `%USERPROFILE%\.config\opencode\`
