# AE Graph Preview

AE 文件关系图谱的离线预览 Web 应用。构建产物被打包到插件资产中，随 `ae:graph-build` 技能部署到用户项目的 `ae/graphs/` 目录，可直接在浏览器中打开。

## 技术栈

- **Vue 3** — 组合式 API（`<script setup>`）
- **Element Plus** — UI 组件库（工具栏、树、消息提示等）
- **Cytoscape.js** — 图谱渲染与交互（布局、缩放、选择、拖拽）
- **Vite** — 构建工具，`base: './'` 确保产物以相对路径加载

## 项目结构

```
webs/graph-preview/
├── index.html                  Vite 入口 HTML
├── vite.config.ts              Vite 配置（Vue 插件、相对路径基线）
├── package.json                依赖与脚本
├── tsconfig.json               TypeScript 配置
├── public/
│   ├── graph.json              开发用示例图谱数据（不打包到产物）
│   └── version-1/              开发用示例分片目录
├── scripts/
│   └── copy-to-references.mjs  构建后复制脚本，将 dist 产物复制到插件资产目录
└── src/
    ├── main.ts                 Vue 应用入口，挂载 Element Plus
    ├── App.vue                 根组件，编排四个子组件
    ├── styles.css              全局样式
    ├── graph-types.ts          图谱数据类型定义（与后端 schema 对齐）
    ├── graph-service.ts        图谱数据加载、过滤与 Cytoscape 数据转换
    └── components/
        ├── Toolbar.vue         工具栏：目录过滤、关系搜索、粒度、类型、布局、节点上限
        ├── DirectoryTree.vue   左侧目录树：按目录展示文件与关系计数，支持勾选过滤
        ├── GraphCanvas.vue     中央画布：Cytoscape.js 图谱渲染与交互
        └── DetailPanel.vue     右侧详情面板：节点属性、关系列表、来源与证据
```

## 数据流

1. `App.vue` 在 `onMounted` 时调用 `graph-service.ts` 的 `loadGraphData` 加载 `graph.json`
2. `loadGraphData` 读取 `graph.json` 中的 `versions` 数组，找到 `isActive: true` 的版本
3. 加载该版本目录下的 `manifest.json`，按 `chunks` 列表并行加载分片 JSON
4. 合并分片中的 `files` 和 `relations`，返回 `LoadedGraph`
5. 用户通过 `Toolbar` 调整过滤条件，`App.vue` 调用 `buildCyData` 重新计算 Cytoscape 节点/边
6. `GraphCanvas` 监听 `cyData` 变化，更新 Cytoscape 实例

## 构建与部署

### 开发

```bash
cd webs/graph-preview
npm install
npm run dev
```

Vite 开发服务器启动后，`public/graph.json` 和 `public/version-1/` 提供本地示例数据。

### 构建

```bash
npm run build          # 仅构建
npm run build:copy     # 构建 + 复制到插件资产目录
```

`build:copy` 会执行 `scripts/copy-to-references.mjs`，将 `dist/` 产物复制到 `src/assets/skills/ae-graph-build/references/`。复制时排除 `graph.json` 和 `version-1/` 等数据文件，因为这些是运行时由 `ae:graph-build` 工具生成的。

### 产物部署

`ae-graph-build.tool.ts` 中的 `copyGraphPreview` 函数在构建图谱时，将 `references/` 目录下的所有文件复制到用户项目的 `ae/graphs/` 目录。最终用户打开 `ae/graphs/index.html` 即可查看图谱。

## 类型体系

`graph-types.ts` 定义了与后端 `graph-schema.ts` 对齐的类型：

| 前端类型 | 后端对应 | 说明 |
|---------|---------|------|
| `GraphFileNode` | `GraphFileNode` | 文件/目录/符号节点 |
| `GraphRelation` | `GraphRelation` | 节点间关系 |
| `GraphStore` | `graph.json` 顶层 | 版本列表 |
| `GraphManifest` | `manifest.json` | 分片索引 |
| `GraphChunk` | 分片 JSON | 单个分片数据 |
| `CyData` | — | Cytoscape 渲染数据（节点+边+统计） |

## 过滤与渲染逻辑

`graph-service.ts` 的 `buildCyData` 函数实现核心过滤：

1. **目录过滤** — `unselectedDirs` 集合中的目录及其下文件被排除
2. **路径前缀过滤** — `fileFilter` 只保留以该前缀开头的文件
3. **粒度切换** — `file` 粒度只显示文件节点，`symbol` 粒度只显示符号节点
4. **类型过滤** — `typeFilter` 只显示指定关系类型（import/require/link/include）
5. **关系搜索** — `relationSearch` 在关系类型、路径、证据中子串匹配
6. **节点上限** — `nodeLimit` 按度数排序后截断，保留关系最多的节点
7. **虚拟节点** — 被截断的节点如果出现在边的端点，生成虚拟节点保持图连通性

## 布局模式

`GraphCanvas.vue` 支持以下 Cytoscape 布局：

- `cose` — 力导向布局（默认）
- `breadthfirst` — 广度优先树形布局
- `circle` — 圆形布局
- `concentric` — 同心圆布局
- `grid` — 网格布局
