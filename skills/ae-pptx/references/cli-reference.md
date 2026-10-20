# officecli 命令行通用能力参考

本文件是 `ae-pptx` 技能内置的**通用 CLI 能力说明**，覆盖三层操作策略、批量操作、raw XML、驻留模式、退出码语义等。

所有命令都**直接调用官方 CLI**（全局安装见技能正文步骤 0）：

```bash
officecli <command> <file> [path] [选项]
```

> **命令在前、文件在后**：写成 `officecli create deck.pptx`。把文件写到命令前面会报参数错误。

> **不确定属性名、值格式或命令语法时先跑 help，不要猜。**

```bash
officecli --help                       # 全部命令 + 全局选项
officecli help pptx                    # pptx 全部元素
officecli help pptx shape              # 完整 schema：属性、别名、示例
officecli help pptx set shape          # 只看 set 可用的属性
```

属性名拼错时 CLI 会返回 `suggestion` 与合法取值范围，按提示自纠即可。

---

## 三层策略：L1 → L2 → L3

| 层 | 手段 | 命令 |
|---|---|---|
| **L1 读取** | 语义视图 | `view`（`text` / `annotated` / `outline` / `stats` / `issues` / `html` / `svg` / `screenshot` / `pdf` / `forms`） |
| **L2 DOM 编辑** | 结构化元素操作 | `get` `query` `set` `add` `remove` `move` `swap` |
| **L3 raw XML** | XPath 直改，兜底方案 | `raw` `raw-set` `add-part` `validate` |

**优先使用高层**；L2 表达不了才降到 L3。L1/L2 的输出都可加 `--json` 拿结构化结果。

---

## 命令清单

| 命令 | 说明 |
|---|---|
| `create` | 创建空白 `.pptx`（按扩展名定类型；`--force` 覆盖已有文件） |
| `view` | 查看内容：`text` `annotated` `outline` `stats` `issues` `html` `svg` `screenshot` `pdf` `forms` |
| `get` | 获取元素及其子节点（`--depth N`、`--json`、`--save <path>` 导出二进制负载） |
| `query` | 选择器查询，支持 `and`/`or`、`>` 子代、`:` 伪类、`--compact` 紧凑输出 |
| `set` | 修改元素属性（`--prop`、`--find`/`--replace`） |
| `add` | 添加元素（`--type`，或 `--from <path>` 克隆；`--index`/`--after`/`--before` 定位） |
| `remove` | 删除元素 |
| `move` | 移动元素（`--to`、`--index`、`--after`、`--before`） |
| `swap` | 交换两个元素 |
| `validate` | 按 OpenXML schema 校验 |
| `batch` | 一次执行多条操作（stdin / `--input` / `--commands`） |
| `dump` | 导出为可回放的 batch JSON（`--format batch`，`-o` 写文件） |
| `merge` | 模板合并：把 `{{key}}` 占位符替换为 JSON 数据 |
| `raw` / `raw-set` / `add-part` | 查看 / 修改原始 XML / 新增文档部件 |
| `open` / `save` / `close` | 驻留模式的开启 / 落盘 / 落盘并释放 |
| `watch` / `unwatch` | 启动 / 停止本地实时预览服务器 |
| `refresh` | 重算 TOC 页码、`PAGE` 与交叉引用 |
| `skills` | 安装官方专用技能（`skills list` / `skills install <name>`） |
| `plugins` / `install` / `mcp` | 插件、一键安装与 MCP 注册 |
| `help` | 内置帮助与 schema 参考 |

> 命令与标志以 `officecli --help` 与 `officecli help <format> <command>` 的实际输出为准。**不要凭记忆猜参数名。**
> `officecli install` 会连带把官方技能与 MCP 注册写进检测到的代理，属于**超出本技能范围**的副作用，本技能只用 `npm`/`brew`/`scoop`/官方脚本安装二进制本身。

---

## 属性值格式

