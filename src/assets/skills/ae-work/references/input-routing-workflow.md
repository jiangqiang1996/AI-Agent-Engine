# 输入分流工作流

本文件定义 `ae:work` 阶段 0。执行前必须先读取 `SKILL.md` 中的硬性门禁。

## 输入类型

### worktree 交接输入

输入为 `ae/handoffs/*-worktree-handoff.md`，或绝对/相对路径指向规范 worktree 交接文件时，进入 B worktree 继续执行路径。

交接文件是 B worktree 继续执行路径的唯一必需输入。B 端容错：只读取交接文件，以及交接文件明确引用且在当前 B worktree 中真实存在的需求/设计产物、图谱目录和 AE 项目配置作为可选上下文；存在性判断必须使用文件系统视角，不得依赖 `git status`、`git ls-files` 或其他会受 `.gitignore` 影响的 Git 视角；不得因为这些产物缺失而把继续执行判定为失败（A 端有义务迁移真实存在的产物，B 端缺失时降级为可选上下文；design_path 和 task_brief 均缺失时硬阻断）。必须以 frontmatter、`## A→B Startup Proof`、`resume_entrypoint`、`## Migrated Artifacts` 和 `## Execution Baseline` 作为结构化真源。

不重新审查、深化或转换需求或设计，不触发 `ae:brainstorm`、`ae:design` 或 `ae:review domain=document`。

除非交接文件缺失、可观察的当前目录或 `git rev-parse --show-toplevel` 输出与目标 B worktree 不一致，交接文件 `design_path` 指向的设计文件在 B worktree 中不存在且无 `task_brief`，或用户明确要求重新审查，否则直接进入任务分析和阶段 2 执行。若交接文件引用的需求、设计路径、图谱目录或 AE 项目配置在 B 中不存在，只记录 `optional_context_missing`，不得回到 A worktree 查找或补迁移。

交接文件 `design_path` 指向的设计文件在 B worktree 中不存在时：若有 `task_brief`，则按 task_brief 内容继续执行，不阻断。若无 `task_brief`，**停止执行，提示用户确认 design_path 是否正确或是否需要回到 A 会话重新生成迁移设计文件。禁止搜索替代设计、扫描 `ae/designs/` 目录寻找其他设计文件或尝试从上游产物重建设计。**`/ae-work-continue` 只是查找交接文件后调用 `ae:work <交接文件>` 的便捷包装，不维护独立继续执行流程。

交接文件未引用 `design_path` 且未引用 `task_brief`（如旧格式交接文件缺少这两个字段）：**停止执行，提示用户该交接文件格式不符合当前规范，需要回到 A 会话重新生成交接文件。禁止跳过 design_path 和 task_brief 均缺失继续执行或尝试从会话历史推断设计路径。**

### 设计文档

输入为路径时，视为设计文档。进入阶段 1，并先分析设计中的工作单元、依赖关系、文件范围和验证要求，识别可并行执行的单元。

### 裸提示词

输入为工作描述时，先只读定位：识别可能变更的文件、查找测试文件、记录本地模式。此阶段只允许读取和搜索，不允许先改文件。

裸提示词不默认调用重型扫描工具；先用只读定位结果列出最小任务、预估影响文件数、验证命令和是否存在共享文件。只有当文件范围无法判断、任务边界明显跨模块，或需要并行安全矩阵时，才升级到任务分析工具。

任务大小路由：

| 任务大小 | 信号 | 操作 |
|----------|------|------|
| 小任务 | 明确 bug、单点故障、范围可控、预估影响文件不超过 2 个 | 记录定位证据、升级判断和无需设计原因后进入阶段 1；询问 worktree 时推荐当前工作区执行 |
| 大任务 | 需要多个步骤协作、跨模块、架构决策、需求模糊，或预估影响 3 个及以上文件 | 构建任务列表，标注依赖、文件范围和验证要求后进入阶段 1；询问 worktree 时推荐创建新 worktree 执行 |

出现以下任一信号时，不再继续轻路径，转入设计流程：

- 无法稳定列出影响文件范围
- 涉及认证、授权、数据迁移、外部 API 或 API 契约
- 引入新抽象或修改公共配置
- 需要新增流程或用户可见行为决策
- 需求在定位后仍不清晰，无法给出稳定验收标准

### 上游编排器委派

以下输入必须归一化为上游编排器委派，并固定当前工作区执行：

- `ae:task-loop ae:work`
- `/ae-task-loop ae:work`

来源为 `ae:task-loop` 时，`worktree_policy` 必须为 `current-worktree`，`interaction_policy` 必须禁止 worktree 询问，后续不得创建 worktree，不得把未传值补齐为 `auto`。

## 输出契约

阶段 0 必须输出 `work_intent`：

```json
{
  "origin": "standalone|ae:task-loop|worktree-handoff",
  "input_type": "design_path|prompt|worktree_handoff|delegated_skill",
  "delegated_skill": "ae:work|null",
  "worktree_policy": "ask|current-worktree|worktree|auto|handoff-created",
  "interaction_policy": "interactive|non_interactive_current_worktree|handoff_resume",
  "routing_decision": "design|light_prompt|upgrade_to_design|resume_handoff",
  "task_size": "small|large|unknown",
  "routing_evidence": ["只读定位或上游委派证据"]
}
```

若无法确定输入类型，停止并询问最小澄清问题，不得开始修改文件。
