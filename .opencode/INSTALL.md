# AI Agent Engine for OpenCode — 安装 / 更新 / 卸载

本项目**只支持 opencode**。

如果你已经把这份文档交给 AI 代理，请根据用户意图执行对应章节的步骤。

AE 支持两种安装模式：

| 模式 | 安装位置 | 生效范围 | 适用场景 |
| --- | --- | --- | --- |
| **全局安装** | `~/.config/opencode/ai-agent-engine` | 所有项目 | 日常开发，所有项目共享 AE |
| **项目级安装** | `<项目根目录>/.opencode/ai-agent-engine` | 仅当前项目 | 特定项目需要独立版本或定制 |

---

## 一、安装

### 前置检查（全局和项目级均需执行）

先检查本地是否已安装以下 opencode 插件：
- `oh-my-openagent`
- `oh-my-opencode`
- `superpowers`

检查范围至少包括：
- 当前生效的 `opencode.json`
- 用户级 opencode 配置目录下的 plugin 配置
- 本地已存在的 plugin 安装路径

如果发现任意一个已安装插件，**必须先在对话中明确警告用户**：这些插件可能与 AI Agent Engine 不兼容；告警发出后，才允许继续执行后续安装步骤。

### 1.1 全局安装

1. 将仓库克隆到固定安装目录：

```bash
git clone https://gitee.com/jiangqiang1996/ai-agent-engine.git ~/.config/opencode/ai-agent-engine
```

2. 进入仓库根目录并安装依赖、构建产物：

```bash
cd ~/.config/opencode/ai-agent-engine
npm install
npm run build
```

3. 创建 server 桥接文件，指向克隆仓库的构建产物；如果存在历史 TUI 桥接文件，则同步清理：

```bash
# ae-server.js
echo "export { default } from '../ai-agent-engine/dist/src/index.js'" > ~/.config/opencode/plugins/ae-server.js

# 清理旧版 TUI 插件配置（当前版本已无 tui.ts / dist/src/tui.js）
rm -f ~/.config/opencode/plugins/ae-tui.js
rm -f ~/.config/opencode/tui-plugins/ae-tui.js
node -e "const fs=require('fs'); const file=process.argv[1]; const entry='./tui-plugins/ae-tui.js'; if(!fs.existsSync(file)) process.exit(0); const json=JSON.parse(fs.readFileSync(file,'utf8')); if(Array.isArray(json.plugin)){json.plugin=json.plugin.filter((x)=>x!==entry); fs.writeFileSync(file, JSON.stringify(json,null,2)+'\\n')}" "$HOME/.config/opencode/tui.json"
```

> **为什么这样做？** 当前版本只保留 server 插件入口 `dist/src/index.js`；旧版 TUI 插件入口已移除，历史 `ae-tui.js` 和 `tui.json` 注册项需要清理，避免 opencode 尝试加载不存在的 `dist/src/tui.js`。

如果用户选择了不同安装目录，请同步调整桥接文件中的相对路径。

4. 重启 opencode。

5. 验证方式：
- 在会话中尝试 `/ae-help`

### 1.2 项目级安装

1. 在项目根目录下克隆仓库到 `.opencode/` 目录：

```bash
git clone https://gitee.com/jiangqiang1996/ai-agent-engine.git .opencode/ai-agent-engine
```

2. 进入目录并安装依赖、构建：

```bash
cd .opencode/ai-agent-engine
npm install
npm run build
```

3. 创建项目级 server 桥接文件，指向克隆仓库的构建产物；如果存在历史 TUI 桥接文件，则同步清理：

