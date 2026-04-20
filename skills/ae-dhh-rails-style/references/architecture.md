# 架构 - DHH Rails 风格

<routing>
## 路由

一切映射到 CRUD。关联动作用嵌套资源：

```ruby
Rails.application.routes.draw do
  resources :boards do
    resources :cards do
      resource :closure
      resource :goldness
      resource :not_now
      resources :assignments
      resources :comments
    end
  end
end
```

**动词转名词：**
| 动作 | 资源 |
|------|------|
| 关闭卡片 | `card.closure` |
| 关注看板 | `board.watching` |
| 标记为金色 | `card.goldness` |
| 归档卡片 | `card.archival` |

**浅层嵌套** - 避免 URL 过深：
```ruby
resources :boards do
  resources :cards, shallow: true  # /boards/:id/cards，但 /cards/:id
end
```

**单数资源** 用于一一对应的关系：
```ruby
resource :closure   # 注意是 resource 不是 resources
resource :goldness
```

**用 resolve 简化 URL 生成：**
```ruby
# config/routes.rb
resolve("Comment") { |comment| [comment.card, anchor: dom_id(comment)] }

# 现在 url_for(@comment) 就能正确工作
```
</routing>

<multi_tenancy>
## 多租户（基于 URL 路径）

**中间件从 URL 前缀提取租户：**

```ruby
# lib/tenant_extractor.rb
class TenantExtractor
  def initialize(app)
    @app = app
  end

  def call(env)
    path = env["PATH_INFO"]
    if match = path.match(%r{^/(\d+)(/.*)?$})
      env["SCRIPT_NAME"] = "/#{match[1]}"
      env["PATH_INFO"] = match[2] || "/"
    end
    @app.call(env)
  end
end
```

**Cookie 按租户隔离：**
```ruby
# Cookie 限定在租户路径下
cookies.signed[:session_id] = {
  value: session.id,
  path: "/#{Current.account.id}"
}
```

**后台任务上下文** - 序列化租户信息：
```ruby
class ApplicationJob < ActiveJob::Base
  around_perform do |job, block|
    Current.set(account: job.arguments.first.account) { block.call }
  end
end
```

**周期性任务** 必须遍历所有租户：
```ruby
class DailyDigestJob < ApplicationJob
  def perform
    Account.find_each do |account|
      Current.set(account: account) do
        send_digest_for(account)
      end
    end
  end
end
```

**控制器安全** - 始终通过租户做范围限定：
```ruby
# 好 - 通过用户可访问记录做范围查询
@card = Current.user.accessible_cards.find(params[:id])

# 避免 - 直接查找
@card = Card.find(params[:id])
```
</multi_tenancy>

<authentication>
## 认证

自研无密码 Magic Link 认证（总共约 150 行）：

```ruby
# app/models/session.rb
class Session < ApplicationRecord
  belongs_to :user

  before_create { self.token = SecureRandom.urlsafe_base64(32) }
end

# app/models/magic_link.rb
class MagicLink < ApplicationRecord
  belongs_to :user

  before_create do
    self.code = SecureRandom.random_number(100_000..999_999).to_s
    self.expires_at = 15.minutes.from_now
  end

  def expired?
    expires_at < Time.current
  end
end
```

**为什么不用 Devise：**
- 约 150 行代码 vs 一个庞大的依赖
- 不用存储密码，没有密码泄露风险
- 用户体验更简单
- 完全掌控认证流程

**API 使用 Bearer token：**
```ruby
module Authentication
  extend ActiveSupport::Concern

  included do
    before_action :authenticate
  end

  private
    def authenticate
      if bearer_token = request.headers["Authorization"]&.split(" ")&.last
        Current.session = Session.find_by(token: bearer_token)
      else
        Current.session = Session.find_by(id: cookies.signed[:session_id])
      end

      redirect_to login_path unless Current.session
    end
end
```
</authentication>

<background_jobs>
## 后台任务

Job 只是薄薄一层包装，内部调用模型方法：

```ruby
class NotifyWatchersJob < ApplicationJob
  def perform(card)
    card.notify_watchers
  end
end
```

**命名约定：**
- `_later` 后缀表示异步：`card.notify_watchers_later`
- `_now` 后缀表示同步：`card.notify_watchers_now`

```ruby
module Watchable
  def notify_watchers_later
    NotifyWatchersJob.perform_later(self)
  end

  def notify_watchers_now
    NotifyWatchersJob.perform_now(self)
  end

  def notify_watchers
    watchers.each do |watcher|
      WatcherMailer.notification(watcher, self).deliver_later
    end
  end
end
```

**基于数据库的 Solid Queue：**
- 不需要 Redis
- 与业务数据享有相同的事务保证
- 基础设施更简单

