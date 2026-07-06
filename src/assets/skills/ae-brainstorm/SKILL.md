---
name: ae:brainstorm
description: "多模型多视角头脑风暴：详见 ae-brainstorm 工具描述。适用于需要多角度发散讨论的场景。"
argument-hint: "[讨论主题] [perspectives=optimist,critic,pragmatist] [rounds=1]"
---

# 头脑风暴

`ae:brainstorm` 通过底层 `ae-brainstorm` 工具执行两阶段头脑风暴。

**你必须调用 `ae-brainstorm` 工具来执行头脑风暴，不要自行派发子代理或模拟讨论。**

## 功能描述

<feature_description> #$ARGUMENTS </feature_description>

**如果上面的功能描述为空，询问用户：** "您想讨论什么？请描述您正在考虑的主题、问题或想法。"

在获得用户的讨论主题之前不要继续。

## 执行流程

1. 确认讨论主题。如果主题过于宽泛，与用户对齐讨论边界。
2. 根据主题性质选择视角组合（默认 optimist/critic/pragmatist，技术话题可加 innovator，系统话题可加 systems）。
3. 调用 `ae-brainstorm` 工具，传入 `topic`、`perspectives`、可选 `rounds`。
4. 工具返回汇总结果后，向用户呈现关键发现。
5. 用户可根据汇总结果选择：继续深化（增加轮次或新视角）、转向正式需求文档（转交 ae:prd）、或结束讨论。
