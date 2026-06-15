---
name: ae:lsm-design
description: 基于 spec 生成全方面详细设计，固定实现映射与追溯链
argument-hint: "[spec 路径|需求路径|设计输入]"
---

# LSM 设计

## 角色

把需求规格转成全方面详细设计，固定 `U-*` 实现映射和后续阶段入口。

## 适用场景

- 用户明确要求 LSM 链路、`ae:lsm-design` 或详细设计
- 已有显式 spec，需要继续生成设计
- 需要把需求映射到实现单元、验证单元和后续输入

## 不适用场景

- 没有 spec 且用户未选择 LSM
- 普通功能计划，应使用 `ae:plan`
- 仅需要编码实现，应使用 `ae:lsm-build`

## 输入处理

1. 用户显式传入 spec 路径时，以显式路径为准
2. 无显式输入时，根据当前会话讨论的主题，在工作区 `ae/lsm/spec/` 下搜索最符合的 spec 产物
3. 推测不到对应的 spec 产物时，明确拒绝执行并提示用户传入 spec 路径或先执行 `ae:lsm-spec`
4. 只读取用户显式路径或当前会话推测的路径，不默认扫描历史目录

## 执行流程

1. 读取 spec 和需求追溯表
2. 生成设计决策、接口边界、数据模型和实现单元
3. 固化 `U-*` 实现映射和风险说明
4. 生成设计文档；文档过大时按模块或功能域拆分为多个子设计文件
5. 调用 `ae:review domain=document kind=document targets=document` 对 design 产物进行审查
6. 审查通过后，根据需求类型推荐下一步技能

## 产物要求

- 产物路径：`ae/lsm/design/`
- 使用 `references/design-template.md` 作为结构参考
- 包含上游路径、输入 ID、输出 ID、追溯表、验证证据、未验证项和下一步入口
- 设计文档过大时拆分为多个子设计文件，主文件建立索引
- 设计中必须明确区分 UI 相关部分和非 UI 部分，供 `ae:lsm-mockup` 判断

## 安全边界

- 不默认扫历史目录找 spec
- 不新增远程 GitHub 写操作流程
- 不引用 `ae:review` 之外的任何非 LSM 技能
- 返工时仅修改本技能产物（design），不修改上游 spec 和下游产物

## 完成标准

- 产物包含 `U-*` 实现映射
- design 已通过 `ae:review` 审查，审查结论为 passed 或有明确的未阻断发现
- 下一步推荐：
  - 若需求涉及 UI → `ae:lsm-mockup`（视觉还原验证）
  - 若无 UI 需求 → `ae:lsm-test` 或 `ae:lsm-build`
