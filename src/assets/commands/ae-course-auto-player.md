---
description: 自动播放在线课程：连接浏览器、遍历课程列表、自动处理文档/考试/视频/外链等课程类型
model: $vision
---

先使用 `ae:chrome-devtools` 技能完成 chrome-devtools MCP 动态注册；未完成 MCP 注册前不得执行任何浏览器控制命令。

MCP 就绪后，再使用 `ae:course-auto-player` 技能处理这次请求，并沿用参数：`$ARGUMENTS`。
