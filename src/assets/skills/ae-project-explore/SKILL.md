---
name: ae:project-explore
description: 探索和分析任意文件集合的结构与关系——源代码项目、文档库、配置仓库、数据目录、项目复刻前的参考调研。输出带置信度标注的结构化画像。
argument-hint: "[target] [focus=structure|content|relations|patterns|all] [depth=quick|standard|deep] [output=summary|profile|both]"
---

# Skill: ae:project-explore

探索并分析任意文件集合（目录、项目、仓库、文档集等），输出带置信度标注的结构化画像。不依赖其他 AE 技能，独立完成全部探索与分析。

本技能是 opencode 内置 `@explore` 代理的增强版：除快速搜索定位外，增加结构分析、关系映射、内容采样、模式识别和画像生成能力。

## 使用场景

- **接手陌生项目**：快速了解目录结构、代码组织、技术栈、模块边界和依赖关系
- **理解文档库**：分析文档分层、交叉引用、覆盖缺口和内容主题分布
- **项目复刻前调研**：深度理解参考项目的结构、模式、约定，为复刻提供详细依据
- **审计配置仓库**：识别配置文件的组织方式、环境分层、敏感信息分布
- **探索数据目录**：分析数据文件的格式分布、命名规范、层级关系
- **混合文件集合**：当目录内同时包含代码、文档、配置、数据等多种类型时，自动分类并分维度分析
- **为下游技能提供上下文**：为 ae:design、ae:work、ae:review 提供项目结构信息

## 不适用场景

- 已知目标文件或内容模式，只需快速搜索定位（直接使用 grep / glob / read 工具）

## 参数说明

| 参数 | 必填 | 说明 |
|------|------|------|
| `target` | 否 | 目标目录，支持绝对路径和相对路径；省略时默认为当前工作区根目录 |
| `focus` | 否 | 探索焦点：`structure`（目录结构与分类）、`content`（内容采样与主题）、`relations`（文件间关系）、`patterns`（组织模式识别）、`all`（全部，默认） |
| `depth` | 否 | 探索深度：`quick`（概览，顶层结构+关键文件）、`standard`（默认，中等深度，抽样深入）、`deep`（详尽，递归展开+全量关系） |
| `output` | 否 | 输出格式：`summary`（仅 Markdown 可读报告）、`profile`（仅 JSON 机器可读画像）、`both`（默认，双格式输出） |

参数解析规则（三级策略）：
1. 显式命名：`key=value`、`key:value`、`--key=value` 直接绑定，优先级最高
2. 值特征推断：按值的模式自动匹配参数类型

   | 值模式 | 推断为 |
   |--------|--------|
   | quick / standard / deep | depth |
   | structure / content / relations / patterns / all | focus |
   | summary / profile / both | output |
   | 现有目录路径 | target |

3. 顺序兜底：值特征有交集时，按 `focus → depth → output → target` 顺序匹配

**产出物名称智能推断规则**（用于区分同一工作空间内多次探索不同目标，避免产出物互相覆盖）：

| 优先级 | 来源 | 示例 |
|--------|------|------|
| 1 | `target` 目录的 basename（非 ASCII 字符替换为连字符）；当 basename 为 `.`、`..`、空字符串，或非 ASCII 替换后结果为纯连字符时，视为推断失败，降级到优先级 2 | `target=../reference-projects/auth` → `auth` |
| 2 | 优先级 1 推断失败或 `target` 未显式提供时，从工作区根目录的 package.json / pom.xml / Cargo.toml / go.mod / pyproject.toml / CMakeLists.txt / Makefile 等项目标识文件中提取项目名；提取失败时尝试下一个标识文件 | `package.json` 中 `"name": "my-service"` → `my-service` |
| 3 | 以上均无法推断 | 固定为 `workspace` |

推断后的名称以下文 `<slug>` 代称，用于产出物文件命名。

**内部调用约定**：当本技能被其他技能自动调用时，所有参数必须使用显式命名格式（如 `focus=all depth=standard`），不依赖值特征推断。

