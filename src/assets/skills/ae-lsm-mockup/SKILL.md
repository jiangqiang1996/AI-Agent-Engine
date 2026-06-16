---
name: ae:lsm-mockup
description: 在需要 UI 或交互时生成 Living Spec Mesh 原型资产
argument-hint: "[design 路径|mockup 输入]"
---

# LSM 视觉还原

## 角色

根据 `ae:lsm-design` 中关于 UI 的设计进行 HTML 视觉还原验证，不论最终软件产物是否为网页均统一使用 HTML 验证。产出 HTML 原型和 mockup 报告，固定 `M-*` 追溯 ID。

## 适用场景

- 用户明确要求 LSM 链路、`ae:lsm-mockup` 或视觉还原验证
- 设计文档中包含 UI 相关的设计内容
- 需要把 UI 设计映射为可验证的 HTML 原型

## 不适用场景

- 没有 design 且用户未选择 LSM
- 设计文档中不包含任何 UI 相关内容，应跳过本技能直接进入 `ae:lsm-test` 或 `ae:lsm-build`
- 没有设计文档，应先执行 `ae:lsm-design`

## 输入处理

1. 用户显式传入 design 路径时，以显式路径为准
2. 无显式输入时，根据当前会话讨论的主题，在工作区 `ae/lsm/design/` 下搜索最符合的 design 产物
3. 推测不到对应的 design 产物时，明确拒绝执行并提示用户传入 design 路径或先执行 `ae:lsm-design`
4. 只读取用户显式路径或当前会话推测的路径，不默认扫描历史目录

## 执行流程

1. 读取设计文档，提取 UI 相关的设计内容
2. 根据 UI 设计生成 HTML 原型文件
3. 固化 `M-*` mockup 追溯 ID，记录 UI 设计与 HTML 原型的映射关系
4. 生成 mockup 报告，记录视觉还原程度、偏差和未还原项
5. 根据项目实际情况动态裁剪模板可选字段，裁剪标记使用 `<!-- trimmed: 原因 -->`
6. 调用 `ae:review domain=document scenes=prototype` 对 mockup 产物进行审查
7. 审查通过后，向用户推荐下一步技能

## 产物要求

- 产物路径：`ae/lsm/mockup/`
- 使用 `references/mockup-template.md` 作为结构参考，裁剪指引见 spec 的 `references/lsm-trimming-guide.md`
- HTML 原型文件放在产物路径下
- 元数据（上游路径、输入 ID、输出 ID、追溯表、验证证据、未验证项）全部由 frontmatter 承载，正文不含"元信息"章节
- mockup 报告记录每个 UI 组件的还原程度；可选字段按模板 trimmingGuide 裁剪

## 安全边界

- 浏览器相关验证必须先通过 `ae:chrome-devtools` 完成 MCP 注册
- 不直接调用 chrome-devtools MCP 工具
- 返工时仅修改本技能产物（mockup），不修改上游 design 和下游产物
- 不新增远程写操作流程

## 完成标准

- 产物包含 HTML 原型文件和 mockup 报告
- 产物包含 `M-*` 追溯 ID
- mockup 已通过 `ae:review` 审查，审查结论为 passed 或有明确的未阻断发现
- 下一步推荐：`ae:lsm-test` 或 `ae:lsm-build`；或重新执行 `ae:lsm-mockup` 返工，或重新执行 `ae:lsm-design` 返工
