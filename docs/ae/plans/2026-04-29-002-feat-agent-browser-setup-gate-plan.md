---
type: plan
status: completed
date: 2026-04-29
title: agent-browser-setup-gate
depth: standard
---

# agent-browser setup 前置门禁计划

## 来源与目标

来源输入：用户要求“只要是使用到 `agent-browser` 的技能、代理、命令或工具中嵌入的自然语言，都应该修改”。

目标是统一 AE 所有面向 LLM/用户的 `agent-browser` 使用说明：任何技能、代理、命令或工具自然语言只要会引导正式流程调用 `agent-browser`，都必须在调用前先执行 `ae:setup` / `/ae-setup`。`ae:setup` 作为唯一前置入口，负责检查当前环境是否安装 `agent-browser`；已安装则直接结束，未安装则按现有流程询问并安装，安装后复检。

本计划只修改提示词资产、catalog/命令生成相关自然语言和回归测试，不改变 `agent-browser` CLI 本身，不引入新的运行时依赖，也不直接编辑 `dist/` 或 `.opencode/` 生成产物。

## 现状摘要

- `src/assets/skills/ae-setup/SKILL.md` 已包含 `agent-browser` 检查、安装和复检流程，但未明确声明它是所有 `agent-browser` 消费方的统一前置入口。
- `src/assets/skills/ae-test-browser/SKILL.md` 当前自行描述安装检查，未安装时提示运行 `/ae-setup` 后停止，尚未把 setup 作为正式流程前的必经步骤。
- `src/assets/skills/ae-frontend-design/SKILL.md` 在视觉验证中把 `agent-browser CLI` 写为第三优先级，当前语义是“未安装则先使用 /ae-setup 安装”，不是“使用前必须先 setup”。
- `src/assets/skills/ae-lfg/SKILL.md` 当前把依赖安装作为可选步骤，并在浏览器测试阶段允许因 `agent-browser` 未安装而跳过。
- `src/assets/agents/workflow/design-iterator.md` 当前让代理自行运行 `command -v agent-browser` / `where agent-browser`，不可用时再提示 `/ae-setup`。
- `src/assets/agents/workflow/figma-design-sync.md` 直接使用 `agent-browser` 采集实现截图，但未声明 setup 前置要求。
- `src/services/ae-catalog.ts` 中 `ae:test-browser` 描述包含 `agent-browser`，命令模板默认由 `src/services/command-registration.ts` 根据 catalog 生成。
- `src/assets/commands/` 当前未发现 `agent-browser` 引用；`src/tools/` 当前未发现直接包含 `agent-browser` 的工具描述或执行逻辑。
- `src/assets/skills/ae-test-browser/references/login-detection.md` 与 `src/assets/skills/ae-lfg/references/pipeline.md` 是会被技能引用的自然语言参考，也需要同步门禁语义。
- `docs/ae/usage-guide.md` 是面向使用者的公开能力说明，当前仍描述 `/ae-test-browser` “先检查 agent-browser 是否可用”，需要同步为 setup 前置语义，避免公开文档与技能/命令行为不一致。

## 影响范围

- 使用者：通过 `/ae-test-browser`、`/ae-frontend-design`、`/ae-lfg` 或相关代理触发浏览器验收、视觉验证、设计迭代、Figma 同步的用户。
- LLM 执行流程：不再允许各消费方自行检查 `agent-browser` 后跳过 setup；必须先经过 `ae:setup` 的统一检查/安装流程。
- 维护者：需要保持 SKILL frontmatter、`src/services/ae-catalog.ts`、命令模板和代理提示词语义一致。
- 构建链路：修改真源位于 `src/assets/**` 和 `src/services/**`，构建后由现有脚本同步到 `dist/src/assets` 与 `.opencode/plugins/*` 包装文件。

## 关键决策

