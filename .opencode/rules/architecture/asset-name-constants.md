# AE 资产名称常量化

> 本文件由 `/ae-save-rules` 命令生成，最后更新：2026-04-23

## AE 资产名称常量化

所有 AE 插件的资产名称（技能名、命令名、代理名、工具名）必须在 `src/schemas/ae-asset-schema.ts` 中定义为 `as const` 对象常量，其他文件通过常量引用，禁止硬编码字符串字面量。

### 常量定义

| 常量 | 格式 | 数量 | 示例 |
|------|------|------|------|
| `SKILL` | `ae:xxx` | 17 | `SKILL.BRAINSTORM` → `'ae:brainstorm'` |
| `COMMAND` | `ae-xxx` | 17 | `COMMAND.BRAINSTORM` → `'ae-brainstorm'` |
| `AGENT` | `xxx-reviewer` 等 | 28 | `AGENT.CORRECTNESS_REVIEWER` → `'correctness-reviewer'` |
| `TOOL` | `ae-xxx` | 3 | `TOOL.AE_RECOVERY` → `'ae-recovery'` |

### 引用规则

- 服务层、工具层引用名称时必须通过常量（如 `SKILL.BRAINSTORM`），不得使用字符串字面量（如 `'ae:brainstorm'`）
- Zod Schema 的 `.enum()` 参数直接引用常量值，保持枚举顺序与常量定义一致
- 多行描述文本（如工具 description）中的技能名属于自然语言，豁免常量引用要求

### 新增资产时

新增技能、命令、代理或工具时，必须先在对应常量对象中添加条目，再在目录/注册文件中引用。禁止绕过常量直接使用字符串。
