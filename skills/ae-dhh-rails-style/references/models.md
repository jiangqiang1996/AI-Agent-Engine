# 模型 - DHH Rails 风格

<model_concerns>
## 用 Concern 横向组合行为

模型大量使用 concern。一个典型的 Card 模型会 include 14 个以上的 concern：

```ruby
class Card < ApplicationRecord
  include Assignable
  include Attachments
  include Broadcastable
  include Closeable
  include Colored
  include Eventable
  include Golden
  include Mentions
  include Multistep
  include Pinnable
  include Postponable
  include Readable
  include Searchable
  include Taggable
  include Watchable
end
```

每个 concern 自包含：关联、scope、方法放在一起。

**命名：** 用形容词描述能力（`Closeable`、`Publishable`、`Watchable`）
</model_concerns>

<state_records>
## 用记录表示状态，而非布尔值

不要加布尔列，而是创建独立的记录：

```ruby
# 不要这样：
closed: boolean
is_golden: boolean
postponed: boolean

# 这样做：
class Card::Closure < ApplicationRecord
  belongs_to :card
  belongs_to :creator, class_name: "User"
end

class Card::Goldness < ApplicationRecord
  belongs_to :card
  belongs_to :creator, class_name: "User"
end

class Card::NotNow < ApplicationRecord
  belongs_to :card
  belongs_to :creator, class_name: "User"
end
```

**好处：**
- 自动记录时间戳（什么时候发生的）
- 能追踪是谁做的
- 通过 join 和 `where.missing` 轻松筛选
- 界面上可以展示何时、何人

**在模型中：**
```ruby
module Closeable
  extend ActiveSupport::Concern

  included do
    has_one :closure, dependent: :destroy
  end

  def closed?
    closure.present?
  end

  def close(creator: Current.user)
    create_closure!(creator: creator)
  end

  def reopen
    closure&.destroy
  end
end
```

**查询：**
```ruby
Card.joins(:closure)         # 已关闭的卡片
Card.where.missing(:closure) # 未关闭的卡片
```
</state_records>

<callbacks>
## 回调 - 谨慎使用

Fizzy 项目的 30 个文件中总共只有 38 处回调。使用原则：

**适合用的场景：**
- `after_commit` 触发异步工作
- `before_save` 计算派生数据
- `after_create_commit` 触发副作用

**应该避免的：**
- 复杂的回调链
- 在回调中放业务逻辑
- 在回调中做同步外部调用

```ruby
class Card < ApplicationRecord
  after_create_commit :notify_watchers_later
  before_save :update_search_index, if: :title_changed?

  private
    def notify_watchers_later
      NotifyWatchersJob.perform_later(self)
    end
end
```
</callbacks>

<scopes>
## Scope 命名

标准的 scope 名称：

```ruby
class Card < ApplicationRecord
  scope :chronologically, -> { order(created_at: :asc) }
  scope :reverse_chronologically, -> { order(created_at: :desc) }
  scope :alphabetically, -> { order(title: :asc) }
  scope :latest, -> { reverse_chronologically.limit(10) }

  # 标准的预加载
  scope :preloaded, -> { includes(:creator, :assignees, :tags) }

  # 带参数的
  scope :indexed_by, ->(column) { order(column => :asc) }
  scope :sorted_by, ->(column, direction = :asc) { order(column => direction) }
end
```
</scopes>

<poros>
## 纯 Ruby 对象（PORO）

PORO 放在父模型的命名空间下：

```ruby
# app/models/event/description.rb
class Event::Description
  def initialize(event)
    @event = event
  end

  def to_s
    # 事件描述的展示逻辑
  end
end

# app/models/card/eventable/system_commenter.rb
class Card::Eventable::SystemCommenter
  def initialize(card)
    @card = card
  end

  def comment(message)
    # 业务逻辑
  end
end

# app/models/user/filtering.rb
class User::Filtering
  # 视图上下文打包
end
```

**不用来写 Service Object。** 业务逻辑留在模型里。
</poros>

<verbs_predicates>
## 方法命名