- `ae:setup` 自身是唯一例外：它不需要先执行自己，只负责检查、安装、复检并在已安装时快速结束。
- “正式流程”定义为即将执行或指导执行任何 `agent-browser` CLI 命令的流程；仅在描述 `ae:setup` 安装命令、或安全边界中提到 `agent-browser` 但不实际调用时，不需要递归前置。
- 所有 `agent-browser` 消费方必须表达同一规则：本轮上下文尚未确认已执行 `ae:setup` 时，先执行 `ae:setup`；完成后再继续原流程。
- “已确认已执行 `ae:setup`”的判据必须是当前会话中实际调用过 `ae:setup` / `/ae-setup` 并得到成功或环境就绪结果；`agent-browser` 已安装、`command -v` 成功、`Get-Command` 成功或用户口头声明已安装都不能替代 setup。
- 不保留“未安装则跳过浏览器流程”的默认路径。只有当 `ae:setup` 安装失败、用户拒绝安装、或当前环境无法安装时，才允许记录“无法验证”并继续后续非浏览器流程。
- 不在代理或技能中重复实现安装判断逻辑；手写 `command -v agent-browser`、`Get-Command agent-browser`、`where agent-browser` 的检查说明应收敛到 `ae:setup`。
- 所有包含可复制 `agent-browser` 命令的参考文档、CLI 参考段和示例命令区，自身也必须声明“未在当前会话实际完成 `ae:setup` 前不得执行下列命令”，不能只依赖调用方上下文。
- 命令级自然语言优先通过 `src/services/ae-catalog.ts` 的 `customTemplate` 或描述同步实现，确保普通命令、`-po`、`-pa` 命令保持一致。
- 通过 `/ae-prompt-optimize` 直接优化包含 `agent-browser`、`ae:test-browser`、`/ae-test-browser`、`@design-iterator`、`@figma-design-sync` 的请求时，目标新会话也必须保留 setup 前置要求；源会话已执行过 setup 不能替代目标会话 setup。
- `ae-prompt-optimize` 注入 setup 门禁时不得破坏“首个引用必须是提示词第一个 token”的既有约束；如果优化提示词首 token 是 `@agent` 或 `/command` 引用，setup 约束必须放在不改变首引用位置的后续指令中。
- 任何引用链只要会触发 `ae:test-browser`、`login-detection.md`、`pipeline.md`、浏览器截图、登录检测或可见页面状态确认，也必须在引用点或被引用文档自身声明 setup 前置。
- 不手工编辑 `dist/` 或 `.opencode/plugins/`；运行 `npm run build` 生成同步产物，不把 `.opencode/skills/`、`.opencode/commands/`、`.opencode/agents/ae/` 作为构建同步前提。

## 实现单元

### 0. 盘点 `agent-browser` 文案与测试基线

- [ ] 目标：在修改前建立完整 `agent-browser` 自然语言出现点清单，避免只修复已知文件。
- [ ] 需求：输出 `path + line + context + 分类`，分类至少包含执行性命令、引用链、公开说明、安全边界和 `ae:setup` 自身例外。
- [ ] 依赖：无。
- [ ] 文件：扫描 `src/assets/skills/**/*.md`、`src/assets/agents/**/*.md`、`src/assets/commands/**/*.md`、`src/tools/**/*.ts`、`src/services/**/*.ts`、`docs/ae/usage-guide.md`；清单产物固定写入 `docs/ae/plans/2026-04-29-002-agent-browser-inventory.md`。
- [ ] 方法：使用脚本化扫描或 Vitest helper 批量处理固定 glob 列表；第一轮匹配 `agent-browser` 字面；第二轮匹配非字面触发词：`snapshot -i`、`screenshot`、`open <url>`、`浏览器验收`、`截图证据`、`登录检测`、`可见页面状态确认`、`使用 ae:test-browser`、`@design-iterator`、`@figma-design-sync`；第三轮匹配反模式短语；输出字段固定为 `path`、`line`、`match`、`context`、`category`、`requiresSetup`；最后人工判断是否会引导正式浏览器流程。
- [ ] 测试场景：清单覆盖当前已知技能、代理、catalog、公开使用指南和参考文档；`ae:setup` 自身被标记为例外；安全边界中不执行 `agent-browser` 的说明不强制 setup。
- [ ] 验证：后续实现单元只依赖 `docs/ae/plans/2026-04-29-002-agent-browser-inventory.md` 的当前版本；如发现新增出现点，先回到本单元更新清单，再继续修改；后续实现单元 12 的集成测试固化扫描规则。

