---
name: ae:update
description: "将 AE 插件仓库还原为干净状态并拉取最新代码，重新安装依赖和构建，避免缓存残留。"
argument-hint: "[project]"
---

# AE 插件更新

将已有的本地仓库还原到未更改状态，拉取最新代码，清理未纳入版本管理的文件（保留 node_modules），然后重新安装依赖和构建。

支持两种更新模式：
- **全局更新**（默认）：更新 `~/.config/opencode/ai-agent-engine`
- **项目级更新**：更新当前项目 `.opencode/ai-agent-engine`

## 第零步：确定更新模式

检查用户传入的参数：

- 如果参数为 `project` 或用户明确要求项目级更新，执行项目级更新
- 如果未传参数或参数为空，默认执行全局更新

确定仓库路径：
- 全局：`~/.config/opencode/ai-agent-engine`
- 项目级：`<当前项目根目录>/.opencode/ai-agent-engine`

如果对应目录不存在或不是 git 仓库，提示用户未找到安装目录并建议先安装。

## 第一步：还原仓库并拉取最新代码

在已确定的仓库目录中依次执行：

1. 将工作区和暂存区强制重置到上次提交的干净状态：

```bash
git reset --hard HEAD
```

2. 删除未被版本管理的文件和目录，但保留 node_modules：

```bash
git clean -fd --exclude=node_modules
```

3. 拉取远程最新代码：

```bash
git pull
```

> 先清理再拉取，避免未追踪文件与远程新文件产生冲突。

## 第二步：重新安装依赖和构建

```bash
npm install
npm run build
```

## 第三步：确认桥接文件

根据更新模式，在对应目录下重新写入桥接文件（内容幂等，可安全覆写）：

### 全局模式

```bash
# ae-server.js
echo "export { default } from '../ai-agent-engine/dist/src/index.js'" > ~/.config/opencode/plugins/ae-server.js

# ae-tui.js
echo "export { default } from '../ai-agent-engine/dist/src/tui.js'" > ~/.config/opencode/plugins/ae-tui.js
```

### 项目级模式

```bash
# ae-server.js
echo "export { default } from '../ai-agent-engine/dist/src/index.js'" > .opencode/plugins/ae-server.js

# ae-tui.js
echo "export { default } from '../ai-agent-engine/dist/src/tui.js'" > .opencode/plugins/ae-tui.js
```

> 跳过安装阶段的兼容性检查，因为用户首次安装时已确认兼容性。

## 第四步：完成

展示更新结果：

```
AE 插件已更新完成（全局/项目级）

请重启 opencode 以加载最新版本。

如需验证，重启后尝试 /ae-help 命令。
```

## 异常处理

如果上述流程因本地仓库损坏或其他原因失败，回退为完全卸载 + 全新安装：

1. 删除桥接文件和仓库目录
2. 按照安装文档重新安装（选择对应的安装模式）

## 注意事项

- 更新过程不会影响用户的 `opencode.json` 配置
- 保留 node_modules 可避免每次全量下载依赖
- Windows 环境下 `~` 对应 `%USERPROFILE%`
- 项目级安装和全局安装可以共存，项目级优先加载
