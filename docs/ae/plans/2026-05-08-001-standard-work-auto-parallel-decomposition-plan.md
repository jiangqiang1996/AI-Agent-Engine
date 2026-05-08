---
type: plan
status: drafted
date: 2026-05-08
title: work-auto-parallel-decomposition
origin: docs/ae/brainstorms/2026-05-08-work-auto-parallel-decomposition-requirements.md
originFingerprint: 2026-05-08-work-auto-parallel-decomposition
depth: standard
---

# ae:work 自动任务分解与并行执行

## 概览

为 `ae:work` 新增自动任务分解工具 `ae-task-analyzer`，使裸提示词和计划文档两种入口都能产出结构化并行组，配合新的子代理执行模板标准化并行派发。

## 高层技术设计

```mermaid
TB
    A[ae:work 阶段 1] --> B{输入类型?}
    B -->|裸提示词| C[ae-task-analyzer: 模式=scan]
    B -->|计划文档| D[ae-task-analyzer: 模式=plan]
    C --> E[扫描代码库定位候选文件]
    E --> F[按文件/模块拆分任务单元]
    D --> G[解析计划 markdown 提取实现单元]
    F --> H[计算文件冲突矩阵]
    G --> H
    H --> I[计算并行组]
    I --> J[输出结构化 JSON]
    J --> K[ae:work 阶段 2: 按组派发]
    K --> L[同一并行组: 并发 Task 子代理]
    K --> M[串行组: 顺序执行]
    L --> N[主代理汇总 + 集成验证]
    M --> N
```

## 实现单元

- [ ] **单元 1：** 注册 `ae-task-analyzer` 工具常量
- [ ] **单元 2：** 实现 `ae-task-analyzer.tool.ts`
- [ ] **单元 3：** 创建 `work-subagent-template.md`
- [ ] **单元 4：** 修改 `ae:work` SKILL.md 集成工具和模板
- [ ] **单元 5：** 编写测试

---

### 单元 1：注册 `ae-task-analyzer` 工具常量

**目标**：在资产常量中注册新工具名。

**依赖**：无。

**文件**：
- `src/schemas/ae-asset-schema.ts`

**方法**：
在 `TOOL` 常量中新增 `AE_TASK_ANALYZER: 'ae-task-analyzer'`。按现有条目字母序插入。

**需遵循的模式**：
- 参照 `TOOL` 中已有的 `AE_RECOVERY`、`AE_REVIEW_CONTRACT` 等条目
- 使用 `as const` 保持类型推断

**测试场景**：
- 正常路径：`TOOL.AE_TASK_ANALYZER` 值为 `'ae-task-analyzer'`
- 集成：`createToolRegistry()` 中包含该工具键

**验证**：`npm run typecheck`

---

### 单元 2：实现 `ae-task-analyzer.tool.ts`

**目标**：创建核心工具，实现文件扫描、任务拆分、冲突检测和并行组计算。

**依赖**：单元 1。

**文件**：
- `src/tools/ae-task-analyzer.tool.ts`（新建）
- `src/tools/index.ts`（修改：import 并注册新工具）

**方法**：

#### 参数 Schema

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `mode` | `enum ['scan', 'plan']` | 是 | `scan` = 裸提示词扫描模式；`plan` = 计划文档解析模式 |
| `task_description` | `string` | mode=scan 时必填 | 用户的任务描述文本 |
| `plan_path` | `string` | mode=plan 时必填 | 计划文档的仓库相对路径 |
| `worktree` | `string` | 否 | 工作区根目录，默认 `process.cwd()` |

#### 输出 JSON 结构

```typescript
interface TaskAnalyzerOutput {
  units: TaskUnit[]
  conflict_matrix: ConflictEntry[]
  parallel_groups: ParallelGroup[]
  execution_order: string[]  // group ID 的执行顺序
  warnings: string[]
}

interface TaskUnit {
  id: string                    // "U1", "U2", ...
  description: string
  files: FileEntry[]
  suggested_validation: string[]
  priority: number              // 执行优先级
}

interface FileEntry {
  path: string                  // 仓库相对路径
  source: 'tool_scan' | 'llm_suggestion'
}

interface ConflictEntry {
  unit_a: string
  unit_b: string
  shared_files: string[]
}

interface ParallelGroup {
  id: string                    // "G1", "G2", ...
  unit_ids: string[]
  is_parallel_safe: boolean
  blocker_reason?: string       // 不安全时的原因
}
```

#### 核心逻辑