```bash
# ae-server.js
echo "export { default } from '../ai-agent-engine/dist/src/index.js'" > .opencode/plugins/ae-server.js

# 清理旧版 TUI 插件配置（当前版本已无 tui.ts / dist/src/tui.js）
rm -f .opencode/plugins/ae-tui.js
rm -f .opencode/tui-plugins/ae-tui.js
node -e "const fs=require('fs'); const file=process.argv[1]; const entry='./tui-plugins/ae-tui.js'; if(!fs.existsSync(file)) process.exit(0); const json=JSON.parse(fs.readFileSync(file,'utf8')); if(Array.isArray(json.plugin)){json.plugin=json.plugin.filter((x)=>x!==entry); fs.writeFileSync(file, JSON.stringify(json,null,2)+'\\n')}" .opencode/tui.json
```

4. 重启 opencode。

5. 验证方式：
- 在当前项目会话中尝试 `/ae-help`

> **注意：** 项目级安装仅对当前项目生效。如需全局生效，请使用全局安装。项目级安装和全局安装可以共存，项目级优先。

---

## 二、更新

使用 `ae:update` 技能（或 `/ae-update` 命令）：

```text
# 全局更新（默认）
/ae-update

# 项目级更新
/ae-update project
```

它会自动完成：还原本地仓库到干净状态 → 拉取最新代码 → 清理未追踪文件（保留 node_modules）→ 重新安装依赖 → 构建。

不传参数时默认执行全局更新。传入 `project` 时执行项目级更新。

构建完成后重启 opencode 即生效。当前版本已移除 TUI 入口；如果更新前安装过旧版 TUI 插件，请按下方“清理旧版 TUI 配置”额外清理一次。

### 清理旧版 TUI 配置

旧版安装可能写入过 `ae-tui.js` 和 `tui.json` 插件注册项。当前版本已无 `tui.ts` / `dist/src/tui.js`，更新后应清理这些历史配置。

#### 全局清理

```bash
rm -f ~/.config/opencode/plugins/ae-tui.js
rm -f ~/.config/opencode/tui-plugins/ae-tui.js
node -e "const fs=require('fs'); const file=process.argv[1]; const entry='./tui-plugins/ae-tui.js'; if(!fs.existsSync(file)) process.exit(0); const json=JSON.parse(fs.readFileSync(file,'utf8')); if(Array.isArray(json.plugin)){json.plugin=json.plugin.filter((x)=>x!==entry); fs.writeFileSync(file, JSON.stringify(json,null,2)+'\\n')}" "$HOME/.config/opencode/tui.json"
```

#### 项目级清理

```bash
rm -f .opencode/plugins/ae-tui.js
rm -f .opencode/tui-plugins/ae-tui.js
node -e "const fs=require('fs'); const file=process.argv[1]; const entry='./tui-plugins/ae-tui.js'; if(!fs.existsSync(file)) process.exit(0); const json=JSON.parse(fs.readFileSync(file,'utf8')); if(Array.isArray(json.plugin)){json.plugin=json.plugin.filter((x)=>x!==entry); fs.writeFileSync(file, JSON.stringify(json,null,2)+'\\n')}" .opencode/tui.json
```

### 手动更新

#### 全局更新

执行以下 Git 命令前，必须确认目标目录是 AE 插件安装仓库，并取得用户对 `git reset --hard HEAD`、`git clean -fd --exclude=node_modules`、`git pull` 的明确授权；这些命令会丢弃该安装仓库中的本地未提交修改和未追踪文件。

```bash
cd ~/.config/opencode/ai-agent-engine
git reset --hard HEAD
git clean -fd --exclude=node_modules
git pull
npm install
npm run build
rm -f ~/.config/opencode/plugins/ae-tui.js
rm -f ~/.config/opencode/tui-plugins/ae-tui.js
node -e "const fs=require('fs'); const file=process.argv[1]; const entry='./tui-plugins/ae-tui.js'; if(!fs.existsSync(file)) process.exit(0); const json=JSON.parse(fs.readFileSync(file,'utf8')); if(Array.isArray(json.plugin)){json.plugin=json.plugin.filter((x)=>x!==entry); fs.writeFileSync(file, JSON.stringify(json,null,2)+'\\n')}" "$HOME/.config/opencode/tui.json"
```

