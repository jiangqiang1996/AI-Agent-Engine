# 前端规范

## TUI toast 分层原则

工具层（`src/tools/*.tool.ts`）是最接近用户的错误处理边界，运行期错误的 `showToast` 调用仅在此层执行。service 层、utils 层、schemas 层等内层模块保持纯异常抛出机制，禁止调用 `showToast`。

插件入口（`src/index.ts`）只允许在 config 注册阶段发出一次性配置告警 toast，用于没有工具执行上下文的配置降级场景，例如内置资产声明的可选配置未解析但已安全回退。入口层不得为工具执行错误、业务逻辑错误或可由工具层处理的异常调用 toast。

### 理由

1. **避免重复通知** — 同一错误在传播链路中经过多层时，如果每层都调用 `showToast`，用户会收到多条重复 toast。仅在工具层的 `Effect.catch` / `catch` 中调用一次，确保每条错误只产生一次用户可见通知。
2. **符合依赖方向** — `architecture.md` 规定依赖方向为 `tools/ → services/ → schemas/ → utils/`，下层禁止依赖上层。`showToast` 通过 `toast-holder.ts` 连接 TUI 插件的 `api.ui.toast`，属于最上层的 UI 通道。service/utils 层引用 `showToast` 会违反"下层不依赖上层"原则。
3. **副作用归属** — toast 是 UI 副作用，应由最接近用户的层统一决定何时通知，而非在深层业务逻辑中触发。

### 规则

- ✅ 工具层 `execute` 函数中的 `Effect.catch`、`catch`、客户端为空检查等错误路径：调用 `showToast`
- ✅ 插件入口 `config` 注册阶段的一次性配置降级告警：调用 `client.tui.showToast`
- ❌ 插件入口中的工具执行错误、业务错误或非注册期错误：不调用 toast
- ❌ service 层的 `Effect.tryPromise` 内部、`throw new Error` 前面：不调用 `showToast`
- ❌ utils 层的纯工具函数：不调用 `showToast`
- ❌ 除上述入口注册期豁免外，任何非工具层的代码：不调用 `showToast`
