---
name: ae:lsm-design
description: 基于显式 spec 生成 Living Spec Mesh 设计，并保持实现映射与追溯链
argument-hint: "[spec 路径|需求路径|设计输入]"
---

# LSM 设计

## 角色

把规格转成可执行设计，固定 `U-*` 实现映射和后续阶段入口。

## 适用场景

- 用户明确要求完整 LSM 链路、Living Spec Mesh 或 `ae:lsm-design`
- 已有显式 spec，需要继续生成设计
- 需要把需求映射到实现单元、验证单元和审查输入

## 不适用场景

- 普通“给功能写计划”或单阶段重构计划
- 没有显式 spec 且用户并未选择 LSM
- 仅需要通用 `ae:plan`

## 输入处理

- 优先读取仓库相对 spec 路径
- 如果只有需求摘要而没有上游 spec，先提示补全
- 只接受用户显式路径或当前会话交接路径

## 执行流程

1. 读取 spec、需求和上游追溯表
2. 生成设计决策、接口边界和实现单元
3. 固化 `U-*` 映射和风险说明
4. 输出供 `ae:lsm-prototype`、`ae:lsm-test` 和 `ae:lsm-build` 使用的设计资产
5. 调用 `ae:review domain=document kind=document targets=document` 对 design 产物进行审查
6. 审查通过后，根据需求类型推荐下一步技能

## 产物要求

- 使用 `references/design-template.md` 作为结构参考
- 包含上游路径、输入 ID、输出 ID、追溯表、跳过理由、验证证据、未验证项和下一步入口

## 安全边界

- 不默认扫历史目录找 spec
- 不新增远程 GitHub 写操作流程
- 不新增 LSM 专属审查入口

## 完成标准

- 产物包含 `U-*` 实现映射
- design 已通过 `ae:review` 审查，审查结论为 passed 或有明确的未阻断发现
- 下一步入口：审查通过后，若需求涉及 UI 或交互，推荐 `ae:lsm-prototype`；若无非 UI 需求，推荐 `ae:lsm-test` 和 `ae:lsm-build`
