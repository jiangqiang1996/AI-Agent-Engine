# 技能内 review 闭环

设计契约集产出后，强制调用 `ae-review` 审查本技能产物，形成技能内闭环。

## 一、调用方式

```
ae-review mode=headless <design-dir>/overview.md
```

审查者：`design-integrity-reviewer`（激活条件：hasDesignContract=true）。

传入参数：

- `has_design_contract=true`
- `document_type=design`
- `targets=<产出的文件列表：overview.md, architecture.md, ..., modules/**/*.md>`

ae-review 内部调用时不输出下一步引导，由 ae-design 自身负责。

## 二、置信度门控

设计阶段适用置信度门控，替代硬性不镀金判定。每个潜在的设计发现 / 建议计算置信度：

```
confidence = 0.5 × 需求明确提及 + 0.3 × 工程基线必要性 + 0.2 × 缺失后果严重度
```

- **confidence ≥ 0.8** → 产出为正式发现（P0 / P1 / P2）
- **0.5 ≤ confidence < 0.8** → 产出为 INFO 级别工程建议（不阻断，供参考）
- **confidence < 0.5** → 不产出

**审查范围约束（硬约束）：** 审查设计文档时严格按需求范围，禁止无边界镀金。

## 三、auto 修复范围

ae-review 的 auto 修复范围：

- 章节缺失（必产出维度未产出或章节不完整）
- token 定义不全
- 契约字段模糊
- 跨模块不一致

## 四、收敛协议

- **上限 2 轮** - 最多执行 2 轮 review → auto 修复 → review 循环。
- **收敛定义** - 无新增 P0 / P1 发现即为收敛。
- **未收敛处理** - 2 轮后仍有新增 P0 / P1，回退用户澄清。
