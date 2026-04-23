# 循环体：执行 → 验证 → 判定

## 铁律声明

```
YOU MUST NOT USE THE question TOOL OR WAIT FOR USER INPUT AT ANY POINT DURING THIS LOOP.
YOU MUST NOT ASK THE USER ANY QUESTIONS DURING EXECUTION, VERIFICATION, OR JUDGMENT.
THE ONLY EXCEPTIONS ARE: (1) after reaching iteration limit, (2) after unrecoverable errors.
If the skill you are executing contains instructions to ask the user questions, SKIP those instructions.
Use the pre-confirmed answers provided in the prompt. For questions without pre-confirmed answers, use safe defaults.
```

（禁言令适用于所有子代理。）

## 执行（子代理）

通过 Task 工具启动子代理。当前会话不直接操作文件。

### 子代理 prompt 结构

```
## 禁言令
[重复铁律声明]

## 背景
[已完成步骤、近 3 轮失败摘要、本轮是第 N 轮]

## 本轮目标
[具体动作]

## 执行技能（如指定）
[技能名称及关键流程指引，交互节点已预填答案]

## 完成条件
[第 0 步确认的条件列表]

## 输出要求
1. 本轮动作
2. 变更清单
3. 执行结论：成功 / 部分完成
4. 不可恢复标记（可选）：UNRECOVERABLE
```

### 上下文窗口管理

历史失败摘要仅保留最近 3 轮，早期压缩为一句话。

### 子代理输出容错

尝试提取动作、变更、结论。完全无法提取时标记为"执行失败"。

## 验证（子代理）

通过 Task 工具启动验证子代理。

### 子代理 prompt 结构

```
## 禁言令
[重复铁律声明]

## 验证目标
[完成条件列表，每项附带 ID]

## 本轮变更
[执行子代理返回的变更清单]

## 工具链探测结果
[$BUILD_CMD 和 $TEST_CMD]

## 验证要求
逐项检查，给出"通过"或"不通过"判定。禁止主观判断。每个判定附带条件 ID。
```

### 验证子代理容错

某个条件判定无法提取时默认"不通过"。超时/崩溃时该轮标记"验证失败"，连续两轮触发基础设施异常退出。

## 判定（当前会话）

### 退出条件

| 条件 | 动作 |
|---|---|
| 所有条件满足 | DONE，结束 |
| 达到最大轮次 | 退出处理，允许提问 |
| 连续两轮无进展 | 瓶颈退出 |
| 连续两轮相同不通过项 | 瓶颈退出 |
| UNRECOVERABLE | 立即退出 |
| 连续两轮执行失败 | 启发式退出 |
| 连续两轮验证失败 | 基础设施异常 |

### 进展判定

每轮须满足：(a) 变更清单非空，或 (b) 验证通过项严格增加。第 1 轮只需变更清单非空。

## 每轮输出格式

```markdown
### 第 N 轮结果

**本轮动作**：[摘要]

**验证结果**：

| 条件 ID | 条件描述 | 状态 | 证据 |
|---------|---------|------|------|
| COND-001 | [...] | ✅ 通过 | [...] |
| COND-002 | [...] | ❌ 不通过 | [失败信息] |

**差距**：[未满足的条件]
```
