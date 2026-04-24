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

3. 在全局插件目录 `~/.config/opencode/plugins/` 下创建两个桥接文件，指向克隆仓库的构建产物：

```bash
# ae-server.js
echo "export { default } from '../ai-agent-engine/dist/src/index.js'" > ~/.config/opencode/plugins/ae-server.js

# ae-tui.js
echo "export { default } from '../ai-agent-engine/dist/src/tui.js'" > ~/.config/opencode/plugins/ae-tui.js
```

> **为什么这样做？** opencode 的 `opencode.json` 中 `plugin` 字段仅用于 npm 包名，不支持本地文件路径。本地插件应放入全局插件目录 `~/.config/opencode/plugins/`（或项目级 `.opencode/plugins/`），opencode 会自动加载该目录下的 `.js` / `.ts` 文件。

如果用户选择了不同安装目录，请同步调整桥接文件中的相对路径。

4. 重启 opencode。

5. 验证方式：
- 在会话中尝试 `/ae-help`
- 或尝试让代理列出 `ae:*` 技能

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

3. 在项目的 `.opencode/plugins/` 目录下创建两个桥接文件，指向克隆仓库的构建产物：

```bash
# ae-server.js
echo "export { default } from '../ai-agent-engine/dist/src/index.js'" > .opencode/plugins/ae-server.js

# ae-tui.js
echo "export { default } from '../ai-agent-engine/dist/src/tui.js'" > .opencode/plugins/ae-tui.js
```

4. 重启 opencode。

5. 验证方式：
- 在当前项目会话中尝试 `/ae-help`
- 或尝试让代理列出 `ae:*` 技能

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

构建完成后重启 opencode 即生效。

### 手动更新

#### 全局更新

```bash
cd ~/.config/opencode/ai-agent-engine
git reset --hard HEAD
git clean -fd --exclude=node_modules
git pull
npm install
npm run build
```

#### 项目级更新

```bash
cd .opencode/ai-agent-engine
git reset --hard HEAD
git clean -fd --exclude=node_modules
git pull
npm install
npm run build
```

---

## 三、卸载

### 3.1 卸载全局安装

1. 删除全局插件目录中的桥接文件：

```bash
rm ~/.config/opencode/plugins/ae-server.js
rm ~/.config/opencode/plugins/ae-tui.js
```

2. 删除克隆的仓库目录：

```bash
rm -rf ~/.config/opencode/ai-agent-engine
```

3. 重启 opencode。

4. 确认卸载完成：
- 代理不再列出 `ae:*` 技能
- `/ae-help` 等命令不再可用

### 3.2 卸载项目级安装

1. 删除项目插件目录中的桥接文件：

```bash
rm .opencode/plugins/ae-server.js
rm .opencode/plugins/ae-tui.js
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
- **不要**在 `opencode.json` 的 `plugin` 字段中填写本地文件路径，该字段仅接受 npm 包名
- 兼容性警告不能省略；只要检测到 `oh-my-openagent`、`oh-my-opencode` 或 `superpowers`，就要先在对话里提醒用户
- 项目级安装和全局安装可以共存，项目级优先加载
- Windows 环境下 `~` 对应 `%USERPROFILE%`，`~/.config/opencode/` 实际路径为 `%USERPROFILE%\.config\opencode\`
