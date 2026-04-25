# TUI toast 分层原则

> 本文件由 `/ae-save-rules` 命令生成，最后更新：2026-04-25

工具层（`src/tools/*.ts`）是最接近用户的错误处理边界，`showToast` 调用仅在此层执行。service 层、utils 层、schemas 层等内层模块保持纯异常抛出机制，禁止调用 `showToast`。

## 理由

1. **避免重复通知** — 同一错误在传播链路中经过多层时，如果每层都调用 `showToast`，用户会收到多条重复 toast。仅在工具层的 `Effect.catch` / `catch` 中调用一次，确保每条错误只产生一次用户可见通知。
2. **符合依赖方向** — `architecture.md` 规定依赖方向为 `tools/ → services/ → schemas/ → utils/`，下层禁止依赖上层。`showToast` 通过 `toast-holder.ts` 连接 TUI 插件的 `api.ui.toast`，属于最上层的 UI 通道。service/utils 层引用 `showToast` 会违反"下层不依赖上层"原则。
3. **副作用归属** — toast 是 UI 副作用，应由最接近用户的层统一决定何时通知，而非在深层业务逻辑中触发。

## 规则

- ✅ 工具层 `execute` 函数中的 `Effect.catch`、`catch`、客户端为空检查等错误路径：调用 `showToast`
- ❌ service 层的 `Effect.tryPromise` 内部、`throw new Error` 前面：不调用 `showToast`
- ❌ utils 层的纯工具函数：不调用 `showToast`
- ❌ 任何非工具层的代码：不调用 `showToast`