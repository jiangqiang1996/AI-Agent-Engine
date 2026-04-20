---
name: ae:dhh-rails-style
description: "编写 Ruby/Rails 代码时应用 DHH 与 37signals 的编码风格。适用于模型、控制器、路由等 Ruby 文件的编写、重构和审查，也适用于用户提及 DHH、37signals、Basecamp、HEY、Campfire 等关键词的场景。核心理念：纯 REST、胖模型瘦控制器、Current 属性、Hotwire 模式，以及"清晰胜过取巧"。通过 skill 工具按需加载。"
---

<objective>
将 37signals/DHH 的 Rails 约定应用到 Ruby 和 Rails 代码中。本技能提供全面的领域知识，内容来源于对 37signals 生产代码库（Fizzy/Campfire）的分析以及 DHH 的代码审查模式。
</objective>

<essential_principles>
## 核心哲学

"最好的代码是不用写的代码。其次是一看就知道是对的代码。"

**原生 Rails 就够了：**
- 丰富的领域模型，不用 Service Object
- CRUD 控制器，不加自定义动作
- Concern 做横向代码共享
- 用记录表示状态，不用布尔列
- 一切基于数据库（不用 Redis）
- 先自己写方案，再考虑找 gem

**刻意不用的东西：**
- devise（自研约 150 行认证）
- pundit/cancancan（模型上写简单角色检查）
- sidekiq（Solid Queue 基于数据库）
- redis（一切用数据库）
- view_component（partial 就够了）
- GraphQL（REST 配合 Turbo 完全够用）
- factory_bot（fixtures 更简单）
- rspec（Minitest 是 Rails 自带的）
- Tailwind（原生 CSS 配合 @layer）

**开发理念：**
- 先发布、再验证、后打磨 —— 用原型级代码上生产来学习
- 修根因，不修症状
- 写入时预计算，而非读取时计算
- 数据库约束优先于 ActiveRecord 校验
</essential_principles>

<intake>
你在做什么？

1. **控制器** - REST 映射、concern、Turbo 响应、API 模式
2. **模型** - Concern、状态记录、回调、scope、PORO
3. **视图与前端** - Turbo、Stimulus、CSS、partial
4. **架构** - 路由、多租户、认证、后台任务、缓存
5. **测试** - Minitest、fixtures、集成测试
6. **Gem 与依赖** - 该用什么、该避开什么
7. **代码审查** - 按 DHH 风格审查代码
8. **通用指导** - 哲学与约定

**输入编号或描述你的任务。**
</intake>

<routing>

| 回答内容 | 读取的参考文件 |
|----------|----------------|
| 1, 控制器 | `references/controllers.md` |
| 2, 模型 | `references/models.md` |
| 3, 视图, 前端, turbo, stimulus, css | `references/frontend.md` |
| 4, 架构, 路由, 认证, 任务, 缓存 | `references/architecture.md` |
| 5, 测试, minitest, fixture | `references/testing.md` |
| 6, gem, 依赖, 库 | `references/gems.md` |
| 7, 审查 | 读取全部参考文件，然后审查代码 |
| 8, 通用任务 | 根据上下文读取相关参考文件 |

**读取相关参考文件后，将模式应用到用户的代码中。**
</routing>

<quick_reference>
## 命名约定

**动词：** `card.close`、`card.gild`、`board.publish`（不要写成 `set_style` 这样的方法名）

**谓词：** `card.closed?`、`card.golden?`（由关联记录是否存在派生）

**Concern：** 用形容词描述能力（`Closeable`、`Publishable`、`Watchable`）

**控制器：** 用名词匹配资源（`Cards::ClosuresController`）

**Scope：**
- `chronologically`、`reverse_chronologically`、`alphabetically`、`latest`
- `preloaded`（标准的预加载命名）
- `indexed_by`、`sorted_by`（带参数的）
- `active`、`unassigned`（业务术语，不是 SQL 风格）

## REST 映射

不要加自定义动作，而是创建新资源：

```
POST /cards/:id/close    → POST /cards/:id/closure
DELETE /cards/:id/close  → DELETE /cards/:id/closure
POST /cards/:id/archive  → POST /cards/:id/archival
```

## Ruby 语法偏好

```ruby
# 符号数组括号内加空格
before_action :set_message, only: %i[ show edit update destroy ]

# private 方法缩进
  private
    def set_message
      @message = Message.find(params[:id])
    end

# 无表达式的 case 做条件分支
case
when params[:before].present?
  messages.page_before(params[:before])
else
  messages.last_page
end

# 带叹号的方法快速失败
@message = Message.create!(params)

# 简单条件用三元表达式
@room.direct? ? @room.users : @message.mentionees
```

## 关键模式

**用记录表示状态：**
```ruby
Card.joins(:closure)         # 已关闭的卡片
Card.where.missing(:closure) # 未关闭的卡片
```

**Current 属性：**
```ruby
belongs_to :creator, default: -> { Current.user }
```

**模型上的授权：**
```ruby
class User < ApplicationRecord
  def can_administer?(message)
    message.creator == self || admin?
  end
end
```
</quick_reference>

<reference_index>
## 领域知识

所有详细模式在 `references/` 中：

| 文件 | 涵盖内容 |
|------|----------|
| `references/controllers.md` | REST 映射、concern、Turbo 响应、API 模式、HTTP 缓存 |
| `references/models.md` | Concern、状态记录、回调、scope、PORO、授权、广播 |
| `references/frontend.md` | Turbo Stream、Stimulus 控制器、CSS @layer、OKLCH 颜色、partial |
| `references/architecture.md` | 路由、认证、后台任务、Current 属性、缓存、数据库模式 |
| `references/testing.md` | Minitest、fixtures、单元/集成/系统测试、测试模式 |
| `references/gems.md` | 用什么、不用什么、选型决策框架、使用示例 |
</reference_index>

<success_criteria>
代码符合 DHH 风格的标准：
- 控制器映射到资源的 CRUD 动词
- 模型用 concern 横向组合行为
- 状态通过记录追踪，不用布尔值
- 没有多余的 Service Object 或过度抽象
- 优先选择基于数据库的方案而非外部服务
- 测试用 Minitest 配合 fixtures
- 交互用 Turbo/Stimulus（不用重型 JS 框架）
- CSS 用原生现代特性（@layer、OKLCH、嵌套）
- 授权逻辑放在 User 模型上
- Job 只是薄包装，内部调用模型方法
</success_criteria>

<credits>
基于 [The Unofficial 37signals/DHH Rails Style Guide](https://github.com/marckohlbrugge/unofficial-37signals-coding-style-guide) by [Marc Köhlbrugge](https://x.com/marckohlbrugge)，通过深度分析 Fizzy 代码库的 265 个 Pull Request 生成。

**免责声明：**
- 本指南由 LLM 生成，可能存在不准确之处
- Fizzy 的代码示例遵循 O'Saasy License
- 与 37signals 无关联，也未经其认可
</credits>
