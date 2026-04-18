# AI Agent Engine for OpenCode — 安装 / 更新 / 卸载

本项目**只支持 opencode**。

如果你已经把这份文档交给 AI 代理，请根据用户意图执行对应章节的步骤。

---

## 一、安装

1. 先检查本地是否已安装以下 opencode 插件：
- `oh-my-openagent`
- `oh-my-opencode`
- `superpowers`

检查范围至少包括：
- 当前生效的 `opencode.json`
- 用户级 opencode 配置目录下的 plugin 配置
- 本地已存在的 plugin 安装路径

如果发现任意一个已安装插件，**必须先在对话中明确警告用户**：这些插件可能与 AI Agent Engine 不兼容；告警发出后，才允许继续执行后续安装步骤。

2. 将仓库克隆到固定安装目录：

```bash
git clone https://gitee.com/jiangqiang1996/ai-agent-engine.git ~/.config/opencode/ai-agent-engine
```

3. 进入仓库根目录并安装依赖、构建产物：

```bash
cd ~/.config/opencode/ai-agent-engine
npm install
npm run build
```

4. 在全局插件目录 `~/.config/opencode/plugins/` 下创建两个桥接文件，指向克隆仓库的构建产物：

```bash
# ae-server.js
echo "export { default } from '../ai-agent-engine/dist/src/index.js'" > ~/.config/opencode/plugins/ae-server.js

# ae-tui.js
echo "export { default } from '../ai-agent-engine/dist/src/tui.js'" > ~/.config/opencode/plugins/ae-tui.js
```

> **为什么这样做？** opencode 的 `opencode.json` 中 `plugin` 字段仅用于 npm 包名，不支持本地文件路径。本地插件应放入全局插件目录 `~/.config/opencode/plugins/`（或项目级 `.opencode/plugins/`），opencode 会自动加载该目录下的 `.js` / `.ts` 文件。

如果用户选择了不同安装目录，请同步调整桥接文件中的相对路径。

5. 重启 opencode。

6. 验证方式：
- 在会话中尝试 `/ae-lfg`
- 或尝试让代理列出 `ae:*` 技能

---

## 二、更新

拉取最新代码后重新构建即可，桥接文件无需变动：

```bash
cd ~/.config/opencode/ai-agent-engine
git pull
npm install
npm run build
```

构建完成后重启 opencode 即生效。

> 如果 `package.json` 中的依赖版本未变更，`npm install` 可以省略。但依赖有变更时**必须**执行，否则运行时可能报模块找不到的错误。

---

## 三、卸载

卸载分为两步：移除桥接文件、删除克隆仓库。

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
- `/ae-lfg` 等命令不再可用

> 卸载过程不会影响用户的 `opencode.json` 配置（安装时未修改该文件的 `plugin` 字段）。

---

## 注意事项

- 不要为非 opencode 运行时写安装配置
- **不要**在 `opencode.json` 的 `plugin` 字段中填写本地文件路径，该字段仅接受 npm 包名
- 兼容性警告不能省略；只要检测到 `oh-my-openagent`、`oh-my-opencode` 或 `superpowers`，就要先在对话里提醒用户
- Windows 环境下 `~` 对应 `%USERPROFILE%`，`~/.config/opencode/` 实际路径为 `%USERPROFILE%\.config\opencode\`
