# 测试规范

## 测试框架

- 使用 Vitest 作为测试框架
- 测试文件放在对应模块同级目录，命名 `*.test.ts`
- 测试目录结构：

```
src/
├── tools/
│   ├── ae-review-contract.tool.ts
│   └── ae-review-contract.tool.test.ts
├── services/
│   ├── recovery-service.ts
│   └── recovery-service.test.ts
```

## 测试分类

### 单元测试

- 覆盖所有工具函数、服务函数、Schema 校验
- 每个公共函数至少一个测试用例
- Mock 外部依赖（文件系统、网络请求等）

### 集成测试

- 测试工具的完整执行流程
- 测试 Hook 的注册和调用链路
- 测试插件入口的加载和初始化

### 端到端测试

- 测试插件在 opencode 环境中的完整行为
- 验证工具与 LLM 的交互

## 覆盖率要求

| 模块 | 最低覆盖率 |
|------|-----------|
| `tools/` | 80% |
| `hooks/` | 80% |
| `services/` | 90% |
| `schemas/` | 90% |
| `utils/` | 90% |

## 测试编写规范

### 命名

- 使用 `describe` 分组，描述被测模块
- 使用 `it` 或 `test`，描述预期行为
- 测试描述使用中文

```typescript
import { describe, it, expect } from "vitest"

describe("ae-review-contract 工具", () => {
  it("应该根据审查类型生成审查团队", async () => {
    const result = await execute({ kind: "code", mode: "interactive" }, mockContext)
    expect(result).toContain("审查团队")
  })

  it("应该在参数缺失时返回友好提示", async () => {
    const result = await execute({ kind: "invalid", mode: "report-only" }, mockContext)
    expect(result).toContain("不支持的审查类型")
  })
})
```

### Mock 规范

- 使用 `vi.mock()` 或 `vi.spyOn()` 进行 Mock
- Mock 数据放在测试文件顶部的 `const` 中
- Effect 服务使用 `Layer.succeed` 替换为 Mock 实现

```typescript
import { Layer } from "effect"

const MockRecoveryService = Layer.succeed(RecoveryServiceTag, {
  recover: () => Effect.succeed({ phase: "plan", skill: "ae:plan" }),
})
```

### 边界用例

每个函数必须测试以下场景：
- 正常输入
- 空值 / 缺失参数
- 超长输入
- 非法类型输入
- 并发调用（如适用）