**动词** - 改变状态的动作：
```ruby
card.close
card.reopen
card.gild      # 设为金色
card.ungild
board.publish
board.archive
```

**谓词** - 从状态派生的查询：
```ruby
card.closed?    # closure.present?
card.golden?    # goldness.present?
board.published?
```

**不要用** 泛化的 setter：
```ruby
# 不好
card.set_closed(true)
card.update_golden_status(false)

# 好
card.close
card.ungild
```
</verbs_predicates>

<validation_philosophy>
## 校验理念

模型上只做最少的校验。上下文相关的校验放在 Form/Operation 对象上：

```ruby
# 模型 - 最少校验
class User < ApplicationRecord
  validates :email, presence: true, format: { with: URI::MailTo::EMAIL_REGEXP }
end

# Form 对象 - 上下文校验
class Signup
  include ActiveModel::Model

  attr_accessor :email, :name, :terms_accepted

  validates :email, :name, presence: true
  validates :terms_accepted, acceptance: true

  def save
    return false unless valid?
    User.create!(email: email, name: name)
  end
end
```

**数据完整性优先用数据库约束**，而不是模型校验：
```ruby
# migration 中
add_index :users, :email, unique: true
add_foreign_key :cards, :boards
```
</validation_philosophy>

<error_handling>
## 让它崩的理念

使用带叹号的方法，失败时直接抛异常：

```ruby
# 推荐 - 失败时抛异常
@card = Card.create!(card_params)
@card.update!(title: new_title)
@comment.destroy!

# 避免 - 静默失败
@card = Card.create(card_params)  # 失败时返回 false
if @card.save
  # ...
end
```

让错误自然向上传播。Rails 会把 ActiveRecord::RecordInvalid 处理为 422 响应。
</error_handling>

<default_values>
## 用 Lambda 设置默认值

关联中需要 Current 时，用 lambda 设置默认值：

```ruby
class Card < ApplicationRecord
  belongs_to :creator, class_name: "User", default: -> { Current.user }
  belongs_to :account, default: -> { Current.account }
end

class Comment < ApplicationRecord
  belongs_to :commenter, class_name: "User", default: -> { Current.user }
end
```

Lambda 确保在创建时刻动态求值。
</default_values>

<rails_71_patterns>
## Rails 7.1+ 模型模式

**Normalizes** - 校验前先清洗数据：
```ruby
class User < ApplicationRecord
  normalizes :email, with: ->(email) { email.strip.downcase }
  normalizes :phone, with: ->(phone) { phone.gsub(/\D/, "") }
end
```

**Delegated Types** - 替代多态关联：
```ruby
class Message < ApplicationRecord
  delegated_type :messageable, types: %w[Comment Reply Announcement]
end

# 现在可以这样用：
message.comment?        # 如果是 Comment 则返回 true
message.comment         # 返回 Comment 实例
Message.comments        # 类型为 Comment 的消息 scope
```

**Store Accessor** - 结构化的 JSON 存储：
```ruby
class User < ApplicationRecord
  store :settings, accessors: [:theme, :notifications_enabled], coder: JSON
end

user.theme = "dark"
user.notifications_enabled = true
```
</rails_71_patterns>

<concern_guidelines>
## Concern 编写指南

- 每个 concern **50-150 行**（多数在 100 行左右）
- **高内聚** - 只放相关联的功能
- **按能力命名** - `Closeable`、`Watchable`，不要叫 `CardHelpers`
- **自包含** - 关联、scope、方法放在一起
- **不要只为了分类而拆** - 确实需要复用时才创建

**Touch 链** 用于缓存失效：
```ruby
class Comment < ApplicationRecord
  belongs_to :card, touch: true
end

class Card < ApplicationRecord
  belongs_to :board, touch: true
end
```

评论更新时，card 的 `updated_at` 会变，继而级联到 board。

**事务包装** 用于关联更新：
```ruby
class Card < ApplicationRecord
  def close(creator: Current.user)
    transaction do
      create_closure!(creator: creator)
      record_event(:closed)
      notify_watchers_later
    end
  end
end
```
</concern_guidelines>
