# 角色卡索引与调度策略

本文件是 ae-design 的角色卡目录与调度说明。角色卡放在 `references/roles/`，每个角色卡独立加载。

## 一、角色卡索引

| 维度 | 角色卡 | 产出位置 |
|------|--------|---------|
| overview / 实施约束 / 跨维度映射表 | 主流程产出（不调度角色卡） | `overview.md` + `constraints.md` + `cross-mapping.md` |
| design-spec | `references/roles/spec-author.md` | `design-spec.md`（含设计读数、三旋钮取值、设计体系选择、风格变体推荐、负向设计空间） |
| architecture | `references/roles/architecture-designer.md` | `architecture.md` |
| security | `references/roles/security-designer.md` | `security.md` |
| observability | `references/roles/observability-designer.md` | `observability.md` |
| non-functional | `references/roles/non-functional-designer.md` | `non-functional.md` |
| api | `references/roles/api-designer.md` | `modules/<NN>-<m>/api.md` |
| database | `references/roles/database-designer.md` | `modules/<NN>-<m>/database.md` |
| ui-ux | `references/roles/ui-designer.md` | `modules/<NN>-<m>/ui-ux.md` + `modules/<NN>-<m>/pages/*.md` |
| test-cases | `references/roles/test-cases-designer.md` | `modules/<NN>-<m>/test-cases.md` |

## 二、并行 / 降级范式

> 若宿主支持子代理派发能力，将下列角色卡**并行**分派，每卡一份独立上下文；
> 若不支持，则在当前会话内**顺序**执行同一批角色卡，产出格式不变。

无论走并行还是顺序路径：

- 每张角色卡只加载自己的输入上下文，不加载其他角色卡的完整产物；
- 产出格式、文件名、frontmatter 与稳定 ID 体系完全一致；
- 主流程的汇总与一致性校验步骤在两种路径下都照常执行。

## 三、调度顺序

### 步骤 A：全局维度并行

在同一轮中一次性分派全部全局维度角色卡：

1. `references/roles/architecture-designer.md` → `architecture.md`
2. `references/roles/security-designer.md` → `security.md`
3. `references/roles/observability-designer.md` → `observability.md`
4. `references/roles/non-functional-designer.md` → `non-functional.md`
5. `references/roles/spec-author.md` → `design-spec.md`

每个全局角色卡传入：

- prd 内容摘要
- ae-grill 追问结果
- overview.md 上下文（稳定 ID 体系）
- 契约模板路径

design-spec.md 产出后，把设计读数与负向设计空间透传给 ui-ux 角色卡。

### 步骤 B：模块并行（模块内串行）

从 architecture.md 读取模块划分，为每个模块分配一次执行上下文，各模块之间并行。单个模块内部按下列顺序串行执行角色卡：

1. `references/roles/api-designer.md` → `modules/<NN>-<m>/api.md`
2. `references/roles/database-designer.md` → `modules/<NN>-<m>/database.md`（依赖 api.md 数据模型）
3. `references/roles/ui-designer.md` → `modules/<NN>-<m>/ui-ux.md` + `modules/<NN>-<m>/pages/*.md`（依赖 api.md 响应字段）
4. `references/roles/test-cases-designer.md` → `modules/<NN>-<m>/test-cases.md`（依赖 api.md + database.md + ui-ux.md）

每个模块维度角色卡传入：

- prd 内容摘要
- ae-grill 追问结果
- overview.md + architecture.md + design-spec.md 上下文（提供全局上下文和共享契约）
- 该模块的实体清单
- 跨模块引用目标（ID 引用，不加载其他模块的文件）

### 步骤 C：汇总

全部角色卡执行完毕后，主流程统一汇总：

- 更新 overview.md 的产物清单
- 更新 cross-mapping.md 对应行项
- 记录稳定 ID 列表
- 触发跨模块一致性校验（见 `references/consistency-checks.md`）

## 四、硬性约束

**主流程严禁直接产出维度契约内容。** overview.md、constraints.md 和 cross-mapping.md 由主流程产出，其他维度必须由对应角色卡产出独立文件。违反此约束属于执行错误。