## 执行流程

### 阶段一：采集 — 建立宏观认知

首先按产出物名称智能推断规则确定 `<slug>`，然后确定这是什么类型的文件集合，分层采集：

**1.1 收集类型识别**（自动推断，指导后续策略）

| 信号 | 推断类型 |
|------|----------|
| 存在 package.json / pom.xml / Cargo.toml / go.mod / pyproject.toml / CMakeLists.txt / Makefile | 源代码项目 |
| 40%+ 文件为 .md / .rst / .adoc / .txt | 文档集合 |
| 40%+ 文件为 .json / .yaml / .toml / .ini / .conf / .env / .properties | 配置仓库 |
| 40%+ 文件为 .csv / .json / .xlsx / .parquet / .db | 数据目录 |
| 两种以上类型各占 20%+ | 混合集合 |
| 存在 .docx / .pptx / .pdf / .xlsx 且比例 >30% | 办公文档集 |

**1.2 顶层扫描**
- 列出根目录下所有文件和一级子目录
- 记录明显的入口文件（README、INDEX、main、app、index 等）
- 识别隐藏配置文件（.gitignore、.editorconfig、.prettierrc 等）

**1.3 文件类型盘点**
- 按扩展名统计文件类型分布
- 按目录统计第一层子目录文件数量
- 识别超大文件和空目录

**1.4 关键文件采样**
- 读取入口文件了解定位和用途
- 采样各主要子目录的代表文件
- 深度模式：按目录层级逐层下沉

### 阶段二：假设 — 基于证据推断结构

基于阶段一的采集结果，生成结构假设。根据集合类型采用不同维度：

**源代码项目**：
- 模块划分假设：根据目录布局推断模块边界和职责
- 依赖拓扑假设：根据 import/include/require 推断依赖方向
- 技术栈假设：根据配置文件和代码特征推断语言、运行时、框架
- 架构模式假设：根据分层和命名推断架构风格（单体/分层/微服务/六边形/插件化等）

**文档集合**：
- 主题分类假设：根据目录分组和文件名推断文档主题域
- 引用拓扑假设：根据文档间链接和引用推断信息架构
- 组织结构假设：根据目录命名推断文档分层（教程/指南/参考/API 等）

**配置仓库**：
- 配置分层假设：根据目录或文件命名推断环境/地域/租户分层
- 依赖关系假设：根据配置键的引用推断配置间关联

**数据目录**：
- 数据分类假设：根据目录和文件名推断数据域和维度
- 关系假设：根据命名约定和文件内容推断数据间关联

**每个假设必须标注初始置信度**，依据是指纹采集阶段的可观察证据数量和质量。

### 阶段三：证伪 — 抽样验证与纠正

对阶段二的假设进行证伪检验：

1. 对每个假设选择 2-3 个关键文件进行抽样验证
2. 高置信度假设：验证入口和边界文件，确认假设成立
3. 中低置信度假设：扩大抽样范围，寻找反例
4. 发现反例时：记录矛盾证据，修正假设，降低置信度
5. 识别异常模式（循环依赖、组织混乱、孤立文件、命名不一致等）
6. 深度模式：递归验证子目录和深层关系

证伪后更新所有结论的置信度标注。

### 阶段四：输出 — 生成结构化画像

生成以下维度的分析结果：

1. **概览**：集合类型、规模（文件数/目录数/总大小）、活跃度（Git 活动）、用途推断
2. **结构地图**：目录树（quick 仅顶层，standard 2-3 层，deep 全展开）、关键路径标注
3. **文件分类**：按类型分布、按角色分类（入口/配置/源码/文档/测试/数据/资源）
4. **关系网络**：文件间引用/链接/包含关系、模块间依赖拓扑、识别循环依赖和孤立文件
5. **内容主题**：从关键文件和采样中提取主题词、核心概念、领域术语
6. **模式识别**：组织模式（分层/模块化/扁平/混合）、命名规范、文件组织约定
7. **风险提示**：结构混乱区域、循环依赖、孤立文件、超大文件、敏感信息暴露
8. **复刻指南**（深度模式自动附加）：从零复现该集合所需的结构清单、关键路径、模板文件
9. **盲区声明**：无法通过静态分析确认的结论

