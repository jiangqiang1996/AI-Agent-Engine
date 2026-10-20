# 脚本存储、golden 生命周期与失败处理

## 脚本存储

| 模式 | 工作目录 | golden 目录 | 报告目录 |
|------|---------|------------|---------|
| test-only | 项目既有测试目录（只读，不改动） | — | `ae/e2e-test/reports/` |
| script | `ae/e2e-test/` | `ae/e2e-test/golden/` | `ae/e2e-test/reports/` |

日志统一落 `ae/logs/e2e-test/`。

## golden 生命周期管理

golden 是**已通过并固化的回归资产**——只保存真实跑通过的脚本，作为后续回归的基线。

| 阶段 | test-only 模式 | script 模式 |
|------|---------------|------------|
| 生成 | 不生成脚本 | `.spec.ts` 脚本生成到 `ae/e2e-test/` |
| 执行 | 通过 `npx playwright test` 执行项目既有脚本 | 通过 `npx playwright test` 执行 `ae/e2e-test/` 中的脚本 |
| 固化 | 不固化（不修改既有脚本） | 测试通过的 `.spec.ts` 复制到 `golden/`，覆盖同名旧脚本 |
| 回归 | 回归验证时运行项目既有脚本 | 回归验证时只运行 `golden/` 中的 `.spec.ts` 脚本 |
| 失败 | golden 回归失败时触发 triage；triage 判定 production bug 时记录并从回归范围移除；判定 test bug 时修复后更新 | 同左 |
| 淘汰 | 不适用 | 重新执行时 `ae/e2e-test/` 被新脚本覆盖；用户确认新脚本通过后再复制到 golden/ 覆盖旧版本 |

## 测试失败处理

失败后：

1. 输出 TestFailureBundle 报告
2. 询问用户："检测到 N 个失败，是否自动诊断修复？"
3. 用户确认后运行 `scripts/triage.mjs`
4. 检查脚本返回：
   - 直接返回诊断结果（规则 1/2/4/5 命中）→ 展示 summary，按 `dispatchTarget` 执行
   - 返回 `needs_agent_diagnosis: true`（规则 3 基准对齐）→ 调度 `references/roles/test-triage.md` 角色卡执行语义对齐判断
     （读取基准文档、对比断言与产品行为、判定 production bug / test bug / spec-drift），角色卡返回诊断结果后展示 summary
5. 向用户展示 triage 返回的 summary
6. 按 `dispatchTarget` 执行：
   - `self-fix` → 由 `references/roles/e2e-test-runner.md` 角色卡修复测试脚本
   - `production` → 定位并修复产品代码的缺陷
   - `spec-drift` → 提示用户确认并修正基准文档
   - `manual` → 交由用户判断
7. 修复后询问用户是否回归验证
8. 用户确认后回归：重新运行同层全部测试

## 自修复

当 triage 判定 `test` 时，修复失败的测试：

- test-only 模式：修改项目既有测试脚本中的定位器、断言或步骤（修改前向用户说明改的是哪个文件）
- script 模式：修正 `ae/e2e-test/` 下的 `.spec.ts` 中的定位器、断言或步骤