**事务安全：**
```ruby
# config/application.rb
config.active_job.enqueue_after_transaction_commit = true
```

**按类型处理错误：**
```ruby
class DeliveryJob < ApplicationJob
  # 临时性错误 - 指数退避重试
  retry_on Net::OpenTimeout, Net::ReadTimeout,
           Resolv::ResolvError,
           wait: :polynomially_longer

  # 永久性错误 - 记录日志并丢弃
  discard_on Net::SMTPSyntaxError do |job, error|
    Sentry.capture_exception(error, level: :info)
  end
end
```

**批量处理** 使用 continuable：
```ruby
class ProcessCardsJob < ApplicationJob
  include ActiveJob::Continuable

  def perform
    Card.in_batches.each_record do |card|
      checkpoint!  # 中断后从这里恢复
      process(card)
    end
  end
end
```
</background_jobs>

<database_patterns>
## 数据库模式

**主键用 UUID**（时间可排序的 UUIDv7）：
```ruby
# migration
create_table :cards, id: :uuid do |t|
  t.references :board, type: :uuid, foreign_key: true
end
```

好处：避免 ID 被枚举、适合分布式、支持客户端生成。

**用记录表示状态**（而非布尔值）：
```ruby
# 代替 closed: boolean
class Card::Closure < ApplicationRecord
  belongs_to :card
  belongs_to :creator, class_name: "User"
end

# 查询变成 join
Card.joins(:closure)          # 已关闭
Card.where.missing(:closure)  # 未关闭
```

**硬删除** - 不做软删除：
```ruby
# 直接 destroy
card.destroy!

# 用事件记录历史
card.record_event(:deleted, by: Current.user)
```

简化查询，用事件日志做审计。

**计数缓存** 提升性能：
```ruby
class Comment < ApplicationRecord
  belongs_to :card, counter_cache: true
end

# card.comments_count 无需额外查询
```

**每张表都带 Account 外键：**
```ruby
class Card < ApplicationRecord
  belongs_to :account
  default_scope { where(account: Current.account) }
end
```
</database_patterns>

<current_attributes>
## Current 属性

用 `Current` 存储请求级别的状态：

```ruby
# app/models/current.rb
class Current < ActiveSupport::CurrentAttributes
  attribute :session, :user, :account, :request_id

  delegate :user, to: :session, allow_nil: true

  def account=(account)
    super
    Time.zone = account&.time_zone || "UTC"
  end
end
```

在控制器中设置：
```ruby
class ApplicationController < ActionController::Base
  before_action :set_current_request

  private
    def set_current_request
      Current.session = authenticated_session
      Current.account = Account.find(params[:account_id])
      Current.request_id = request.request_id
    end
end
```

在应用各处使用：
```ruby
class Card < ApplicationRecord
  belongs_to :creator, default: -> { Current.user }
end
```
</current_attributes>

<caching>
## 缓存

**HTTP 缓存** 用 ETag：
```ruby
fresh_when etag: [@card, Current.user.timezone]
```

**片段缓存：**
```erb
<% cache card do %>
  <%= render card %>
<% end %>
```

**俄罗斯套娃缓存：**
```erb
<% cache @board do %>
  <% @board.cards.each do |card| %>
    <% cache card do %>
      <%= render card %>
    <% end %>
  <% end %>
<% end %>
```

**缓存失效** 通过 `touch: true`：
```ruby
class Card < ApplicationRecord
  belongs_to :board, touch: true
end
```

**Solid Cache** - 基于数据库：
- 不需要 Redis
- 与应用数据保持一致
- 基础设施更简单
</caching>

<configuration>
## 配置

**ENV.fetch 带默认值：**
```ruby
# config/application.rb
config.active_job.queue_adapter = ENV.fetch("QUEUE_ADAPTER", "solid_queue").to_sym
config.cache_store = ENV.fetch("CACHE_STORE", "solid_cache").to_sym
```

**多数据库：**
```yaml
# config/database.yml
production:
  primary:
    <<: *default
  cable:
    <<: *default
    migrations_paths: db/cable_migrate
  queue:
    <<: *default
    migrations_paths: db/queue_migrate
  cache:
    <<: *default
    migrations_paths: db/cache_migrate
```

**通过 ENV 切换 SQLite 和 MySQL：**
```ruby
adapter = ENV.fetch("DATABASE_ADAPTER", "sqlite3")
```

**CSP 通过 ENV 扩展：**
```ruby
config.content_security_policy do |policy|
  policy.default_src :self
  policy.script_src :self, *ENV.fetch("CSP_SCRIPT_SRC", "").split(",")
end
```
</configuration>

<testing>
## 测试

**用 Minitest**，不用 RSpec：
```ruby
class CardTest < ActiveSupport::TestCase
  test "closing a card creates a closure" do
    card = cards(:one)

    card.close

    assert card.closed?
    assert_not_nil card.closure
  end
end
```

