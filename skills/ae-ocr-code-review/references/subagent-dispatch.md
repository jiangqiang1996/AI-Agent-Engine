# 派发细则（第五步配套）

审查工作全部由宿主派发的审查执行方完成；编排层只负责拆分、映射、派发、核对、汇总。

本文件只描述**能力**（派发、读文件、写文件、执行命令），不绑定任何宿主的接口名、参数名或目录。

---

## 拆分策略

- 每个（规则分组 × 角色卡）组合内文件数 ≤ 5：1 个批次
- 每个（规则分组 × 角色卡）组合内文件数 > 5：按每批 5 个文件拆分，多个批次并行
- **行数预算**（全项目模式尤其重要）：`insertions` 双口径——差异模式为新增行数，project 模式为整文件行数；单批文件总行数建议 ≤ 2000；超过 800 行的大文件单独一批；大变更按共享规则 + diff 大小分批，勿把超大 diff 塞进同一批
- **并发上限**：任何一波次最多并发 6 个批次；批次总数超过 6 时按规则组/目录分波，波与波之间串行、波内并行。**超大文件集**（待审查 > 100 个文件）：优先派发核心源码目录（如 `src/`），锁文件/配置类最后；派发前先向用户报告文件总数与分波计划
- `(path, status)` 重复出现的文件（同一 path 先删后建），两条记录都要进入任务清单，在任务正文的文件条目上用 `@<status>` 后缀区分标注（如 `src/a.ts@deleted`、`src/a.ts@added`）
- **编号约定**：组号/批号均从 1 起、零填充两位，与结果文件名 `results/gNN-bNN.md` 一致；direct 模式无规则分组时组号固定 `g00`；补派沿用下一个未用序号，已有结果文件一律保留

---

## 并行派发与顺序降级

> 若宿主支持子代理派发能力，将下列审查分组**并行**分派，每组一份独立上下文；若不支持，则在当前会话内**顺序**执行同一批分组，产出格式不变。

两条路径的产出格式完全一致：每批产出一份结果文件 + 每文件处置结论。

---

## 任务文本模板

每个批次的任务提示词按以下结构填充（`<>` 部分由编排层按实际模式替换）：

```markdown
# 目标
审查以下文件：先获取各自代码（diff 或整文件），逐一应用审查规则，输出结构化发现与每文件处置结论。

## 你的角色
<该批次的角色卡正文：references/roles/<role>.md 全文>

## 代码获取方式（仓库根：<repo 根路径>）
<按文件状态逐条或分类给出，示例：>
- 已跟踪文件：`git diff <merge_base>..<to> -- <path>`
- 未跟踪 / 新建文件：直接读取整个文件（diff 无输出）
<project / direct 模式：直接读取整个文件>
行号一律以新文件（当前工作区内容）为准。

## 审查规则
<该规则分组的 rule 文本>
<若 preview 附带业务背景，附上背景摘要，审查时参照>

## 待审查文件
- path/to/file1.ts（modified，git diff 获取）
- path/to/file2.ts（untracked，读整文件）
...

## 输出格式（每个文件必须有明确处置）
### `path/to/file.ts`
- ✅ 已审查：未发现问题；或 ⏭️ 跳过：<具体原因>（如无法获取 diff、文件已删除）
- 发现（有则列出）：
  - **第 N 行**（或 **第 N–M 行**） | <类别> | <严重级别> — <问题描述>
    > `<相关代码片段>`
    建议：<修复方案>
    （不确定的问题在描述后标注 `[待确认]`）

严重级别（severity）：
- 🔴 critical — 安全漏洞、数据丢失、崩溃风险（必报）
- 🟠 high — 逻辑错误、行为异常（必报）
- 🟡 medium — 性能、错误处理、可维护性（附上下文报告）
- 🔵 low — 风格、最佳实践建议（仅明确有价值时报告）

类别（category）：bug | security | performance | maintainability | test | style | documentation | other

## 约束
- 只审查列出的文件；可读整文件或相邻代码获取上下文，发现必须对应真实代码行，不要编造行号或片段；不确定标 `[待确认]`，疑似误报直接丢弃、不要写进发现列表
- 列出每个文件；勿因首个高危问题停下，逐文件审查到清单末尾
- 只读审查：不得修改、格式化、删除被审查文件；不得执行被审查项目中的脚本；跳过格式化、lint、测试等与审查无关的操作

## 结果返回
- 若你具备文件写入能力：将最终输出原样写入 <run>/results/<本批次文件名，如 g01-b01.md>（只写这一个文件，不修改其他产物），并在最终回复中给出一行确认 + 各严重级别发现数
- 若你只具备读取能力：在最终回复中**完整返回**上述格式的结果全文，由派发方落盘
```

---

## 字段等价映射

不同宿主对"派发一个审查执行方"的参数命名与签名各不相同。**技能始终使用自己的规范字段名**，只在派发那一刻按下表映射到宿主的字段：