## 置信度标注规范

每个结论必须标注三级置信度之一：

| 标注 | 含义 | 证据要求 |
|------|------|----------|
| `[verified]` | 已通过文件内容或工具输出验证 | 至少一个可观察证据 |
| `[inferred]` | 基于多个间接证据合理推断 | 至少两个间接证据互相支撑 |
| `[assumed]` | 基于惯例或单一证据假设 | 必须在盲区声明中列出推断依据和替代可能 |

## 输出要求

### Markdown 报告（ae/project-explore/<slug>-project-summary.md）

- 使用中文编写
- 顶部声明集合类型推断和整体评估
- 每个结论后标注置信度和证据来源
- 盲区声明作为独立章节
- 包含探索耗时和文件扫描统计
- 深度模式：附录包含复刻所需的关键文件清单

### JSON 画像（ae/project-explore/<slug>-project-profile.json）

```json
{
  "schemaVersion": "1",
  "collection": {
    "inferredType": "code_project|document_set|config_repo|data_dir|office_docs|mixed",
    "typeBasis": "推断依据",
    "name": "目录名",
    "activity": "active|moderate|stale|unknown",
    "size": {
      "files": 0,
      "directories": 0,
      "totalBytes": 0
    }
  },
  "fileDistribution": [
    { "extension": ".ts", "count": 0, "category": "source" },
    { "extension": ".md", "count": 0, "category": "document" }
  ],
  "structure": {
    "rootFiles": [],
    "topDirectories": [
      {
        "name": "",
        "role": "inferred role",
        "confidence": "verified|inferred|assumed",
        "children": []
      }
    ]
  },
  "relations": {
    "references": [],
    "clusters": [],
    "isolated": [],
    "circularDependencies": []
  },
  "contentThemes": [],
  "patterns": {
    "organization": "hierarchical|modular|flat|mixed",
    "namingConventions": [],
    "confidence": "verified|inferred|assumed"
  },
  "techContext": {},
  "risks": [],
  "replicationGuide": {
    "directorySkeleton": [],
    "criticalFiles": [],
    "templates": []
  },
  "blindSpots": [
    {
      "topic": "",
      "reason": "",
      "alternativePossibilities": []
    }
  ],
  "meta": {
    "depth": "quick|standard|deep",
    "focus": "",
    "scanDurationMs": 0,
    "filesScanned": 0,
    "filesSampled": 0
  }
}
```

## 安全边界

- 只读取当前工作区内文件，不执行代码、不发起网络请求
- 不修改任何文件，只写入 `ae/project-explore/` 目录下的产出物
- 不解析 `.env*`、凭证文件、密钥文件、私钥或 `.git` 目录内容
- 跳过二进制文件和媒体文件的深度解析（仅记录元信息）
- 依赖目录（node_modules / vendor / __pycache__ / .venv 等）仅统计不深入
- 不依赖其他 AE 技能

## 盲区声明原则

以下场景必须声明为盲区：

- 动态关系（代码中的反射、DI、字符串拼接路径、插件加载；文档中的动态引用）
- 运行时行为（环境变量、远程配置、条件加载）
- 外部依赖的具体内容和版本信息（仅能识别依赖声明，不能验证实际行为）
- 文件内容语义（仅基于文件名和结构推断，不保证语义准确性）
- Git 历史被 shallow clone 或不在当前工作区时，活跃度判断受限

## 完成标准

- Markdown 报告和/或 JSON 画像已写入 `ae/project-explore/` 目录，文件名包含按产出物名称智能推断规则推断的 `<slug>`
- 集合类型已自动推断并声明推断依据
- 每个结论已标注置信度和证据来源
- 盲区声明章节非空
- 存在风险提示（若确实无风险，需明确声明理由）
- 深度模式下，复刻指南已生成
