---
type: plan
status: completed
date: 2026-05-03
title: feat-builtin-opencode-three-layer-config
origin: docs/ae/brainstorms/2026-05-03-builtin-opencode-three-layer-config-requirements.md
originFingerprint: 2026-05-03-builtin-opencode-three-layer-config
depth: standard
---

# builtin-opencode.jsonc 三层配置计划

## 来源与范围

本计划基于 `docs/ae/brainstorms/2026-05-03-builtin-opencode-three-layer-config-requirements.md`。目标是让 AE 支持项目级、全局和插件内置三层 `builtin-opencode.jsonc`，按字段级合并，并确保 `mcp` 与 opencode 已传入插件钩子的既有配置冲突时不覆盖用户显式配置。

## 关键决策

- 项目级配置路径：`.opencode/builtin-opencode.jsonc`，相对于 opencode 当前工作区解析；文件缺失时跳过。该路径必须来自插件入口可获得的宿主工作区上下文或受控降级值，不能复用 `RuntimeAssetManifest.repoRoot`，因为 manifest root 表示插件根。
- 全局配置路径：`~/.config/opencode/builtin-opencode.jsonc`；文件缺失时跳过。
- 插件内置配置路径：继续使用 runtime manifest 中的 `builtinConfigFile`，保持“桥接文件 + dist”场景可运行。
- 三层 builtin 合并规则：对象递归合并；数组、标量、`null` 和不同类型值由高优先级整值替换；缺失字段保留低优先级值。
- 三层 builtin 内部同名 MCP：同 `type` 按对象规则合并；不同 `type` 由高优先级整条 MCP 替换，避免 `local` 与 `remote` 字段混杂。
- builtin 与 opencode 既有 `config.mcp` 同名：最终整条采用 opencode 既有 `config.mcp[name]`，不从 builtin 补字段。
- AE 不读取或合并项目级/全局 `opencode.json`，只尊重插件钩子传入的 `config`。
- 文件不存在静默跳过；可选的项目级/全局文件存在但 JSONC 解析失败时抛出带层级和路径的配置错误；插件内置文件缺失或解析失败视为插件安装/打包错误。

## 影响面

- 插件用户：可通过项目级或全局 `builtin-opencode.jsonc` 调整 AE 默认配置。
- 现有 MCP 用户：同名 MCP 的 opencode 显式配置将完全接管该 MCP，不再继承 builtin 未声明字段；这是本需求下的有意行为变化，需要文档说明。
- 插件维护者：后续新增非 MCP builtin 配置时，应复用完整 builtin config 加载与合并服务，而不是在 MCP 注册中重复读取文件。

## 实现单元

### [x] 1. 建立完整 builtin opencode 配置模型与加载服务

目标：把当前只读取 `mcp` 的逻辑升级为读取完整 builtin 配置对象，为 R1、R2、R6 打基础。

需求：R1、R2、R6、R7。

文件：
- `src/services/builtin-opencode-config-service.ts`（新增）
- `src/services/mcp-registration.ts`
- `src/services/runtime-asset-manifest.ts`
- `src/index.ts`
- `tests/services/builtin-opencode-config-service.test.ts`（新增）
- `tests/services/mcp-registration.test.ts`

方法：
- 新增 `BuiltinOpencodeConfig` 类型，至少包含 `$schema?: string` 与 `mcp?: Config['mcp']`，并允许后续非 MCP 顶层字段以 `unknown` 保留。
- 新增读取单个 JSONC 文件的函数，返回完整配置对象；解析后必须是对象，不能是数组、字符串或空内容。
- 保留兼容出口或迁移调用方，让 MCP 注册从完整配置对象中读取 `mcp`。
- 不在运行时执行 JSON Schema 校验；schema 继续服务编辑器和静态结构约束。

测试场景：
- 读取包含注释的 JSONC 完整对象。
- `{}` 与只有 `$schema` 的配置视为合法空配置。
- 空文件、只有注释、非对象 JSON、语法错误返回明确错误。
- 现有 `loadBuiltinMcpConfig` 行为被等价覆盖，或若保留兼容函数则仍能读取 `mcp`。

