# ae:merge-branch 技能审查报告

## 范围

- `src/assets/skills/ae-merge-branch/SKILL.md`
- `src/schemas/ae-asset-schema.ts`
- `src/services/ae-catalog.ts`
- `tests/schemas/ae-asset-schema.test.ts`
- `tests/services/ae-catalog.test.ts`
- `tests/services/help-catalog-service.integration.test.ts`

## 绑定状态

- Worktree: `E:\Documents\IdeaProjects\ai-agent-engine`
- Branch: `master`
- HEAD: `640b640622a65229711bb7bfff8abe9c3a0e59bd`

## 审查执行

- 初审：`correctness-reviewer`、`security-reviewer`、`standards-reviewer`
- 复核：`security-reviewer ses_2139db198ffe6PNvABN8m3sfNX`
- 复核：`standards-reviewer ses_2139db18cffeWObCeu9Yd3EWZ0`

## 已修复问题

- 默认 `git merge <target>` 可能自动创建合并提交，已改为默认 `git merge --no-commit --no-ff -- <target>`。
- 目标分支文件读取方式不明确，已要求使用 `git ls-tree` 和 `git show <target>:<path>` 等只读 Git 对象访问。
- 目标分支 AE 文档可被提示词注入，已标注为不可信数据，只允许提取摘要。
- 冲突修复缺少单独编辑确认，已要求列出冲突文件、合并前未提交变更和修复原则后取得确认。
- 最终输出缺少审查状态和门禁结果，已补充。
- 用户指出 `docs/ae/handoff/` 兼容路径描述不正确，已移除，仅保留 `docs/ae/handoffs/`。

## 复核结论

- `security-reviewer`: 未发现仍存在的 P0/P1/P2 finding；无阻断。
- `standards-reviewer`: 无 P0/P1/P2 finding。

## 残余风险

- 本次新增的是 LLM 技能执行流程文档，不包含实际 Git merge 自动化实现；行为依赖执行代理遵守技能流程和全局 Git 授权规则。
