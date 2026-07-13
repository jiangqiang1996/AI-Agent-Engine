# 架构规范

## 源码真源

- 面向插件用户的可分发能力只以 `src/` 下定义为真源。
- `src/assets/skills/`、`src/assets/commands/`、`src/assets/agents/`、`src/assets/rules/`、`src/assets/config/` 是打包后插件资产真源。
- `src/tools/*.tool.ts` 定义打包后可用工具，`src/tools/index.ts` 注册工具。
- `src/schemas/ae-asset-schema.ts` 是技能名、命令名、代理名、工具名常量真源；新增资产先改常量，再改注册或资产文件。

## 模块边界

- `src/index.ts` 只负责插件注册和依赖组装，不承载业务逻辑。
- `src/tools/` 是最接近用户的工具边界，负责参数 Schema、调用服务、捕获错误并返回可恢复中文提示。
- `src/services/` 封装业务逻辑和运行时注册逻辑。
- `src/schemas/` 集中管理 Zod Schema 与资产常量。
- `src/utils/` 只放无业务状态的通用工具函数。

## 依赖方向

- 允许方向：`index.ts` / `tools` → `services` → `schemas` / `utils`。
- 下层不要依赖工具层或 UI toast。
- 同层之间保持最小依赖，禁止循环依赖。

## 构建与运行时资产

- `scripts/postbuild.mjs` 会 bundle `dist/src/index.js`，并清理历史 TUI 残留文件。
- postbuild 会写入 `.opencode/plugins/ae-server.js` 包装文件，供本仓库快速调试当前开发中插件。
- postbuild 会把 `src/assets/` 复制到 `dist/src/assets/`。
- 插件注册流程在 `src/index.ts`：技能路径、命令、代理、MCP、规则注入和工具注册都从 runtime manifest 派生。
- 运行时资产定位细则见 `runtime-independence.md`，核心要求是支持“桥接文件 + dist”场景。

## AE 资产名称常量化

- 技能名、命令名、代理名、工具名必须在 `src/schemas/ae-asset-schema.ts` 中定义为 `as const` 常量。
- 服务层、工具层引用资产名称时通过常量引用，不要硬编码字符串字面量。
- Zod enum 参数直接引用常量值，保持枚举顺序与常量定义一致。
- 多行描述文本中的技能名属于自然语言，豁免常量引用要求。

## SKILL.md 与代码双重决策

- `SKILL.md` 指令由 LLM 执行技能时解读，TypeScript 服务代码供工具和注册逻辑调用。
- 同一逻辑存在两套决策机制时，不要仅因重复就报告问题；重点检查语义是否一致。
- 修改技能 frontmatter、`src/services/ae-catalog.ts`、审查者选择或服务层定位注释时，必须同步保持语义一致。

## 阶段回退策略

- AE 流程中找不到上游产物时回退到更早阶段是有意设计，不要误报为逻辑错误。
- 典型依赖链：`work` 依赖 `design`，`design` 依赖 `prd`。
- `recovery-service.ts` 中的 `fallbackSkillForPhase` 映射体现该依赖链。
