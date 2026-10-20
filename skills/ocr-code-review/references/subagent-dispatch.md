# 子代理派发细则（第五步配套）

审查工作全部由子代理并行执行；主代理只负责拆分、派发、核对、汇总。

## 拆分策略

- 每个规则组内文件数 ≤ 5：一个子代理
- 每个规则组内文件数 > 5：按每批 5 个文件拆分，多个子代理并行
- **行数预算**（全项目模式尤其重要）：`insertions` 双口径——差异模式为新增行数，project 模式为整文件行数；单批文件总行数建议 ≤ 2000；超过 800 行的大文件单独一批；大变更按共享规则 + diff 大小分批，勿把超大 diff 塞进同一批
- **并发上限**：任何波次最多并发 6 个子代理；批次总数超过 6 时按规则组/目录分波，波与波之间串行、波内并行。**超大文件集**（待审查 > 100 个文件）：优先派发核心源码目录（如 `src/`），锁文件/配置类最后；派发前先向用户报告文件总数与分波计划
- `(path, status)` 重复出现的文件（同一 path 先删后建），两条记录都要进入任务清单，在任务正文的文件条目上用 `@<status>` 后缀区分标注（如 `src/a.ts@deleted`、`src/a.ts@added`）
- **编号约定**：组号/批号均从 1 起、零填充两位，与结果文件名 `results/gNN-bNN.md` 一致；direct 模式无规则分组时组号固定 `g00`；补派沿用下一个未用序号，已有结果文件一律保留

## 子代理任务模板

每个子代理的任务提示词按以下结构填充（`<>` 部分由主代理按实际模式替换）：

```markdown
# 目标
审查以下文件：先获取各自代码（diff 或整文件），逐一应用审查规则，输出结构化发现与每文件处置结论。

## 代码获取方式（仓库根：<repo 根路径>）
<按文件状态逐条或分类给出，示例：>
- 已跟踪文件：`git diff <merge_base>..<to> -- <path>`
- 未跟踪 / 新建文件：直接读取整个文件（diff 无输出）
<project / direct 模式：直接读取整个文件>
行号一律以新文件（当前工作区内容）为准。

## 审查规则
<该组的 rule 文本>
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
- 跳过格式化、lint、测试等与审查无关的操作

## 结果返回
- 若你具备文件写入能力：将最终输出原样写入 <run>/results/<本批次文件名，如 g01-b01.md>（只写这一个文件，不修改其他产物），并在最终回复中给出一行确认 + 各严重级别发现数
- 若你是只读代理：在最终回复中**完整返回**上述格式的结果全文，由派发方落盘
```

## 结果落盘双路径

1. **子代理自写**（有写权限时）：任务模板已内置写入指令；子代理返回后，主代理核对 `<run>/results/gNN-bNN.md` 存在且非空
2. **主代理兜底**（只读子代理、写入失败、文件缺失）：把子代理最终回复中的完整结果文本原样落盘到该路径——只读子代理走这条路径属**正常完成**，选只读/通用型子代理时以此为主路径
3. 两条路径都拿不到内容（子代理超时/崩溃且无有效回复）：按 `edge-cases.md` 的"子代理超时 / 失败"补派

## plan.json 结构与状态推进

派发前写入，每批核对后更新：

```json
{
  "run_id": "20260923-1530-workspace",
  "mode": "workspace",
  "max_concurrent_agents": 6,
  "waves": [
    {
      "wave": 1,
      "batches": [
        {
          "id": "g01-b01",
          "result_file": "results/g01-b01.md",
          "description": "审查 g01-b01（5 文件）",
          "files": [
            { "path": "src/a.ts", "status": "modified", "diff": "git diff HEAD -- src/a.ts" },
            { "path": "src/b.ts", "status": "untracked", "diff": "read-file" }
          ],
          "status": "done",
          "attempts": 1
        }
      ]
    }
  ]
}
```

状态机：`waiting` →（结果核对通过）`done`；（子代理失败/结果缺失）`failed` →（补派后）`retried`，补派批次以新条目追加（下一个未用序号）。第六步覆盖率核对以 plan.json 全部批次到达 `done`/`retried` 为完成前提。

## 派发示例与宿主适配

```js
// 收集所有子代理批次；diffCmd 按模式生成（SKILL.md 第四步表格）
const batches = []
for (const group of ruleGroups) {
  const groupNo = String(group.group_id).padStart(2, '0')
  chunk(group.files, 5).forEach((batch, i) => {
    const batchNo = String(i + 1).padStart(2, '0')
    const resultFile = `<run>/results/g${groupNo}-b${batchNo}.md`
    batches.push({
      resultFile,
      description: `审查 g${groupNo}-b${batchNo}（${batch.length} 文件）`,  // 3–5 词短描述，勿用文件路径
      prompt: buildSubAgentTask(group.rule, batch, diffCmd, resultFile),   // 即上方"子代理任务模板"全文
    })
  })
}
```

各宿主的子代理工具名称与签名不同（Task、task、dispatch 等），按字段等价映射 `batches` 项：短描述（description）→ 宿主的描述参数；任务全文（prompt）→ 宿主的提示词参数；子代理类型选只读/通用型（审查不改代码）。

- **单任务签名宿主**：对每个批次项各发一次调用，同一波最多 6 个调用，并在**同一条消息**里并行发起，最大化允许范围内的并行度
- **任务数组宿主**：整波批次项组成数组一次派发
- 超大文件集按波拆分，每波 ≤ 6 个子代理，波与波之间串行、波内并行
