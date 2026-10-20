# AI Agent Engine (AE Skills)

- 本仓库是 **Agent Skills 合集**。面向使用者的可分发能力**只以 `skills/` 下定义为真源**。
- 本文件只约束开发当前仓库的会话，不会作为技能用户侧资产打包。
- 详细开发规范见 `docs/development.md`，技能编写规范见 `docs/skill-authoring.md`。
- `tools/`、`docs/`、`ae/` 等内容属于仓库内部开发、调试或运行产物，不是技能用户侧能力真源。

## 硬性约束

- 技能必须**宿主无关**：不得出现任何宿主专属语法、插件、工具名、配置键或路径。
  完整禁止清单与替代写法见 `docs/development.md` §2。
- 分发方式是纯 `npx skills`：技能必须位于 `skills/<name>/SKILL.md`，且目录名 == frontmatter `name`。
- 每个技能**高内聚、低耦合**：可被单独拷走独立使用，不依赖其他技能。
- **技能之间禁止交叉引用**：技能内不得出现其它技能的名称，也不得残留已删除技能的悬空名。
  该约束由 `npm run validate` 自动校验（跨技能引用检查），违反直接报错。
- 改动后必须 `npm run check`（同步检查 + 规范校验 + 单元测试）全绿。

## 当前技能集合

| 分组 | 技能 |
|---|---|
| 需求 | `ae-grill` |
| 开发与修复 | `ae-frontend` `ae-backend` |
| 测试 | `ae-unit-test` `ae-integration-test` `ae-e2e-test` `ae-e2e-suite` |
| 文档与运维 | `ae-pptx` `ae-linux-remote-ops` |

新增或删除技能时，必须同步更新：`tools/validate.mjs` 的 `AE_DIR_OWNER`、
`tools/shared-map.json`、`.claude-plugin/plugin.json`、`README.md`、本文件。
