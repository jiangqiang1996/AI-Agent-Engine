# 边界情况处理（Edge Cases）

## 环境类

- **`ocr` 未安装 / 命令找不到**：向用户报告并给出安装命令 `npm install -g @alibaba-group/open-code-review`；全局安装受限时可用 `npx @alibaba-group/open-code-review <子命令与参数>` 临时执行（需联网，首次运行下载平台二进制）。用户拒绝安装则终止流程，已产出的 run dir 留档
- **版本过旧**（`--format` 报 `unknown flag`）：升级命令同上；无法升级时按 `cli-reference.md` 的"CLI 版本兼容性"降级到文本输出
- **Git 版本低于 2.41**：差异模式可能异常，报告 Git 版本要求；全项目模式与 direct 模式可用

## Git 边界类

- **非 Git 仓库**：`ocr scan --preview` 正常枚举目录文件；`ocr delegate preview` / `ocr delegate rule` 报 `is not a git repository`——差异模式整体不可用，改用全项目模式或 direct 模式，规则解析走下方"通用审查规则"兜底
- **工作区干净**：`git status --porcelain` 无输出时报告"工作区无待审查改动"，建议全项目模式或指定范围；勿误报为"文件被排除"
- **子目录 / worktree / CI 中调用**：`ocr delegate` 按当前目录定位仓库，用 `--repo` 显式指向仓库根，避免 preview 输出与预期分支不符
- **未跟踪文件**：`git diff` 无输出，直接读取整个文件（SKILL.md 第四步）

## 规则类

- **`ocr delegate rule` 整体失败**（非 Git 目录、rule.json 损坏）：全部文件走**通用审查规则**（见下），`rules.json` 省略，汇总报告标注"自定义规则解析失败已兜底"
- **单路径规则解析失败**：仅对该文件用通用审查规则
- **rule.json 带 BOM / 非法 JSON**：所有子命令报 `load rules: unmarshal project rule: invalid character ...`；修复方式见 `cli-reference.md` 的"编码硬约束"
- **命令行参数过长**：`ocr delegate rule` 参数超系统限制时分批调用，按 `pattern` + `source` 归并（`group_id` 为单次调用内编号，不可作合并键）

### 通用审查规则（兜底文本，随任务下发）

```markdown
#### Correctness（正确性）
逻辑是否正确？是否有遗漏的边界条件？异常是否被妥善处理？并发场景下是否线程安全？

#### Security（安全）
是否存在 SQL 注入、XSS 等安全漏洞？敏感信息处理是否正确？权限校验是否完整？

#### Performance（性能）
是否存在明显性能问题（N+1 查询、不必要的循环）？资源是否正确释放？

#### Maintainability（可维护性）
代码是否清晰易懂？命名是否准确表达意图？是否遵循项目既有代码风格与架构模式？

#### Test Coverage（测试覆盖）
关键逻辑路径是否有对应测试用例？测试是否覆盖边界条件？
```

## 清单与规模类

- **`reviewable_count` 为 0**：区分"工作区干净"与"文件全被排除"两种原因后分别报告（见 SKILL.md 第二步）
- **超大变更集 / 超大仓库**（> 50 个待审查文件）：按 `insertions` 降序优先审查大文件；全项目模式用 `--path` 收敛到源码目录，或分波派发并先向用户报告计划
- **全项目模式混入非源码**：锁文件、LICENSE、根配置、点目录内 JSON 默认可审查（`.md` 等文档类默认 `unsupported_ext` 排除）；用户只关心源码时用 `--path` / `--exclude` 收敛，并在汇总中说明。审查文档类文件走 direct 模式显式指定（rule 命令对 `.md` 能解析出通用规则组）
- **二进制文件**：OCR 自动过滤，无需处理
- **run dir 产物混入清单**：project 模式命令固定携带 `--exclude ".ocr-review/**"`；发现清单中仍有 `.ocr-review/` 条目（旧版本 OCR 行为差异）时，主代理在第二步过滤阶段手动剔除并留档说明

## 子代理类

- **子代理超时 / 失败**：单个子代理失败不影响其他子代理；失败批次标注后尽快补派（新序号追加，覆盖已有结果属禁止行为）；补派仍失败的文件在汇总跳过明细中标"审查失败（尝试 N 次）"
- **只读子代理无法写结果文件**：属正常路径，主代理把子代理回复的完整结果文本落盘（见 `subagent-dispatch.md` 双路径）
- **结果文件为空 / 缺文件处置段**：视为该批失败，按补派流程处理

## 产物类

- **历史 run 目录堆积**：`.ocr-review/` 下旧目录可整体删除；报告路径已在对话中给出，删除旧 run 不影响新审查
- **同名 run-id 重跑**：目录复用、同名产物覆盖、`results/` 清空后重新派发（见 SKILL.md 第零步）