验证：
- `npx vitest run tests/services/builtin-opencode-config-service.test.ts tests/services/mcp-registration.test.ts`

### [x] 2. 实现三层配置来源发现与字段级合并

目标：按项目级 > 全局 > 插件内置合并 builtin 配置，满足 R1、R2、R3、R7。

需求：R1、R2、R3、R7。

文件：
- `src/services/builtin-opencode-config-service.ts`
- `src/services/runtime-asset-manifest.ts`
- `tests/services/builtin-opencode-config-service.test.ts`
- `tests/services/runtime-asset-manifest.test.ts`

方法：
- 在 manifest 或服务参数中表达三个来源：项目级 `.opencode/builtin-opencode.jsonc`、全局 `~/.config/opencode/builtin-opencode.jsonc`、插件内置 `manifest.builtinConfigFile`。
- 项目级来源必须由 `src/index.ts` 从插件入口上下文解析后显式传给服务；如果入口上下文没有可靠工作区字段，执行时应封装一个小函数使用 `process.cwd()` 作为受控降级，并用测试固定其语义。
- 不得把 `manifest.repoRoot` 用作项目级配置根；该字段在桥接安装时是插件根。
- 读取顺序可以从低到高执行：插件内置 -> 全局 -> 项目级；合并结果按高优先级覆盖低优先级。
- 合并函数必须是通用字段级合并：对象递归合并，数组/标量/`null`/类型冲突整值替换。
- 缺失项目级或全局文件跳过，不创建文件，不依赖本仓库 `.opencode/` 调试目录。
- 保持插件内置资产定位只依赖 runtime manifest，不以 `opencode.json` 定位插件根。

测试场景：
- 三层同字段冲突时项目级胜出。
- 只有全局覆盖时全局胜出，未声明字段保留内置值。
- 对象递归合并；数组由高优先级整值替换；类型冲突由高优先级整值替换。
- 项目级/全局文件缺失时正常降级到低层配置。
- 项目级文件存在但 JSONC 解析失败时抛出包含“项目级”和路径的错误。
- 全局文件存在但 JSONC 解析失败时抛出包含“全局”和路径的错误。
- 插件内置文件缺失或解析失败时抛出插件内置配置错误，不静默降级。
- “桥接文件 + dist” manifest 场景仍定位到插件内置配置。
- 桥接安装场景下，插件内置配置来自插件 `dist/src/assets`，项目级配置来自宿主工作区 `.opencode/builtin-opencode.jsonc`，二者不能混淆。

验证：
- `npx vitest run tests/services/builtin-opencode-config-service.test.ts tests/services/runtime-asset-manifest.test.ts`

### [x] 3. 调整 MCP 注册合并语义

目标：让 MCP 注册消费三层 builtin 合并结果，并在与 opencode 既有 `config.mcp` 同名时整条采用 opencode 配置。

需求：R4、R5、R7。

文件：
- `src/services/mcp-registration.ts`
- `tests/services/mcp-registration.test.ts`
- `tests/services/mcp-registration.integration.test.ts`

方法：
- 将 `registerMcp` 改为读取三层合并后的 builtin config，并取其中 `mcp` 作为默认值。
- 修改 `mergeBuiltinAndUserMcp` 语义：builtin 先铺底；只要 user/opencode 已有同名 MCP，就整条采用 user entry，不做字段补充。
- 三层 builtin 内部的同名 MCP 合并仍按字段级规则处理；不同 `type` 时高优先级整条替换。
- 明确不读取磁盘 `opencode.json`；测试只通过传入 `config.mcp` 表达 opencode 既有配置。

测试场景：
- opencode 既有同名 MCP 不继承 builtin 的 `timeout` 等未声明字段。
- opencode 既有不同 type MCP 整条保留。
- builtin 三层内部同名同 type 合并保留低层未声明字段。
- builtin 三层内部同名不同 type 高优先级整条替换。
- 即使临时目录存在 `opencode.json`，MCP 注册也不读取它，只使用传入的 `config.mcp`。

