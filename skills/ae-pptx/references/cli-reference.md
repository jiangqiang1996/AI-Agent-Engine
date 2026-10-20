# officecli 命令行通用能力参考

本文件是 `ae-pptx` 技能内置的**通用 CLI 能力说明**，覆盖三层操作策略、批量操作、raw XML、驻留模式、退出码语义等。
所有命令都通过本技能的包装脚本调用：

```bash
node scripts/officecli.mjs run -- <officecli 参数…>
```

> **不确定属性名、值格式或命令语法时先跑 help，不要猜。**

```bash
node scripts/officecli.mjs run -- help                       # 全部命令 + 全局选项
node scripts/officecli.mjs run -- help pptx                  # pptx 全部元素
node scripts/officecli.mjs run -- help pptx shape            # 完整 schema：属性、别名、示例
node scripts/officecli.mjs run -- help pptx set shape        # 只看 set 可用的属性
```

属性名拼错时 CLI 会返回 `suggestion` 与合法取值范围，按提示自纠即可。

---

## 三层策略：L1 → L2 → L3

| 层 | 手段 | 命令 |
|---|---|---|
| **L1 读取** | 语义视图 | `view`（`text` / `annotated` / `outline` / `stats` / `issues` / `html` / `svg` / `screenshot`） |
| **L2 DOM 编辑** | 结构化元素操作 | `get` `query` `set` `add` `remove` `move` `swap` |
| **L3 raw XML** | XPath 直改，兜底方案 | `raw` `raw-set` `add-part` `validate` |

**优先使用高层**；L2 表达不了才降到 L3。L1/L2 的输出都可加 `--json` 拿结构化结果。

---

## 命令清单

| 命令 | 说明 |
|---|---|
| `create` | 创建空白 `.pptx`（按扩展名定类型） |
| `view` | 查看内容：`outline` `text` `annotated` `stats` `issues` `html` `svg` `screenshot` |
| `get` | 获取元素及其子节点（`--depth N`、`--json`） |
| `query` | 选择器查询，支持 `and`/`or` 组合 |
| `set` | 修改元素属性（`--prop`、选择器、`--find`/`--replace`） |
| `add` | 添加元素（`--type`，或 `--from <path>` 克隆） |
| `remove` | 删除元素 |
| `move` | 移动元素（`--to`、`--index`、`--after`、`--before`） |
| `swap` | 交换两个元素 |
| `validate` | 按 OpenXML schema 校验 |
| `batch` | 一次执行多条操作（stdin / `--input` / `--commands`） |
| `dump` | 导出为可回放的 batch JSON（可指定子树路径） |
| `merge` | 模板合并：把 `{{key}}` 占位符替换为 JSON 数据 |
| `raw` | 查看某文档部件的原始 XML |
| `raw-set` | 通过 XPath 修改原始 XML |
| `add-part` | 新增文档部件（页眉、图表等） |
| `open` / `save` / `close` | 驻留模式的开启 / 落盘 / 关闭 |
| `watch` | 启动本地实时预览服务器 |
| `refresh` | 重算 TOC 页码、`PAGE` 与交叉引用 |
| `load_skill` | 打印内置专用规则 |
| `plugins` / `config` / `install` / `mcp` | 插件、配置、安装与 MCP 注册 |
| `help` | 内置帮助 |

> 命令与标志以 `officecli --help` 与 `officecli help <format> <command>` 的实际输出为准。**不要凭记忆猜参数名。**

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
node scripts/officecli.mjs run -- deck.pptx batch --input updates.json --json

# 内联命令
node scripts/officecli.mjs run -- deck.pptx batch --commands '[{"op":"set","path":"/slide[1]/shape[1]","props":{"text":"新标题"}}]'
```

批量默认**原子**：任一条失败则整体回滚。`--best-effort` 保留已成功的部分，`--stop-on-error` 遇错即停。

---

## 学习已有文档并回放

```bash
node scripts/officecli.mjs run -- existing.pptx dump -o blueprint.json
node scripts/officecli.mjs run -- new.pptx batch --input blueprint.json
```

---

## 驻留模式（多步操作更快）

```bash
node scripts/officecli.mjs run -- deck.pptx open
node scripts/officecli.mjs run -- deck.pptx set '/slide[1]/shape[1]' --prop text="新标题"
node scripts/officecli.mjs run -- deck.pptx close
```

> **用别的程序读文件前先落盘。** 驻留进程会延迟写盘；在交给其它程序读取之前执行 `save`（落盘并保留驻留）或 `close`（落盘并释放）。
> 需要「每次变更立即落盘」时设置环境变量 `OFFICECLI_RESIDENT_FLUSH=each`。

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

错误码：`not_found`、`invalid_value`、`unsupported_property`、`invalid_path`、`unsupported_type`、`missing_property`、`file_not_found`、`file_locked`、`invalid_selector`。

---

## 安全边界

- 破坏性操作（`remove`、`move`、`swap`、覆盖式 `batch`）**先向用户确认**
- 不要对用户未提供的文件路径执行写操作
- 不要用 `raw-set` 改写用户未指定的文档部件
- 提交 / 推送等 Git 写操作不在本技能范围内
