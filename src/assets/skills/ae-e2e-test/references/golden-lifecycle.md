# 脚本存储、golden 生命周期与失败处理

## 脚本存储

| 模式 | 工作目录 | golden 目录 |
|------|---------|------------|
| test-only | `ae/tests/e2e/sequences/` | `ae/tests/e2e/sequences/golden/` |
| script | `ae/tests/e2e/` | `ae/tests/e2e/golden/` |

## golden 生命周期管理

| 阶段 | test-only 模式 | script 模式 |
|------|---------------|-------------|
| 生成 | `.sh` 序列生成到 `ae/tests/e2e/sequences/` | `.spec.ts` 脚本生成到 `ae/tests/e2e/` |
| 执行 | 通过 `ae:playwright` 逐步执行序列中的命令 | 通过 `npx playwright test` 执行 `ae/tests/e2e/` 中的脚本 |
| 固化 | 测试通过的 `.sh` 复制到 `sequences/golden/`，覆盖同名旧文件 | 测试通过的 `.spec.ts` 复制到 `golden/`，覆盖同名旧脚本 |
| 回归 | 回归验证时只运行 `sequences/golden/` 中的 `.sh` 文件 | 回归验证时只运行 `golden/` 中的 `.spec.ts` 脚本 |
| 失败 | golden 回归失败时触发 triage；triage 判定 production bug 时从 golden/ 移除该文件；判定 test bug 时修复后更新 golden/ | 同左 |
| 淘汰 | 重新执行时 `sequences/` 被新序列覆盖；用户确认新序列通过后再复制到 golden/ 覆盖旧版本 | 重新执行时 `ae/tests/e2e/` 被新脚本覆盖；用户确认新脚本通过后再复制到 golden/ 覆盖旧版本 |

## 测试失败处理

失败后：
1. 输出 TestFailureBundle 报告
2. 询问用户："检测到 N 个失败，是否自动诊断修复？"
3. 用户确认后调用 `ae-test-triage` 工具
4. 检查工具返回：
   - 工具直接返回诊断结果（规则 1/2/4/5 命中）→ 展示 summary，按 dispatchTarget 执行
   - 工具返回 `needs_agent_diagnosis: true`（规则 3 真源对齐）→ 调度 `@test-triage` 代理执行语义对齐判断，代理返回诊断结果后展示 summary
5. 向用户展示 triage 返回的 summary
6. 按 dispatchTarget 执行（修复技能 / self-fix / ae:design / manual）。self-fix 由 `@e2e-test-runner` 代理执行，其余修复技能由编排层调度对应代理
7. 修复后询问用户是否回归验证
8. 用户确认后回归：重新运行同层全部测试

## 自修复

当 triage 判定 `test` 时，修复失败的测试。
- test-only 模式：修正 `.sh` 序列中的命令或断言
- script 模式：修正 `.spec.ts` 中的定位器、断言或步骤