### 1. 统一 `ae:setup` 定位

- [ ] 目标：让 `ae:setup` 明确成为所有 AE 浏览器能力使用前的统一环境准备入口，而不只服务前端设计。
- [ ] 需求：已安装直接结束；未安装则询问安装、执行安装、复检；供其他技能/代理前置调用时行为一致。
- [ ] 依赖：无。
- [ ] 文件：`src/assets/skills/ae-setup/SKILL.md`、必要时同步 `src/services/ae-catalog.ts` 中 `ae:setup` 描述。
- [ ] 方法：在开头增加“统一前置入口”说明；把“前端设计环境/前端设计技能核心依赖”等窄表述扩展为“前端设计、浏览器验收、设计迭代、Figma 同步等 AE 浏览器能力的统一依赖入口”；保留现有 Windows/macOS/Linux 检查与安装命令；强调其他流程调用它时，若已安装应快速返回，不重复安装。
- [ ] 测试场景：frontmatter 描述与 catalog 语义一致；文档中不存在要求 `ae:setup` 先执行自己的递归描述。
- [ ] 验证：`npm run test -- tests/services/command-registration.test.ts`。

### 2. 同步 `ae-test-browser` 与登录检测参考

- [ ] 目标：浏览器验收主流程和登录检测参考在执行任何 `agent-browser` 命令前先执行 `ae:setup`。
- [ ] 需求：`ae-test-browser` 工作流程第一步改为 setup 前置；`login-detection.md` 中每个可复制 `agent-browser` 命令区自身声明本轮未实际完成 setup 前不得执行。
- [ ] 依赖：实现单元 0、1。
- [ ] 文件：`src/assets/skills/ae-test-browser/SKILL.md`、`src/assets/skills/ae-test-browser/references/login-detection.md`。
- [ ] 方法：基于实现单元 0 的清单逐段改写；删除技能内自带安装检查段落，避免与 `ae:setup` 重复；保留 `agent-browser` 命令示例作为 setup 完成后的操作说明。
- [ ] 测试场景：每个执行性 `agent-browser` 出现点或工作流段落在命令执行前包含 `ae:setup` 或 `/ae-setup` 前置语义；旧文案“未安装则提示运行 /ae-setup 后停止”不再作为主路径。
- [ ] 验证：`npm run test -- tests/services/agent-browser-setup-gate.integration.test.ts`。

### 3. 同步 `ae-frontend-design` 视觉验证路径

- [ ] 目标：前端设计技能只在实际选择 `agent-browser CLI` 做视觉验证前触发 setup。
- [ ] 需求：不改变其优先使用项目已有 Playwright/Puppeteer 的策略；仅当流程准备执行 `agent-browser` 时，先执行 `ae:setup`。
- [ ] 依赖：实现单元 0、1。
- [ ] 文件：`src/assets/skills/ae-frontend-design/SKILL.md`。
- [ ] 方法：将“未安装则先使用 /ae-setup 安装”改为“未在当前会话实际完成 setup 前，先执行 `ae:setup`；完成后再选择 `agent-browser CLI`”。
- [ ] 测试场景：`agent-browser CLI` 段落前置 setup；不把用户已安装或 CLI 可用描述为替代证据。
- [ ] 验证：`npm run test -- tests/services/agent-browser-setup-gate.integration.test.ts`。

### 4. 同步 `ae-lfg` 浏览器测试路径

- [ ] 目标：LFG 只有进入 UI 浏览器测试路径时才触发 setup，并移除未安装则跳过的默认语义。
- [ ] 需求：无 UI 文件时不强制 setup；有 UI 文件或计划调用 `ae:test-browser` 时，先 setup 再测试。
- [ ] 依赖：实现单元 0、1、2。
- [ ] 文件：`src/assets/skills/ae-lfg/SKILL.md`、`src/assets/skills/ae-lfg/references/pipeline.md`。
- [ ] 方法：把 UI 浏览器测试路径改为“先执行 `ae:setup`，完成后再执行 `ae:test-browser`”；对引用 `pipeline.md` 或 `ae:test-browser` 的段落补充引用链门禁。
- [ ] 测试场景：旧文案“未安装则跳过浏览器测试”不再出现；LFG 无 UI 文件的路径不新增无条件 setup。
- [ ] 验证：`npm run test -- tests/services/agent-browser-setup-gate.integration.test.ts`。