**mode=scan 流程**：
1. 接收 `task_description`
2. 从描述中提取关键词（文件名、目录名、模块名、函数名）
3. 用 `readdir` 递归扫描 `worktree`，收集所有源码文件（排除 `node_modules`、`.git`、`dist`、`.opencode`）
4. 按文件名和路径关键词匹配候选文件（确定性匹配）
5. 可选：对候选文件执行内容 grep（搜索函数名、类名等）以细化文件范围
6. 如果无法自动识别候选文件，返回 `warnings: ["无法自动识别变更文件，建议使用 mode=plan 或手动指定"]`，但仍输出扫描到的文件分组
6. 按目录/模块边界将文件分组为任务单元
7. 计算冲突矩阵（文件交集）
8. 计算并行组（无冲突的单元归入同组）

**mode=plan 流程**：
1. 读取计划文档
2. 解析 markdown 中的实现单元（`- [ ] **单元 N：**` 格式）
3. 提取每个单元的文件列表、依赖关系
4. 根据文件交集计算冲突矩阵
5. 根据依赖和冲突计算并行组

**文件分组算法**（mode=scan）：
1. 收集所有匹配的文件路径
2. 按第一级目录分组（如 `src/tools/`、`src/services/`）
3. 如果同目录下文件超过 3 个，按子目录或文件名前缀进一步拆分
4. 每组成为一个任务单元

**冲突检测算法**：
1. 对每对任务单元，计算文件列表的交集
2. 交集非空 → 记录冲突
3. 有冲突的单元不能在同一并行组

**并行组计算算法**：
1. 构建无向图：单元为节点，冲突为边
2. 图着色算法：同一颜色的节点无冲突，可并行
3. 每个颜色对应一个并行组
4. 依赖关系：被依赖的组排在前面

**需遵循的模式**：
- 工具定义：`import { tool, type ToolDefinition } from '@opencode-ai/plugin/tool'`
- Schema：使用 `tool.schema.*`
- 错误处理：`Effect.try` + `Effect.catch`
- 文件扫描：`import { readdir, readFile } from 'node:fs/promises'` + `readdir` 递归（参照 `collectRuleFiles`）
- 路径处理：`import { join, relative } from 'node:path'` + `toPosixPath`
- 导出：`export const aeTaskAnalyzerTool: ToolDefinition`
- 注册：在 `src/tools/index.ts` 中 import `aeTaskAnalyzerTool` 并添加 `[TOOL.AE_TASK_ANALYZER]: aeTaskAnalyzerTool` 到 `createToolRegistry()` 返回对象

**测试场景**：
- 正常路径 scan：输入描述 "修改审查契约工具和审查选择器" → 输出包含 2+ 任务单元
- 正常路径 plan：输入计划文档路径 → 输出从计划提取的单元和并行组
- 边界情况：空描述 → 返回警告
- 边界情况：单文件任务 → 输出 1 个单元，1 个并行组
- 错误路径：plan_path 文件不存在 → 返回错误提示
- 集成：工具注册后可通过 `createToolRegistry()` 访问

**验证**：
- `npm run typecheck`
- `npx vitest run tests/tools/ae-task-analyzer.tool.test.ts`

---

### 单元 3：创建 `work-subagent-template.md`

**目标**：标准化并行执行子代理的提示词结构。

**依赖**：无。

**文件**：
- `src/assets/skills/ae-work/references/work-subagent-template.md`（新建）

**方法**：

创建模板文件，包含以下结构：

```markdown
# 工作执行子代理模板

编排器使用此模板派发并行执行子代理。变量替换槽在派发时填充。

---

## 模板

```
你是一个工作执行子代理。

<execution-context>
任务 ID：{task_id}
任务描述：{task_description}
并行组：{parallel_group}
</execution-context>

<file-constraints>
允许修改的文件：
{allowed_files}

禁止修改的文件类型：
{forbidden_files}

禁止运行的命令：
{forbidden_commands}
</file-constraints>

<validation>
完成后运行以下验证命令：
{validation_commands}

如果验证失败，报告失败原因，不要自行重试。
</validation>

<conflict-reporting>
{conflict_reporting}
</conflict-reporting>

<rules>
- 你只处理分配给你的文件和任务
- 不得暂存（git add）或提交（git commit）
- 不得运行全量测试套件
- 不得修改共享配置、锁文件、迁移文件
- 不得启动服务、浏览器测试、E2E、集成测试
- 不得占用端口、数据库、缓存、固定临时目录
- 遇到跨任务依赖时停止并报告
- 完成后返回结构化结果
</rules>

