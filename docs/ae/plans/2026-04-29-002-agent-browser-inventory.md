# agent-browser 文案盘点

生成时间：2026-04-29

扫描范围：`src/assets/skills/**/*.md`、`src/assets/agents/**/*.md`、`src/assets/commands/**/*.md`、`src/tools/**/*.ts`、`src/services/**/*.ts`、`docs/ae/usage-guide.md`。

匹配词：`agent-browser`、`snapshot -i`、`screenshot`、`open <url>`、`浏览器验收`、`截图证据`、`登录检测`、`可见页面状态确认`、`使用 ae:test-browser`、`@design-iterator`、`@figma-design-sync`、手写 CLI 检查反模式。

| path | line | match | context | category | requiresSetup |
|------|------|-------|---------|----------|---------------|
| `src/assets/skills/ae-setup/SKILL.md` | 3, 11-86 | `agent-browser`, `Get-Command`, `command -v`, `npm install -g agent-browser` | setup 自身检查、安装、复检流程 | `ae:setup` 自身例外 | no |
| `src/assets/skills/ae-test-browser/SKILL.md` | 3, 9, 30-50 | `agent-browser`, `Get-Command`, `command -v` | 浏览器验收主技能与旧安装检查 | 执行性命令 | yes |
| `src/assets/skills/ae-test-browser/SKILL.md` | 109-333 | `agent-browser open`, `snapshot`, `screenshot`, `click` | 服务器探测、登录检测、页面测试、CLI 参考 | 执行性命令 | yes |
| `src/assets/skills/ae-test-browser/references/login-detection.md` | 48-64, 120-226 | `agent-browser snapshot`, `agent-browser screenshot` | 登录检测参考和集成示例 | 引用链 | yes |
| `src/assets/skills/ae-frontend-design/SKILL.md` | 149-152, 157-207 | `@design-iterator`, `@figma-design-sync`, `/ae-test-browser`, `agent-browser snapshot` | 前端设计交接与视觉验证 fallback | 引用链 | conditional |
| `src/assets/skills/ae-lfg/SKILL.md` | 105-111 | `agent-browser`, `ae:test-browser` | LFG 浏览器测试路径 | 引用链 | conditional |
| `src/assets/skills/ae-lfg/references/pipeline.md` | 18, 25 | `ae:setup`, `ae:test-browser`, `agent-browser` | 管道摘要 | 引用链 | conditional |
| `src/assets/skills/ae-figma-assets/SKILL.md` | 35-40 | `agent-browser` | 安全边界说明，仅允许页面状态确认辅助 | 安全边界 | conditional |
| `src/assets/skills/ae-prompt-optimize/SKILL.md` | 新增规则位置 | `agent-browser`, `ae:test-browser`, `/ae-test-browser`, `@design-iterator`, `@figma-design-sync` | 直接优化浏览器任务进入新会话 | 引用链 | yes |
| `src/assets/agents/workflow/design-iterator.md` | 36-81, 191-225 | `agent-browser open`, `snapshot`, `screenshot`, `command -v`, `where` | 设计迭代截图循环和旧 CLI 可用性检查 | 执行性命令 | yes |
| `src/assets/agents/workflow/figma-design-sync.md` | 20-63, 121-123 | `agent-browser snapshot`, `agent-browser open`, `screenshot` | Figma 对齐的实现截图采集 | 执行性命令 | yes |
| `src/services/ae-catalog.ts` | 78-94 | `agent-browser` | setup 与 test-browser catalog 描述、命令模板来源 | 公开说明 | yes |
| `src/tools/ae-gate.tool.ts` | 174, 192 | `浏览器验收` | 门禁参数和说明，不执行 agent-browser | 安全边界 | no |
| `docs/ae/usage-guide.md` | 63-74 | `/ae-test-browser`, `agent-browser`, `@design-iterator`, `@figma-design-sync` | 公开使用指南的浏览器验收与设计链路说明 | 公开说明 | conditional |

## 判断说明

- `ae:setup` 自身允许包含 `Get-Command agent-browser`、`command -v agent-browser` 和安装命令，因为它是统一前置入口。
- 安全边界或参数说明中仅提到浏览器验收而不引导执行 `agent-browser` 的内容不强制 setup。
- 所有可复制 `agent-browser ...` 命令区必须在本段或紧邻前文声明：当前会话未实际完成 `ae:setup` 前不得执行。
- 用户声明已安装、CLI 可用性检查成功、`command -v` / `Get-Command` / `where` 成功，都不能替代本轮 setup。