### 5. 同步 `ae-figma-assets` 条件性页面确认说明

- [ ] 目标：Figma 素材技能仅在自然语言实际引导可见页面状态确认辅助时添加 setup 前置。
- [ ] 需求：API、collect、validate 主路径不新增无条件 setup；页面确认、登录态/权限态辅助和截图证据路径必须先 setup。
- [ ] 依赖：实现单元 0、1。
- [ ] 文件：`src/assets/skills/ae-figma-assets/SKILL.md`。
- [ ] 方法：只改写涉及 `agent-browser` 页面辅助的段落；保持“不读取浏览器 token/cookie/localStorage”等安全边界不触发 setup。
- [ ] 测试场景：页面确认辅助段落包含 setup 前置；API/collect/validate 入口不被描述为需要 `agent-browser`。
- [ ] 验证：`npm run test -- tests/services/agent-browser-setup-gate.integration.test.ts`。

### 6. 同步代理提示词中的 `agent-browser` 前置规则

- [ ] 目标：防止工作流代理直接绕过技能门禁调用 `agent-browser`。
- [ ] 需求：代理在首次执行任何 `agent-browser` 命令前必须先执行或要求执行 `ae:setup`。
- [ ] 依赖：实现单元 0、1。
- [ ] 文件：`src/assets/agents/workflow/design-iterator.md`、`src/assets/agents/workflow/figma-design-sync.md`。
- [ ] 方法：在代理工作流前置检查中加入 setup 要求；将 `design-iterator` 中手写 `command -v agent-browser` / `where agent-browser` 检查替换为 `ae:setup` 前置流程；在 `figma-design-sync` 截图采集步骤前增加 setup 前置。
- [ ] 测试场景：代理文件中直接出现 `agent-browser` 的工作流段落包含 setup 前置说明；旧文案“如果不可用，返回提示请先运行 /ae-setup”被替换为“先执行 /ae-setup”。
- [ ] 验证：`npm run test -- tests/services/agent-browser-setup-gate.integration.test.ts`；该测试必须断言 `command -v agent-browser`、`Get-Command agent-browser`、`where agent-browser` 在非 `ae:setup` 文件中没有作为前置检查方案出现。

### 7. 固化命令级 setup 覆盖决策

- [ ] 目标：先产出命令覆盖决策表，避免在实现时临时决定哪些命令需要 `customTemplate`。
- [ ] 需求：普通命令、`-po`、`-pa` 对相关技能保持同一前置语义；机制可选，结果必需。
- [ ] 依赖：实现单元 1、2、3、4、5。
- [ ] 文件：`src/services/ae-catalog.ts`。
- [ ] 方法：在执行前形成并落实以下决策表；如最终使用不同机制，必须达到同等命令自然语言效果。

| 命令 | 覆盖决策 | 原因 |
|------|----------|------|
| `/ae-test-browser` 及 `-po`、`-pa` | 必须通过 `customTemplate` 先执行 `ae:setup` | 该技能主路径必然使用 `agent-browser` |
| `/ae-frontend-design` 及 `-po`、`-pa` | 不做无条件命令前置；在技能流程内条件触发 setup | 可能使用项目已有 Playwright/Puppeteer 或心理审查 |
| `/ae-lfg` 及 `-po`、`-pa` | 不做无条件命令前置；在 UI 浏览器测试路径条件触发 setup | LFG 可能无 UI 文件，不能因入口本身强制安装浏览器依赖 |
| `/ae-figma-assets` 及 `-po`、`-pa` | 不做无条件命令前置；仅在辅助页面确认说明中要求 setup | API/collect/validate 主路径不使用 `agent-browser` |