<output-contract>
返回以下 JSON：
{
  "task_id": "{task_id}",
  "status": "completed" | "failed" | "partial",
  "files_modified": ["修改的文件列表"],
  "validation_results": ["验证命令及其结果"],
  "conflicts_found": ["发现的冲突或越权"],
  "notes": "补充说明"
}
</output-contract>
```

## 变量参考

| 变量 | 来源 |
|------|------|
| `{task_id}` | ae-task-analyzer 输出的单元 ID |
| `{task_description}` | 任务单元描述 |
| `{parallel_group}` | 并行组 ID |
| `{allowed_files}` | 任务单元的文件列表 |
| `{forbidden_files}` | 全局禁止修改的文件类型 |
| `{forbidden_commands}` | 全局禁止运行的命令 |
| `{validation_commands}` | 建议的验证命令 |
| `{conflict_reporting}` | 冲突上报的详细指令（包含允许的额外文件、共享资源上报要求等） |
```

**需遵循的模式**：
- 参照 `ae-review/references/subagent-template.md` 的 XML 块结构
- 变量使用 `{variable_name}` 格式
- 输出契约定义 JSON 结构

**测试场景**：
- 文本契约：`tests/assets/ae-work-subagent-template-text.test.ts` 验证模板包含必需变量槽和约束文本

**验证**：`npx vitest run tests/assets/ae-work-subagent-template-text.test.ts`

---

### 单元 4：修改 `ae:work` SKILL.md 集成工具和模板

**目标**：让 `ae:work` 在阶段 1 调用 `ae-task-analyzer`，在阶段 2 使用模板并行派发。

**依赖**：单元 2、单元 3。

**文件**：
- `src/assets/skills/ae-work/SKILL.md`

**方法**：

#### 阶段 1 修改（快速启动）

在现有步骤 3（创建待办列表）之前插入新步骤：

```markdown
2.5 **分析任务结构**
   - 调用 `ae-task-analyzer` 工具：
     - 计划文档输入 → `mode:plan`，传入计划路径
     - 裸提示词输入 → `mode:scan`，传入任务描述
   - 工具输出结构化任务列表、文件冲突矩阵和并行组
   - 如果工具返回警告（如无法识别文件），降级为手动任务拆分
```

修改步骤 4（选择执行策略）的策略表，增加引用工具输出的规则：

```markdown
| 策略 | 适用场景 |
|------|----------|
| **内联** | 1-2 个小任务，或 ae-task-analyzer 输出仅 1 个并行组 |
| **串行子代理** | 3+ 有依赖的任务，或 ae-task-analyzer 输出的并行组全部 is_parallel_safe=false |
| **并行子代理** | 3+ 通过安全检查的任务，ae-task-analyzer 输出至少 2 个 is_parallel_safe=true 的并行组 |
```

#### 阶段 2 修改（执行）

替换现有并行执行指令，增加模板引用：

```markdown
1. **任务执行循环或并行执行**

   按 ae-task-analyzer 输出的并行组执行：
   - 读取 `references/work-subagent-template.md` 构建每个子代理的提示
   - 同一并行组的任务在同一轮消息中并发派发（使用 Task 工具）
   - 串行组按执行顺序依次处理
   - 每个子代理的提示词必须包含：任务 ID、允许文件、禁止文件、禁止命令、验证命令、冲突上报要求
   - 所有执行都必须遵循 Execution note 指引

   **并行汇总职责** — 并行子代理完成后，主代理必须：
   1. 收集所有子代理返回的 JSON 结果
   2. 检查 conflicts_found 字段，处理越权文件修改
   3. 检查 files_modified 字段，确保无跨任务文件冲突
   4. 修复集成问题
   5. 运行统一验证命令
   6. 更新最终任务状态
   7. 在阶段 3-4 执行 ae-gate

   **部分失败处理** — 并行组内任一子代理失败时：
   - 已完成的子代理结果保留
   - 失败的任务标记为需要串行重试
   - 在下一轮中单独执行失败任务
   - 如果重试仍失败，报告失败原因并询问用户
```

**需遵循的模式**：
- 保持现有 SKILL.md 的 markdown 格式和中文风格
- 保持现有章节编号体系
- 新增内容与现有内容保持一致的详细程度

**测试场景**：
- 文本契约：`tests/assets/ae-work-worktree-text.test.ts` 验证 SKILL.md 包含对 `ae-task-analyzer` 的引用和模板引用

**验证**：`npx vitest run tests/assets/ae-work-worktree-text.test.ts`

---

### 单元 5：编写测试

**目标**：为工具和模板编写测试。

**依赖**：单元 1-4。