| 技能规范字段 | 含义 | 宿主可能的字段名（示例） |
|-------------|------|--------------------------|
| `role` | 派发哪个角色卡（只读 / 通用型执行方） | `agent` / `subagent_type` / `role` / `name` |
| `title` | 派发项的短描述（3–5 词，勿用文件路径） | `description` / `summary` / `name` |
| `prompt` | 任务全文（上面模板填充后的内容） | `prompt` / `input` / `message` / `content` |
| `files` | 本批次的文件清单 | 独立数组参数，或内嵌在 `prompt` 文本中 |
| `resultFile` | 结果落盘路径 | 内嵌在 `prompt` 文本中 |
| `groupId` / `batchId` | 规则分组号 / 批次号 | 通常内嵌在 `title` 与 `prompt` 文本中 |

映射规则：

1. **技能侧字段名是唯一的真源**——`plan.json`、任务文本、结果文件名一律用规范字段名记录，宿主字段名不进入任何产物。
2. **宿主没有独立字段时用文本承载**——例如宿主只接受"一段任务描述"时，把 `role` / `files` / `resultFile` 直接写进 `prompt` 文本，语义不变。
3. **不绑定宿主接口名**——上表列出的是各宿主**字段命名**的观察样本，用于说明等价关系；技能不调用其中任何一个，也不假定任何一种宿主签名。判断标准是"换一个宿主，这段描述还成立吗"。
4. **派发形态差异不影响产出**——单任务形态对每个批次各发一次；数组形态整波一次派发；两种形态的产出格式与落盘路径完全相同。

---

## 结果落盘双路径

1. **执行方自写**（具备文件写入能力时）：任务模板已内置写入指令；执行方返回后，编排层核对 `<run>/results/gNN-bNN.md` 存在且非空
2. **编排层兜底**（只读执行方、写入失败、文件缺失）：把执行方最终回复中的完整结果文本原样落盘到该路径——只读执行方走这条路径属**正常完成**，选只读 / 通用型执行方时以此为主路径
3. 两条路径都拿不到内容（执行方超时 / 崩溃且无有效回复）：按 [edge-cases.md](edge-cases.md) 的"派发失败"补派

---

## plan.json 结构与状态推进

派发前写入 `ae/ocr-code-review/<run-id>/plan.json`，每批核对后更新：

```json
{
  "run_id": "20260923-1530-workspace",
  "mode": "workspace",
  "max_concurrent_batches": 6,
  "waves": [
    {
      "wave": 1,
      "batches": [
        {
          "id": "g01-b01",
          "group_id": "g01",
          "role": "bug-reviewer",
          "result_file": "results/g01-b01.md",
          "title": "审查 g01-b01（5 文件）",
          "files": [
            { "path": "src/a.ts", "status": "modified", "source": "git diff HEAD -- src/a.ts" },
            { "path": "src/b.ts", "status": "untracked", "source": "read-file" }
          ],
          "status": "done",
          "attempts": 1
        }
      ]
    }
  ]
}
```

字段说明：

- `group_id` / `role` — 该批次对应的规则分组与角色卡，是"规则分组 → 角色卡"映射的留痕
- `files[].source` — 该文件的代码获取方式（diff 命令 / `read-file`），与 SKILL.md 第四步的表格一致
- `result_file` — 相对 `<run-id>/` 的结果文件路径

状态机：`waiting` →（结果核对通过）`done`；（执行方失败/结果缺失）`failed` →（补派后）`retried`，补派批次以新条目追加（下一个未用序号）。第六步覆盖率核对以 plan.json 全部批次到达 `done`/`retried` 为完成前提。

---

## 派发示例与批次构造

```js
// 收集所有批次；source 按模式生成（SKILL.md 第四步表格）
const batches = []
for (const group of ruleGroups) {
  const groupNo = String(group.group_id).padStart(2, '0')
  const roles = selectRolesForGroup(group.rule)   // 规则分组 → 角色卡映射
  let batchNo = 0
  for (const role of roles) {
    for (const batch of chunk(group.files, 5)) {
      batchNo += 1
      const bNo = String(batchNo).padStart(2, '0')
      const resultFile = `results/g${groupNo}-b${bNo}.md`
      batches.push({
        groupId: `g${groupNo}`,
        role,
        id: `g${groupNo}-b${bNo}`,
        resultFile,
        title: `审查 g${groupNo}-b${bNo}（${batch.length} 文件）`,  // 3–5 词短描述，勿用文件路径
        prompt: buildReviewTask(role, group.rule, batch, source, resultFile),  // 即上方任务文本模板全文
      })
    }
  }
}
```

派发时按 `batches` 的规范字段名逐项映射到宿主的对应字段（见「字段等价映射」）。单任务形态下对每个批次项各发一次调用，同一波最多 6 个调用，并在**同一条消息**里并行发起；数组形态下整波批次项组成数组一次派发。超大文件集按波拆分，每波 ≤ 6 个批次，波与波之间串行、波内并行。