- [ ] 测试场景：决策表对应的 catalog 描述与 SKILL 语义一致；`/ae-test-browser` 明确先 setup；其他命令不宣称可直接执行 `agent-browser`。
- [ ] 验证：后续实现单元 8 的命令模板测试。

### 8. 实现命令模板前置语义

- [ ] 目标：确保普通命令、`-po`、`-pa` 生成的最终提示都保留 setup 前置顺序。
- [ ] 需求：按实现单元 7 的决策表修改 catalog；`/ae-test-browser` 及其 prompt optimize 变体不得绕过 setup。
- [ ] 依赖：实现单元 7。
- [ ] 文件：`src/services/ae-catalog.ts`、`tests/services/command-registration.test.ts`。
- [ ] 方法：为 `ae:test-browser` 补充 `customTemplate`，模板表达“先使用 `ae:setup` 完成 agent-browser 环境检查，再使用 `ae:test-browser` 处理请求”；`customTemplate` 中优先使用 `SKILL.SETUP`、`SKILL.TEST_BROWSER` 等常量插值，避免硬编码资产名称；确认 `src/services/command-registration.ts` 现有 `-po` / `-pa` 逻辑复用 `customTemplate`，若测试证明已满足则不改注册逻辑。
- [ ] 测试场景：`/ae-test-browser` 模板包含先 `ae:setup` 再 `ae:test-browser`；`/ae-test-browser-po`、`/ae-test-browser-pa` 的完整生成提示在优化包装后仍包含 setup 前置顺序，并包含“未完成 setup 不得执行 agent-browser”的禁止语义。
- [ ] 验证：`npm run test -- tests/services/command-registration.test.ts`。

### 9. 覆盖直接 prompt optimize 入口

- [ ] 目标：防止用户不经过 `/ae-test-browser-po` / `/ae-test-browser-pa`，直接调用 `/ae-prompt-optimize` 优化浏览器任务时绕过 setup。
- [ ] 需求：优化后的目标新会话提示词只要会引导使用 `agent-browser`、`ae:test-browser`、`/ae-test-browser`、`@design-iterator` 或 `@figma-design-sync`，就必须包含“先执行 `ae:setup`，完成后再执行浏览器流程”的约束。
- [ ] 依赖：实现单元 1、8。
- [ ] 文件：`src/assets/skills/ae-prompt-optimize/SKILL.md`、`tests/services/prompt-optimize-setup-gate.test.ts`。
- [ ] 方法：在提示词优化规则中加入浏览器能力门禁注入规则；明确源会话 setup 不迁移到目标会话；保留既有“首个引用必须是第一个 token”约束，setup 规则不得插到首引用前；当前优化逻辑由 LLM 按 `SKILL.md` 执行，测试只断言技能规则文本和顺序约束存在，不断言不存在的确定性优化函数输出。
- [ ] 测试场景：直接优化“用 agent-browser 打开页面截图”“调用 ae:test-browser 验证登录”“让 @design-iterator 迭代页面”等输入时，优化提示包含目标会话 setup 门禁；首 token 为 `@design-iterator` 或 `/ae-test-browser` 的场景仍保持首引用位置。
- [ ] 验证：`npm run test -- tests/services/prompt-optimize-setup-gate.test.ts`。

### 10. 同步 catalog、TUI 与 help 展示

- [ ] 目标：TUI 命令描述和 help 输出不会继续暗示可直接进入 `agent-browser` 流程。
- [ ] 需求：展示文案与 SKILL frontmatter、catalog 描述保持语义一致。
- [ ] 依赖：实现单元 1、8。
- [ ] 文件：`src/services/ae-catalog.ts`、`tests/services/command-registration.test.ts`，必要时新增或更新 `tests/services/help-catalog-service.integration.test.ts`。
- [ ] 方法：同步 `ae:setup`、`ae:test-browser` 和必要相关条目的 description；优先在真实 catalog/command 生成测试中断言，不只依赖 mock 型 help 单测。
- [ ] 测试场景：`createTuiCommands()` 的 `ae-test-browser` 描述与 catalog 保持语义一致；真实 help 输出不把 `agent-browser` 可用性描述为绕过 setup 的前提。
- [ ] 验证：`npm run test -- tests/services/command-registration.test.ts tests/services/help-catalog-service.integration.test.ts`。

