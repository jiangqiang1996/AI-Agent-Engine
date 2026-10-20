# 跨模块一致性校验

全部文件产出后执行本清单。结构守门 + 轻量语义守门，覆盖模块间映射。发现不一致时在本阶段修复后再进入 review 闭环。

## 一、结构守门

1. **4 类映射表存在且非空** - `api-field-to-database-column-mapping`、`api-error-to-ui-state-mapping`、`test-case-to-contract-coverage`、`ui-component-to-api-endpoint-mapping` 必须存在且非空（维度未产出的模块省略对应映射表）。
2. **cross-mapping.md ↔ 实际内容一致性** - 映射表必须与实际产出的文件内容对齐。
3. **overview.md 依赖关系完整性** - overview.md 记录的跨模块依赖必须覆盖实际存在的一致性约束。
4. **test-cases 覆盖完整性** - 各模块 test-cases.md 必须覆盖该模块 api.md + database.md + ui-ux.md 的关键场景；每条需求 R 至少有 3 个场景（正常 + 边界 + 异常），每条成功标准 SC 至少有 1 条验收用例。

## 二、轻量语义守门

5. **api ↔ database 字段对齐** - 同模块内 API 请求 / 响应字段与 Database 表字段逐行对齐。
6. **api 错误码 ↔ ui-ux 状态机映射一致性** - API 定义的所有错误码必须在映射表中有对应行项。
7. **test-cases 用例 ↔ 契约元素覆盖追溯** - 每个 P0 / P1 用例至少有 1 条追溯记录；禁止重复用例（相同输入 + 相同预期、断言集包含、换皮重复）和禁止无意义用例（无追溯、弱断言、空壳用例）。
8. **ui-ux ↔ api 端点对齐** - 提交数据的交互组件必须映射到对应 api 端点。
9. **实施约束与 architecture / api 一致性** - constraints.md 的目录结构约定与 architecture.md 模块边界表对齐。

## 三、模块间逻辑协调性

10. **architecture ↔ api** - architecture.md 模块边界与各模块 api.md 接口分组一致。
11. **security ↔ database** - security.md 数据分级与各模块 database.md 敏感字段标注对齐。
12. **observability ↔ architecture** - observability.md 指标体系覆盖 architecture.md 关键数据流。
13. **non-functional ↔ architecture** - non-functional.md 性能目标与 architecture.md 技术选型可行。
14. **design-spec ↔ ui-ux** - `design-spec.md` 与 `ui-ux.md` 由同一套设计上下文产出（design-spec 独占设计读数，ui-ux 不得出现设计读数和负向设计空间），两者取自同一份 design-spec 透传内容。
15. **技术栈选型 ↔ 各章节契约** - 技术实现路线约束中确定的技术栈选型必须与各章节契约一致。

## 四、校验输入约定

校验时只读 `overview.md` + `cross-mapping.md` + 必要维度文件，不整目录加载，避免上下文膨胀。模块间引用一律通过稳定 ID（ADR-XXX、EP-XXX、T-XXX、TC-XXX、ST-XXX、COMP-XXX、PAGE-XXX、INT-XXX、BR-XXX）完成。
