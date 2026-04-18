# Installing AI Agent Engine for OpenCode

本项目**只支持 opencode**。

如果你已经把这份文档交给 AI 代理，请按以下步骤执行：

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

4. 在用户级或项目级 `opencode.json` 中加入：

```json
{
  "plugin": [
    "~/.config/opencode/ai-agent-engine/.opencode/plugins/ae-server.js",
    "~/.config/opencode/ai-agent-engine/.opencode/plugins/ae-tui.js"
  ]
}
```

如果用户选择了不同安装目录，请同步替换这两个路径。

5. 重启 opencode。

6. 验证方式：
- 在会话中尝试 `/ae-lfg`
- 或尝试让代理列出 `ae:*` 技能

注意：
- 不要为非 opencode 运行时写安装配置
- 修改 `opencode.json` 时避免覆盖用户已有的 `plugin` 数组，只做增量添加
- 兼容性警告不能省略；只要检测到 `oh-my-openagent`、`oh-my-opencode` 或 `superpowers`，就要先在对话里提醒用户