### 11. 同步公开使用指南

- [ ] 目标：公开使用指南不会继续暗示 `/ae-test-browser` 可直接检查或使用 `agent-browser`。
- [ ] 需求：`docs/ae/usage-guide.md` 与 catalog、技能、代理说明保持 setup 前置语义一致。
- [ ] 依赖：实现单元 1、2、10。
- [ ] 文件：`docs/ae/usage-guide.md`。
- [ ] 方法：将 `/ae-test-browser` 的“先检查 agent-browser 是否可用”改为“先执行 /ae-setup 完成环境检查”；必要时同步前端设计、Figma 同步、设计迭代转交流程中对 `/ae-test-browser` 的引用链说明。
- [ ] 测试场景：公开指南中浏览器验收、截图或交互验证路径不会把已安装或 CLI 可用作为 setup 替代证据。
- [ ] 验证：`npm run test -- tests/services/agent-browser-setup-gate.integration.test.ts`。

### 12. 增加资产一致性回归测试

- [ ] 目标：防止未来新增 `agent-browser` 自然语言时绕过 `ae:setup` 前置规则。
- [ ] 需求：测试覆盖技能、代理、命令真源和工具/服务中嵌入的自然语言。
- [ ] 依赖：实现单元 2、3、4、5、6、8、9、10、11。
- [ ] 文件：固定新增 `tests/services/agent-browser-setup-gate.integration.test.ts`；不合并到 `tests/services/command-registration.test.ts`。
- [ ] 方法：扫描 `src/assets/skills/**/*.md`、`src/assets/agents/**/*.md`、`src/assets/commands/**/*.md`、`src/tools/**/*.ts`、`src/services/**/*.ts`、`docs/ae/usage-guide.md` 中包含 `agent-browser` 的出现点；对 `src/assets/skills/ae-setup/SKILL.md` 设为例外；仅对包含可复制 `agent-browser ...` 命令、明确要求调用 `ae:test-browser`、或明确让代理执行浏览器截图/交互的段落强制 setup；安全边界、能力描述、状态字段、转交建议列为允许类别；文件级包含只能作为粗筛，不能作为通过标准；补充引用链和非字面触发词扫描，捕获不直接写 `agent-browser` 但会触发浏览器流程的文案。
- [ ] 反模式短语：`command -v agent-browser`、`Get-Command agent-browser`、`where agent-browser`、`agent-browser 已安装，运行`、`agent-browser 未安装，跳过`、`未安装则提示用户运行 /ae-setup`、`用户已安装`、`已经安装即可继续`、`已安装则直接运行 agent-browser`。
- [ ] 测试场景：当前已知消费方全部通过；`ae-setup` 自身允许包含安装检查命令；安全边界说明允许出现；CLI 参考和示例命令区只要包含可复制 `agent-browser` 命令，就必须自身声明本轮未实际完成 setup 前不得执行；无关工具文件没有误报。
- [ ] 验证：`npm run test -- tests/services/agent-browser-setup-gate.integration.test.ts`。

### 13. 最终验证命令执行

- [ ] 目标：确认代码、文档和测试改动通过项目验证。
- [ ] 需求：先运行针对性测试，再运行全量类型检查、测试和构建。
- [ ] 依赖：实现单元 0-12。
- [ ] 文件：不直接编辑文件；记录命令结果。
- [ ] 方法：运行验证矩阵中的针对性命令；再运行 `npm run typecheck`、`npm run test`、`npm run build`。
- [ ] 验证：`npm run typecheck`、`npm run test`、`npm run build`。

### 14. 构建产物同步抽查

