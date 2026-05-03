---
type: brainstorm
status: drafted
date: 2026-05-03
topic: builtin-opencode-three-layer-config
---

# builtin-opencode.jsonc 三层配置

## 问题框架

AE 当前已有插件内置的 `builtin-opencode.jsonc`，但配置能力只覆盖插件内置默认值，无法让项目或全局范围提供同类默认配置。需要把 `builtin-opencode.jsonc` 扩展为三层配置来源，使项目级、全局和插件内置配置可以按明确优先级合并，同时保持与 opencode 既有 `opencode.json` 配置的边界清晰，尤其避免 `mcp` 同名项冲突造成用户显式配置被覆盖。

## 需求

**配置来源与优先级**
- R1. 系统应支持项目级、全局、插件内置三个 `builtin-opencode.jsonc` 配置级别，优先级依次为项目级最高、全局次之、插件内置最低 → 验收: 三层同时存在同一字段时，最终结果采用项目级值；没有项目级值但有全局值时采用全局值；两者都没有时采用插件内置值。
- R2. 三层 `builtin-opencode.jsonc` 应按字段级别合并，而不是用高优先级整份配置替换低优先级整份配置 → 验收: 高优先级配置只声明部分字段时，未声明字段仍从低优先级配置保留。
- R3. 同一字段存在冲突时，应按配置级别优先级覆盖 → 验收: 对同一路径字段，项目级覆盖全局和插件内置，全局覆盖插件内置。

**与 opencode.json 的关系**
- R4. 对 `mcp` 配置，若三层 `builtin-opencode.jsonc` 合并结果与 opencode 已传入插件钩子的既有配置出现同名 MCP，最终应以 opencode 既有配置中的该同名 MCP 为准 → 验收: 同名 MCP 同时存在于 opencode 既有配置和任意级别 `builtin-opencode.jsonc` 时，最终运行时配置不使用 builtin 配置覆盖该同名 MCP。
- R5. AE 应尊重 opencode 自身已经完成的项目级 `opencode.json` 高于全局 `opencode.json` 的优先级，不自行重新发现或合并这两类 `opencode.json` → 验收: AE 合并 builtin 配置时，仅把 opencode 传入插件钩子的既有 `config.mcp` 作为高于 builtin 的用户配置来源。
- R6. `mcp` 之外新增到 `builtin-opencode.jsonc` 的其他配置不需要与 `opencode.json` 做冲突处理 → 验收: 新增非 `mcp` 配置仅按三层 `builtin-opencode.jsonc` 优先级合并，不额外读取或比较同名 opencode 配置冲突。

**兼容性与边界**
- R7. 插件内置配置仍应作为最低优先级默认值存在，不得覆盖用户在项目级或全局层显式提供的配置 → 验收: 仅安装插件且没有项目级或全局 builtin 配置时，现有内置 MCP 默认值仍可用；用户提供更高优先级配置后，对应字段按优先级生效。
- R8. 配置合并规则应保持可解释，但不要求运行时逐字段追踪来源 → 验收: 文档中清楚说明优先级顺序、字段级合并规则和 `mcp` 的 opencode 优先规则。

## 成功标准

- 用户可以通过项目级 `builtin-opencode.jsonc` 覆盖团队或插件默认配置，而不必复制整份配置文件。
- 全局配置可作为跨项目默认值，但不会压过项目级配置。
- 插件内置默认值继续提供开箱即用能力，但不会覆盖用户显式配置。
- `mcp` 同名冲突时，既有 `opencode.json` 行为不被 builtin 配置破坏。

## 范围边界

- 不要求为 `mcp` 以外的新增配置建立与 `opencode.json` 的冲突检测或互斥规则。
- 不要求改变 opencode 自身对项目级和全局 `opencode.json` 的加载优先级。
- 不要求在头脑风暴阶段指定具体文件路径、Schema 结构或合并算法实现细节，这些留给规划阶段确定。

## 关键决策

- 三层 `builtin-opencode.jsonc` 优先级为项目级 > 全局 > 插件内置: 这符合用户就近覆盖默认值的预期。
- 合并粒度为字段级: 避免用户为了调整一个字段而复制整份默认配置，降低维护成本。
- `mcp` 与 opencode 既有配置冲突时以 opencode 既有配置为准: opencode 传入插件钩子的配置代表用户对 opencode 的显式配置，应高于 builtin 默认配置。
- 非 `mcp` 配置不处理 opencode 冲突: 当前需求声明这些新增配置不会与 `opencode.json` 冲突，避免引入不必要复杂度。

## 依赖 / 假设

- 已核对现有代码：`src/services/mcp-registration.ts` 当前只读取插件内置配置中的 `mcp` 节点，并与进入插件钩子前已有的 `config.mcp` 合并。
- 已核对现有配置：`src/assets/config/builtin-opencode.jsonc` 当前仅包含内置 MCP 默认值。
- 假设项目级和全局 `builtin-opencode.jsonc` 的发现位置与运行时独立性边界将在规划阶段确定。

## 待定问题

### 规划前需解决
- 无。

### 推迟到规划
- [影响 R1][技术] 项目级与全局 `builtin-opencode.jsonc` 的具体发现路径、缺失文件降级行为和解析错误处理策略。
- [影响 R2][技术] 字段级合并对数组、对象、不同类型值的精确定义。
- [影响 R8][技术] 文档说明应放在用户最容易发现的位置，例如配置文档、帮助输出或错误提示。

## 下一步

-> /ae-plan
