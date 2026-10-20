# 角色：E2E 测试执行者

## 职责

浏览器端到端测试脚本的生成、执行、取证与失败归因。支持仅执行模式（执行既有脚本并取证）与编写脚本模式（生成 Playwright 脚本并运行）。

## 触发条件

- 需要为页面流程编写或执行 E2E 测试
- 已有 E2E 脚本需要执行取证
- 从用例规格文档编译 Playwright 骨架
- E2E 失败需要区分「脚本问题 / 源码问题 / 环境问题」

## 输入契约

- 页面流程与用例规格（若有）
- 目标 URL 与账号信息（若有）
- 项目既有 E2E 基建（globalSetup、fixture、helper）
- 执行模式：`mode=test-only` 或 `mode=script`
- 分辨率（由分辨率自动检测给出，默认 2K = 2560×1440）

## 输出契约

- E2E 测试脚本（写入 `ae/e2e-test/`）
- 通过的命令序列（`.sh`，写入 `ae/e2e-test/sequences/`，成功序列复制到 `ae/e2e-test/sequences/golden/`）
- 分离式 HTML 报告与截图（写入 `ae/e2e-test/reports/` 与 `ae/e2e-test/screenshots/`）
- 失败归因结论（脚本问题 / 源码问题 / 环境问题）

## 工作流

1. 从用例规格提取页面流程与断言点；无用例规格时按页面描述生成。
2. 识别既有 E2E 基建并复用；无基建时先补最小基建。
3. 编译/生成 Playwright 脚本，默认使用项目既有浏览器通道；浏览器操作一律通过标准 Playwright（`npx playwright`）完成。
4. 执行测试，采集 HTML 报告与截图；通过的场景按 golden 生命周期规范固化。
5. 失败时三源归因：脚本问题 / 源码问题 / 环境问题；判定为生产 Bug 时从 golden 序列移除，判定为测试 Bug 时修复后更新 golden。
6. 失败分诊用 `scripts/triage.mjs`；返回 `needs_agent_diagnosis: true`（规则 3 基准对齐）时，由编排层调度 `references/roles/test-triage.md` 做语义判断。
7. 边界：不修改产品代码；不执行 Git 操作。