**文件**：
- `tests/tools/ae-task-analyzer.tool.test.ts`（新建）
- `tests/assets/ae-work-subagent-template-text.test.ts`（新建）

**方法**：

#### 工具测试 (`ae-task-analyzer.tool.test.ts`)

```typescript
// 测试模式：
// 1. 模拟文件系统（使用临时目录）
// 2. 调用工具的 execute 函数
// 3. 解析 JSON 输出并断言

describe('ae-task-analyzer 工具', () => {
  describe('mode=scan', () => {
    it('应该从任务描述中识别候选文件并输出任务单元')
    it('应该在单文件任务时输出 1 个单元和 1 个并行组')
    it('应该在无法识别文件时返回警告')
    it('应该为每个文件标注来源为 tool_scan')
  })

  describe('mode=plan', () => {
    it('应该从计划文档中提取实现单元')
    it('应该根据文件交集计算冲突矩阵')
    it('应该根据冲突和依赖计算并行组')
    it('应该在计划文件不存在时返回错误')
  })

  describe('冲突检测', () => {
    it('应该检测共享文件的任务单元对')
    it('应该将无冲突的单元归入同一并行组')
    it('应该将有冲突的单元分到不同组')
  })

  describe('并行组计算', () => {
    it('应该为无依赖无冲突的任务生成 1 个并行组')
    it('应该为有依赖的任务生成有序的串行组')
    it('应该为混合场景生成正确的组序列')
  })
})
```

#### 模板文本测试 (`ae-work-subagent-template-text.test.ts`)

```typescript
const templateText = readFileSync('src/assets/skills/ae-work/references/work-subagent-template.md', 'utf8')

describe('work-subagent-template 文本契约', () => {
  it('应该包含所有必需的变量槽', () => {
    expect(templateText).toContain('{task_id}')
    expect(templateText).toContain('{task_description}')
    expect(templateText).toContain('{parallel_group}')
    expect(templateText).toContain('{allowed_files}')
    expect(templateText).toContain('{forbidden_files}')
    expect(templateText).toContain('{forbidden_commands}')
    expect(templateText).toContain('{validation_commands}')
    expect(templateText).toContain('{conflict_reporting}')
  })

  it('应该包含完整的约束声明', () => {
    expect(templateText).toContain('不得暂存')
    expect(templateText).toContain('不得提交')
    expect(templateText).toContain('不得运行全量测试套件')
    expect(templateText).toContain('不得修改共享配置')
    expect(templateText).toContain('遇到跨任务依赖时停止并报告')
  })

  it('应该包含输出契约 JSON 结构', () => {
    expect(templateText).toContain('"task_id"')
    expect(templateText).toContain('"status"')
    expect(templateText).toContain('"files_modified"')
    expect(templateText).toContain('"conflicts_found"')
  })
})
```

**需遵循的模式**：
- 参照 `tests/tools/ae-review-contract.tool.test.ts` 的工具测试模式
- 参照 `tests/assets/ae-task-loop-text.test.ts` 的文本契约测试模式
- 使用 `describe` / `it` 分组，中文描述

**验证**：
- `npx vitest run tests/tools/ae-task-analyzer.tool.test.ts`
- `npx vitest run tests/assets/ae-work-subagent-template-text.test.ts`

---

## Execution note

### 单元依赖关系

```
单元 1 (常量) ──→ 单元 2 (工具)
单元 3 (模板) ──→ 单元 4 (SKILL.md)
单元 2, 3, 4 ──→ 单元 5 (测试)
```

### 并行执行拓扑

| 并行组 | 单元 | 说明 |
|--------|------|------|
| G1 | 单元 1, 单元 3 | 无依赖，可并行 |
| G2 | 单元 2, 单元 4 | 分别依赖 G1，可并行 |
| G3 | 单元 5 | 依赖 G2 |

### 工具实现注意事项

- 文件扫描排除列表应与 `ae-review` 的排除规则保持一致：`node_modules`、`.git`、`dist`、`build`、`.opencode`、`.env`、锁文件
- 图着色算法使用贪心策略即可，不需要最优解
- `mode=plan` 的 markdown 解析可以简单使用正则匹配 `- [ ] **单元` 和 `- [x] **单元` 格式
- 工具返回的 `warnings` 数组应始终非空时才包含内容，空数组表示无警告

### SKILL.md 修改注意事项

- 保持现有阶段编号体系，新增步骤使用小数（如 2.5）
- 不删除现有的策略表，只在现有表格基础上增加工具引用说明
- 保持中文风格与现有内容一致