#### 项目级更新

执行以下 Git 命令前，必须确认目标目录是当前项目的 AE 插件安装仓库，并取得用户对 `git reset --hard HEAD`、`git clean -fd --exclude=node_modules`、`git pull` 的明确授权；这些命令会丢弃该安装仓库中的本地未提交修改和未追踪文件。

```bash
cd .opencode/ai-agent-engine
git reset --hard HEAD
git clean -fd --exclude=node_modules
git pull
npm install
npm run build
rm -f .opencode/plugins/ae-tui.js
rm -f .opencode/tui-plugins/ae-tui.js
node -e "const fs=require('fs'); const file=process.argv[1]; const entry='./tui-plugins/ae-tui.js'; if(!fs.existsSync(file)) process.exit(0); const json=JSON.parse(fs.readFileSync(file,'utf8')); if(Array.isArray(json.plugin)){json.plugin=json.plugin.filter((x)=>x!==entry); fs.writeFileSync(file, JSON.stringify(json,null,2)+'\\n')}" .opencode/tui.json
```

---

## 三、卸载

### 3.1 卸载全局安装

1. 删除全局插件目录中的桥接文件，并清理旧版 TUI 注册项：

```bash
rm -f ~/.config/opencode/plugins/ae-server.js
rm -f ~/.config/opencode/plugins/ae-tui.js
rm -f ~/.config/opencode/tui-plugins/ae-tui.js
node -e "const fs=require('fs'); const file=process.argv[1]; const entry='./tui-plugins/ae-tui.js'; if(!fs.existsSync(file)) process.exit(0); const json=JSON.parse(fs.readFileSync(file,'utf8')); if(Array.isArray(json.plugin)){json.plugin=json.plugin.filter((x)=>x!==entry); fs.writeFileSync(file, JSON.stringify(json,null,2)+'\\n')}" "$HOME/.config/opencode/tui.json"
```

2. 删除克隆的仓库目录：

```bash
rm -rf ~/.config/opencode/ai-agent-engine
```

3. 重启 opencode。

4. 确认卸载完成：
- `/ae-help` 等命令不再可用

### 3.2 卸载项目级安装

1. 删除项目插件目录中的桥接文件，并清理旧版 TUI 注册项：

```bash
rm -f .opencode/plugins/ae-server.js
rm -f .opencode/plugins/ae-tui.js
rm -f .opencode/tui-plugins/ae-tui.js
node -e "const fs=require('fs'); const file=process.argv[1]; const entry='./tui-plugins/ae-tui.js'; if(!fs.existsSync(file)) process.exit(0); const json=JSON.parse(fs.readFileSync(file,'utf8')); if(Array.isArray(json.plugin)){json.plugin=json.plugin.filter((x)=>x!==entry); fs.writeFileSync(file, JSON.stringify(json,null,2)+'\\n')}" .opencode/tui.json
```

2. 删除克隆的仓库目录：

```bash
rm -rf .opencode/ai-agent-engine
```

3. 重启 opencode。

> 卸载过程不会影响用户的 `opencode.json` 配置（安装时未修改该文件的 `plugin` 字段）。

---

## 注意事项

- 不要为非 opencode 运行时写安装配置
- 本地 server 插件使用 `opencode.json` 或 `plugins/` 自动加载；当前版本不再注册 TUI 插件，历史 `ae-tui.js` 和 `tui.json` 注册项需要清理
- 兼容性警告不能省略；只要检测到 `oh-my-openagent`、`oh-my-opencode` 或 `superpowers`，就要先在对话里提醒用户
- 项目级安装和全局安装可以共存，项目级优先加载
- Windows 环境下 `~` 对应 `%USERPROFILE%`，`~/.config/opencode/` 实际路径为 `%USERPROFILE%\.config\opencode\`