**用 Fixtures** 代替 factories：
```yaml
# test/fixtures/cards.yml
one:
  title: First Card
  board: main
  creator: alice

two:
  title: Second Card
  board: main
  creator: bob
```

**集成测试** 测试控制器：
```ruby
class CardsControllerTest < ActionDispatch::IntegrationTest
  test "closing a card" do
    card = cards(:one)
    sign_in users(:alice)

    post card_closure_path(card)

    assert_response :success
    assert card.reload.closed?
  end
end
```

**测试和功能一起提交** - 同一个 commit，不是严格的 TDD，但也不会延后补测试。

**安全修复必须附带回归测试** - 无一例外。
</testing>

<events>
## 事件追踪

事件是唯一的真相来源：

```ruby
class Event < ApplicationRecord
  belongs_to :creator, class_name: "User"
  belongs_to :eventable, polymorphic: true

  serialize :particulars, coder: JSON
end
```

**Eventable concern：**
```ruby
module Eventable
  extend ActiveSupport::Concern

  included do
    has_many :events, as: :eventable, dependent: :destroy
  end

  def record_event(action, particulars = {})
    events.create!(
      creator: Current.user,
      action: action,
      particulars: particulars
    )
  end
end
```

**Webhook 由事件驱动** - 事件是权威数据源。
</events>

<email_patterns>
## 邮件模式

**多租户 URL helper：**
```ruby
class ApplicationMailer < ActionMailer::Base
  def default_url_options
    options = super
    if Current.account
      options[:script_name] = "/#{Current.account.id}"
    end
    options
  end
end
```

**按时区投递：**
```ruby
class NotificationMailer < ApplicationMailer
  def daily_digest(user)
    Time.use_zone(user.timezone) do
      @user = user
      @digest = user.digest_for_today
      mail(to: user.email, subject: "Daily Digest")
    end
  end
end
```

**批量投递：**
```ruby
emails = users.map { |user| NotificationMailer.digest(user) }
ActiveJob.perform_all_later(emails.map(&:deliver_later))
```

**一键退订（RFC 8058）：**
```ruby
class ApplicationMailer < ActionMailer::Base
  after_action :set_unsubscribe_headers

  private
    def set_unsubscribe_headers
      headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
      headers["List-Unsubscribe"] = "<#{unsubscribe_url}>"
    end
end
```
</email_patterns>

<security_patterns>
## 安全模式

**XSS 防护** - 在 helper 中转义：
```ruby
def formatted_content(text)
  # 先转义，再标记为安全
  simple_format(h(text)).html_safe
end
```

**SSRF 防护：**
```ruby
# DNS 只解析一次，锁定 IP
def fetch_safely(url)
  uri = URI.parse(url)
  ip = Resolv.getaddress(uri.host)

  # 拦截内网地址
  raise "Private IP" if private_ip?(ip)

  # 用锁定的 IP 发起请求
  Net::HTTP.start(uri.host, uri.port, ipaddr: ip) { |http| ... }
end

def private_ip?(ip)
  ip.start_with?("127.", "10.", "192.168.") ||
    ip.match?(/^172\.(1[6-9]|2[0-9]|3[0-1])\./)
end
```

**Content Security Policy：**
```ruby
# config/initializers/content_security_policy.rb
Rails.application.configure do
  config.content_security_policy do |policy|
    policy.default_src :self
    policy.script_src :self
    policy.style_src :self, :unsafe_inline
    policy.base_uri :none
    policy.form_action :self
    policy.frame_ancestors :self
  end
end
```

**ActionText 内容消毒：**
```ruby
# config/initializers/action_text.rb
Rails.application.config.after_initialize do
  ActionText::ContentHelper.allowed_tags = %w[
    strong em a ul ol li p br h1 h2 h3 h4 blockquote
  ]
end
```
</security_patterns>

<active_storage>
## Active Storage 模式

**变体预处理：**
```ruby
class User < ApplicationRecord
  has_one_attached :avatar do |attachable|
    attachable.variant :thumb, resize_to_limit: [100, 100], preprocessed: true
    attachable.variant :medium, resize_to_limit: [300, 300], preprocessed: true
  end
end
```

**延长直传过期时间** - 照顾慢速网络：
```ruby
# config/initializers/active_storage.rb
Rails.application.config.active_storage.service_urls_expire_in = 48.hours
```

**头像优化** - 重定向到 blob：
```ruby
def show
  expires_in 1.year, public: true
  redirect_to @user.avatar.variant(:thumb).processed.url, allow_other_host: true
end
```

**Mirror 服务** 用于存储迁移：
```yaml
# config/storage.yml
production:
  service: Mirror
  primary: amazon
  mirrors: [google]
```
</active_storage>
