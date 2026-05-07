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

执行任何 Git 写操作前，必须确认目标目录是 AE 插件安装或源码维护仓库，并取得用户对目标仓库、目标分支和具体命令 `git reset --hard HEAD`、`git clean -fd --exclude=node_modules`、`git pull` 的明确授权。必须提示这些命令会丢弃该安装仓库中的本地未提交修改和未追踪文件。

执行桥接文件覆盖、旧版 TUI 桥接删除、`tui.json` 修改或异常回退删除仓库目录前，也必须先展示将要写入、删除或修改的具体路径，并取得用户对这些文件系统操作的明确授权。

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

根据更新模式重新写入 server 桥接文件，并清理旧版 TUI 桥接与注册项。当前版本只保留 server 插件入口 `dist/src/index.js`，不再注册 `dist/src/tui.js`。

执行目录必须按操作类型区分：Git、依赖安装和构建在 AE 安装仓库目录执行；桥接文件写入和旧 TUI 清理在 opencode 配置根目录执行。全局模式的配置根目录是用户 opencode 配置目录，项目级模式的配置根目录是原业务项目根目录。

下面命令片段使用 Bash 语法展示。实际执行时必须按当前 shell 转译路径展开、重定向和删除命令；Windows PowerShell 环境不要原样执行 `rm -f`、`~` 或 `$HOME` 片段。

`tui.json` 清理会解析并重写该配置文件。执行前建议备份；如果文件不是合法 JSON、根对象不是对象或 `plugin` 不是数组，应跳过自动修改并提示用户手动清理 `./tui-plugins/ae-tui.js` 条目，不要进入卸载重装回退。

### 全局模式

```bash
# ae-server.js
echo "export { default } from '../ai-agent-engine/dist/src/index.js'" > ~/.config/opencode/plugins/ae-server.js

# 清理旧版 TUI 插件配置
rm -f ~/.config/opencode/plugins/ae-tui.js
rm -f ~/.config/opencode/tui-plugins/ae-tui.js
node -e "const fs=require('fs'); const file=process.argv[1]; const entry='./tui-plugins/ae-tui.js'; if(!fs.existsSync(file)) process.exit(0); let json; try{json=JSON.parse(fs.readFileSync(file,'utf8'))}catch{process.exit(0)}; if(!json||typeof json!=='object'||Array.isArray(json)||!Array.isArray(json.plugin)) process.exit(0); const next=json.plugin.filter((x)=>x!==entry); if(next.length!==json.plugin.length) fs.writeFileSync(file, JSON.stringify({...json,plugin:next},null,2)+'\\n')" "$HOME/.config/opencode/tui.json"
```

### 项目级模式

以下命令必须在原业务项目根目录执行，而不是在 `.opencode/ai-agent-engine` 安装仓库目录中执行；否则会把桥接文件写入安装仓库内部的 `.opencode/` 子目录。

```bash
# ae-server.js
echo "export { default } from '../ai-agent-engine/dist/src/index.js'" > .opencode/plugins/ae-server.js

# 清理旧版 TUI 插件配置
rm -f .opencode/plugins/ae-tui.js
rm -f .opencode/tui-plugins/ae-tui.js
node -e "const fs=require('fs'); const file=process.argv[1]; const entry='./tui-plugins/ae-tui.js'; if(!fs.existsSync(file)) process.exit(0); let json; try{json=JSON.parse(fs.readFileSync(file,'utf8'))}catch{process.exit(0)}; if(!json||typeof json!=='object'||Array.isArray(json)||!Array.isArray(json.plugin)) process.exit(0); const next=json.plugin.filter((x)=>x!==entry); if(next.length!==json.plugin.length) fs.writeFileSync(file, JSON.stringify({...json,plugin:next},null,2)+'\\n')" .opencode/tui.json
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

如果上述流程因本地仓库损坏或其他原因失败，回退为完全卸载 + 全新安装。执行回退前必须单独确认删除目标和重新安装范围：

1. 删除桥接文件和仓库目录
2. 按照安装文档重新安装（选择对应的安装模式）

## 注意事项

- 更新过程不会影响用户的 `opencode.json` 配置
- 更新可能会修改 `tui.json` 以移除 AE 旧版 TUI 注册项；修改前先展示路径并建议备份
- 保留 node_modules 可避免每次全量下载依赖
- Windows 环境下 `~` 对应 `%USERPROFILE%`
- 项目级安装和全局安装可以共存，项目级优先加载