验证：
- `npx vitest run tests/services/mcp-registration.test.ts tests/services/mcp-registration.integration.test.ts`

### [x] 4. 扩展 schema 与真实内置配置集成断言

目标：让 `builtin-opencode.schema.json` 与完整 builtin 配置能力一致，同时保持当前真实内置配置合法。

需求：R6、R7。

文件：
- `src/assets/config/builtin-opencode.schema.json`
- `src/assets/config/builtin-opencode.jsonc`
- `tests/services/mcp-registration.integration.test.ts`

方法：
- 放宽顶层 schema，使其能够表达当前 `$schema`、`mcp` 以及未来非 MCP builtin 配置；如果无法定义具体未来字段，则不要用 schema 宣称未知字段已完全校验。
- 保持 `src/assets/config/builtin-opencode.jsonc` 当前内容不变，除非需要调整 `$schema` 说明。
- 更新集成测试，不再断言真实配置“只包含 mcp 节点”，改为断言当前真实配置至少包含 `$schema` 和合法 `mcp`。

测试场景：
- 真实内置配置仍能加载 `context7` 与 `gh_grep`。
- 真实内置配置的 `$schema` 引用保持正确。
- schema 变更不会阻止未来非 MCP 字段进入三层 builtin 合并模型。

验证：
- `npx vitest run tests/services/mcp-registration.integration.test.ts`

### [x] 5. 更新用户文档与合并规则说明

目标：满足 R8，让用户能理解三层配置优先级、字段级合并和 MCP 的 opencode 优先规则。

需求：R8。

文件：
- `docs/builtin-config.md`
- `docs/usage-guide.md`

方法：
- 在 `docs/builtin-config.md` 中加入三层 `builtin-opencode.jsonc` 来源、优先级和示例。
- 明确 `mcp` 与 opencode 既有配置同名时，opencode 既有配置整条优先，不继承 builtin 同名项的字段。
- 说明项目级和全局 builtin 配置是 AE 支持的可选用户配置入口，不是下游项目必须具备的结构。
- 在 `docs/usage-guide.md` 的 MCP 或配置章节增加指向说明，避免旧文档继续描述浅合并继承 builtin 字段。

测试场景：
- 文档人工检查：不把本仓库源码路径、`.opencode/plugins/` 或 `src/assets/` 写成普通用户项目的前提。

验证：
- 文档审查覆盖本计划和相关文档变更。

## 风险与缓解

- 行为变化风险：现有 opencode 同名 MCP 浅合并会变为整条优先。缓解：更新测试和文档，明确这是为了保证用户显式配置不被 builtin 补字段影响。
- 运行时独立性风险：项目级/全局配置发现可能误依赖源码仓库或 `opencode.json`。缓解：路径只使用当前工作区相对入口、用户主目录入口和 manifest 内置入口，并补充桥接 + dist 测试。
- 合并规则复杂度风险：字段级合并如果支持删除语义会变复杂。缓解：本次不引入删除语义，`null` 作为普通高优先级值替换低层值。
- 未来非 MCP 配置风险：schema 若过严会阻塞新增字段。缓解：本次建立完整配置对象加载边界，并放宽或明确 schema 对未来字段的支持范围。

## 验证计划

- `npx vitest run tests/services/builtin-opencode-config-service.test.ts tests/services/mcp-registration.test.ts tests/services/mcp-registration.integration.test.ts tests/services/runtime-asset-manifest.test.ts`
- `npm run typecheck`
- 如实现改动超出服务层，补跑 `npm run test`。

## 推迟到执行时的细节

- 新服务的具体函数名和内部类型拆分可在执行时按现有代码风格最小化确定。
- 如果 TypeScript 的 `Config` 类型无法表达未来非 MCP 字段，执行时可用局部 `unknown` 结构保留字段，不需要扩大公共类型面。