- [ ] 目标：确认源码真源、生成产物和运行时资产同步无误。
- [ ] 需求：不手工编辑生成产物；构建后 `dist/src/assets` 包含更新后的技能和代理文本，`.opencode/plugins/*` 包装文件如有变化应来自构建；不要求 `.opencode/skills/`、`.opencode/commands/` 或 `.opencode/agents/ae/` 在构建后同步变化。
- [ ] 依赖：实现单元 13。
- [ ] 文件：不直接编辑生成文件；通过构建更新 `dist/src/assets` 和 `.opencode/plugins/` 包装文件等构建产物。
- [ ] 方法：构建后抽查 `dist/src/assets` 中相关文案同步，并检查工作区 diff 确认 `dist/` 和 `.opencode/plugins/` 的变化来自构建而非手工编辑；产出抽查清单。
- [ ] 验证：抽查 `dist/src/assets/skills/ae-test-browser/SKILL.md`、`dist/src/assets/skills/ae-setup/SKILL.md`、`dist/src/assets/agents/workflow/design-iterator.md` 等与源码真源保持一致。

## 流程与边界情况

- 已安装场景：调用 `/ae-setup` 后快速报告环境就绪，然后继续原技能/代理流程。
- 未安装且用户同意安装：`ae:setup` 安装并复检成功后继续原流程。
- 未安装且用户拒绝安装：消费方不得假装浏览器验证已完成，应记录“无法验证：用户拒绝安装 agent-browser”。
- 安装失败或当前环境不支持安装：消费方记录失败原因和无法验证风险，可继续非浏览器流程，但不得执行 `agent-browser` 命令。
- 用户声称已安装或本地检查显示已安装：不能替代 setup；仍必须先执行 `/ae-setup` 并获得环境就绪结果。
- LFG 无 UI 文件：不需要触发浏览器测试，也不需要仅因 LFG 本身而强制 setup。
- LFG 有 UI 文件或计划进入 `ae:test-browser`：必须先执行 setup，再运行浏览器测试；不再因未安装直接跳过。
- `ae-figma-assets` API/collect/validate 主路径不使用 `agent-browser` 时，不需要 setup；只有实际使用可见页面状态确认辅助时才触发。

## 推迟到执行阶段的细节

- 资产扫描测试的语义窗口大小和段落切分方式可在执行时确定；通过标准必须是出现点/段落级前置语义，不允许退化为文件级包含。
- 如果现有 `command-registration.test.ts` 已有适合的 frontmatter 一致性 helper，执行时优先复用；资产扫描测试固定放入 `tests/services/agent-browser-setup-gate.integration.test.ts`，避免两个实现单元共享同一测试主体。

## 验证矩阵

| 验证 | 目的 |
|------|------|
| `npm run test -- tests/services/command-registration.test.ts` | 验证命令模板和 catalog 同步 |
| `npm run test -- tests/services/help-catalog-service.integration.test.ts` | 验证真实 help 展示不回退旧描述 |
| `npm run test -- tests/services/agent-browser-setup-gate.integration.test.ts` | 验证所有 `agent-browser` 自然语言消费方具备 setup 前置语义 |
| `npm run test -- tests/services/prompt-optimize-setup-gate.test.ts` | 验证直接 `/ae-prompt-optimize` 入口不会移除目标会话 setup 门禁 |
| `npm run typecheck` | 验证 TypeScript 改动类型安全 |
| `npm run test` | 全量回归 |
| `npm run build` | 验证资产同步和构建产物生成 |

## 交付标准

- 所有 `src` 下 `agent-browser` 自然语言使用点和 `docs/ae/usage-guide.md` 公开说明已经统一为 setup 前置语义，`ae:setup` 自身除外。
- 旧的“各消费方自行检查安装”“未安装则跳过浏览器测试”“不可用才提示运行 setup”语义被移除或收敛。
- 普通命令、`-po`、`-pa` 不会绕过 setup 前置说明。
- 直接 `/ae-prompt-optimize` 优化浏览器任务时，目标新会话提示词不会绕过 setup 前置说明。
- “已安装”“用户声称已安装”或手写 CLI 检查不会被描述为 setup 的替代证据。
- 参考文档和 CLI 示例中的可复制 `agent-browser` 命令区自身带有 setup 前置约束。
- 新增或更新测试能够在未来新增 `agent-browser` 文案时捕获缺失 setup 前置的回归。
- 类型检查、测试和构建通过。