| 类型 | 可接受格式 | 示例 |
|---|---|---|
| 尺寸 | cm / in / pt / px / 原始 EMU | `2cm`、`1in`、`72pt`、`914400` |
| 颜色 | 十六进制 / 命名 / RGB / 主题色 | `#FF0000`、`FF0000`、`red`、`rgb(255,0,0)`、`accent1` |
| 字号 | 裸数字或 pt 后缀 | `14`、`14pt`、`10.5pt` |
| 间距 | pt / cm / in / 倍数 | `12pt`、`1.5x`、`150%` |

---

## 批量操作

```bash
# 从 JSON 文件执行
officecli batch deck.pptx --input updates.json --json

# 内联命令
officecli batch deck.pptx --commands '[{"command":"set","path":"/slide[1]/shape[1]","props":{"text":"新标题"}}]'
```

每个数组项是**一个对象**：`command` 是裸动词（`add`/`set`/`remove`/`move`/`swap`/`get`/`query`…），
动词的参数是**同级字段**（不是塞在 `command` 里的 CLI 字符串）：

| 字段 | 含义 |
|---|---|
| `command` | 裸动词 |
| `parent` | `add` 的父路径 |
| `path` | `set`/`remove`/`get` 的目标路径（`query` 也接受作 `selector` 的别名） |
| `selector` | `query` 的选择器 |
| `type` | `add` 的元素类型 |
| `props` | `--prop` 的键值对映射 |
| `to` / `after` / `before` | `move` 的落点 |
| `path2` | `swap` 的第二个路径 |

批量默认**原子**：任一条失败则整体回滚。`--best-effort` 保留已成功的部分，`--stop-on-error` 遇错即停。

文本值与 `--prop` 规则一致：`\n` 表示新段落，`\v` 表示同段内换行。

---

## 学习已有文档并回放

```bash
officecli dump existing.pptx -o blueprint.json
officecli batch new.pptx --input blueprint.json
```

> 子树 dump 不含同级资源（样式/主题/母版/版式），回放目标必须已具备被引用的这些定义。
> 全新回放的可靠顺序是 `close` → `rm` → `create` → `batch` → `close`：
> `create` 不覆盖已存在文件（退出码 1，`code: file_exists`），也拒绝被驻留进程占用的文件（`code: file_locked`）。

---

## 驻留模式（多步操作更快）

```bash
officecli open deck.pptx
officecli set deck.pptx '/slide[1]/shape[1]' --prop text="新标题"
officecli save deck.pptx      # 落盘，保留驻留
officecli close deck.pptx     # 落盘并释放
```

> **用别的程序读文件前先落盘。** 驻留进程会延迟写盘；在交给其它程序读取之前执行 `save`（落盘并保留驻留）或 `close`（落盘并释放）。
> 需要「每次变更立即落盘」时设置环境变量 `OFFICECLI_RESIDENT_FLUSH=each`。
> 驻留空闲 2-10 秒后也会自动落盘（可用 `OFFICECLI_RESIDENT_FLUSH` 调整）。

---

## 退出码与错误语义

| 退出码 | 含义 |
|---|---|
| `0` | 操作成功落地 |
| `1` | 未落地（进程失败或业务失败，错误信息在 `error` 字段） |
| `2` | 有告警：可能被丢弃的属性，或校验器给出警告 |

> **退出码 2 时必须读 JSON 里的 `success` 字段**，不能只看退出码。`success: true` 表示已落地但有属性被丢弃，`warnings[]` 列出被丢弃项。

错误对象形如：

```json
{ "success": false, "error": { "error": "Slide 50 not found (total: 8)", "code": "not_found", "suggestion": "Valid Slide index range: 1-8" } }
```

错误码：`not_found`、`invalid_value`、`unsupported_property`、`invalid_path`、`unsupported_type`、`missing_property`、`file_not_found`、`file_locked`、`file_exists`、`invalid_selector`。

---

## 安全边界

- 破坏性操作（`remove`、`move`、`swap`、覆盖式 `batch`、`create --force`）**先向用户确认**
- 不要对用户未提供的文件路径执行写操作
- 不要用 `raw-set` 改写用户未指定的文档部件
- 提交 / 推送等 Git 写操作不在本技能范围内
- 不要用 `officecli install` 批量改写代理的技能目录与 MCP 配置
