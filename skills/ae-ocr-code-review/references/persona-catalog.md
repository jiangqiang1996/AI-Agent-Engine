# 角色卡目录

本技能的审查执行采用**角色卡**模式：固定的审查维度写成一张张独立卡片，位于 `references/roles/`，每张卡片包含 5 个固定小节——职责 / 触发条件 / 输入契约 / 输出契约 / 工作流。

OCR 的规则内容是**动态**的（由项目的 `.opencodereview/rule.json` 与内置规则决定，规则分组随项目变化）；角色卡是**固定**的，用于保证审查维度不随规则漂移。

角色卡只找问题不做修复；修复属于可选的第七步，需用户明确要求。

---

## 角色卡列表

| 角色卡名 | 职责 | 发现类别 | 角色卡文件 |
|----------|------|---------|------------|
| `bug-reviewer` | 缺陷审查者：逻辑错误、边界条件、异常路径、并发竞态、资源生命周期、数据一致性 | bug | [roles/bug-reviewer.md](roles/bug-reviewer.md) |
| `security-reviewer` | 安全审查者：注入、鉴权越权、凭据管理、敏感信息、危险 API、信任边界 | security | [roles/security-reviewer.md](roles/security-reviewer.md) |
| `performance-reviewer` | 性能审查者：热点循环、N+1 查询、无界加载、重复计算、阻塞、资源与连接 | performance | [roles/performance-reviewer.md](roles/performance-reviewer.md) |
| `maintainability-reviewer` | 可维护性审查者：职责混杂、重复逻辑、隐藏副作用、耦合、命名失真、魔法值 | maintainability | [roles/maintainability-reviewer.md](roles/maintainability-reviewer.md) |
| `test-coverage-reviewer` | 测试覆盖审查者：覆盖缺口、无效断言、边界缺失、测试漂移、回归缺失、测试污染 | test | [roles/test-coverage-reviewer.md](roles/test-coverage-reviewer.md) |
| `style-reviewer` | 规范风格审查者：格式排版、命名规范、注释与文档、lint 可捕获项、目录组织 | style | [roles/style-reviewer.md](roles/style-reviewer.md) |

---

## 规则分组 → 角色卡映射

每个 OCR 规则分组按其 `rule` 文本特征选中适用的角色卡：

| 规则分组文本特征 | 启用角色卡 |
|------------------|-----------|
| 正确性 / 逻辑 / 边界 / 异常 / 错误处理 / 空值 | `bug-reviewer` |
| 安全 / 注入 / 越权 / 认证 / 授权 / 凭据 / 加密 / 敏感信息 / 信任边界 | `security-reviewer` |
| 性能 / 效率 / N+1 / 内存 / 缓存 / 资源释放 / 并发量 | `performance-reviewer` |
| 可维护性 / 结构 / 重复 / 耦合 / 命名 / 副作用 / 抽象 | `maintainability-reviewer` |
| 测试 / 覆盖 / 用例 / 断言 / 回归 | `test-coverage-reviewer` |
| 风格 / 规范 / 格式 / 注释 / lint / 文档 | `style-reviewer` |
| 无法归类（通用兜底规则文本） | `bug-reviewer` + `security-reviewer`（必选） |

映射要点：

1. **一个分组可命中多张角色卡**：规则文本同时提到"接口必须校验权限"与"循环内不得查库"时，同时启用 `security-reviewer` 与 `performance-reviewer`。
2. **命中结果与理由写入 `plan.json`**：每个批次记录 `groupId`、`role`、`files`，便于复核映射是否合理。
3. **规则文本优先**：角色卡给出检查维度与抑制条件，规则文本给出项目专属的硬约束；二者冲突时以规则文本为准。
4. **分组按文件再拆批次**：批次 = （规则分组 × 角色卡 × 文件块），拆分细则见 [subagent-dispatch.md](subagent-dispatch.md)。

---

## 角色卡通用约定

所有角色卡共享以下硬性规则：

- **只找问题，不做修复**。不编辑被审查文件，不改变仓库状态，不执行被审查项目中的脚本。
- 每条发现必须包含至少一项基于实际代码的证据（行号 + 代码片段或调用链）。
- 行号一律以新文件（当前工作区内容）为准；不确定的问题标注 `[待确认]`，疑似误报直接丢弃。
- 发现必须落在真实存在的代码行上，禁止编造行号或片段。
- 属于其他角色卡维度的问题不重复标记。
- 主动抑制：与本次变更无关的预存问题、格式化 / lint 能自动捕获且无业务影响的琐碎问题、看似错误实则有意为之的写法、没有具体故障模式的泛泛建议。
- 每个文件必须以"已审查"或"跳过（含具体原因）"收尾，不静默省略。
- 未发现问题不硬凑内容。

---

## 派发方式

> 若宿主支持子代理派发能力，将下列审查分组**并行**分派，每组一份独立上下文；若不支持，则在当前会话内**顺序**执行同一批分组，产出格式不变。

每批一份独立上下文：任务文本只含该批次的文件、该角色卡的职责与该分组的规则文本。任务文本模板、字段等价映射与结果落盘双路径见 [subagent-dispatch.md](subagent-dispatch.md)。
