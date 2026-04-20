# Gems - DHH Rails 风格

<what_they_use>
## 37signals 在用什么

**核心 Rails 全家桶：**
- turbo-rails, stimulus-rails, importmap-rails
- propshaft（资源管线）

**基于数据库的服务（Solid 三件套）：**
- solid_queue - 后台任务
- solid_cache - 缓存
- solid_cable - WebSocket / Action Cable

**认证与安全：**
- bcrypt（需要密码哈希时使用）

**自研 gems：**
- geared_pagination（游标分页）
- lexxy（富文本编辑器）
- mittens（邮件工具）

**工具库：**
- rqrcode（二维码生成）
- redcarpet + rouge（Markdown 渲染）
- web-push（推送通知）

**部署与运维：**
- kamal（Docker 部署）
- thruster（HTTP/2 代理）
- mission_control-jobs（任务监控）
- autotuner（GC 调优）
</what_they_use>

<what_they_avoid>
## 刻意不用的东西

**认证：**
```
devise → 自研约 150 行的认证
```
原因：完全掌控流程，magic link 不用存密码，更简单。

**授权：**
```
pundit/cancancan → 模型上写简单角色检查
```
原因：大多数应用不需要 Policy 对象。模型上加一个方法就够了：
```ruby
class Board < ApplicationRecord
  def editable_by?(user)
    user.admin? || user == creator
  end
end
```

**后台任务：**
```
sidekiq → Solid Queue
```
原因：基于数据库意味着不需要 Redis，而且享有相同的事务保证。

**缓存：**
```
redis → Solid Cache
```
原因：数据库已经有了，基础设施更简单。

**搜索：**
```
elasticsearch → 自研分片搜索
```
原因：精确构建所需功能，不依赖外部服务。

**视图层：**
```
view_component → 标准 partial
```
原因：partial 够用了。ViewComponents 在他们的场景下增加了复杂度却没带来明显收益。

**API：**
```
GraphQL → REST 配合 Turbo
```
原因：前后端都自己控制时 REST 完全够用。GraphQL 的复杂度不划算。

**测试数据：**
```
factory_bot → Fixtures
```
原因：Fixtures 更简单、更快，还逼着你提前想清楚数据关系。

**Service Object：**
```
Interactor, Trailblazer → 胖模型
```
原因：业务逻辑留在模型里。用 `card.close` 而不是 `CardCloser.call(card)`。

**Form Object：**
```
Reform, dry-validation → params.expect + 模型校验
```
原因：Rails 7.1 的 `params.expect` 已经够清晰了。上下文相关的校验放模型上。

**装饰器：**
```
Draper → View helper + partial
```
原因：Helper 和 partial 更简单，不需要装饰器这层间接。

**CSS：**
```
Tailwind, Sass → 原生 CSS
```
原因：现代 CSS 已经支持嵌套、变量、@layer，不需要构建步骤。

**前端框架：**
```
React, Vue, SPA → Turbo + Stimulus
```
原因：服务端渲染 HTML 加少量 JS。SPA 的复杂度不值得。

**测试框架：**
```
RSpec → Minitest
```
原因：更简单、启动更快、少一堆 DSL、Rails 自带。
</what_they_avoid>

<testing_philosophy>
## 测试理念

**Minitest** - 更简单、更快：
```ruby
class CardTest < ActiveSupport::TestCase
  test "closing creates closure" do
    card = cards(:one)
    assert_difference -> { Card::Closure.count } do
      card.close
    end
    assert card.closed?
  end
end
```

**Fixtures** - 只加载一次，数据确定：
```yaml
# test/fixtures/cards.yml
open_card:
  title: Open Card
  board: main
  creator: alice

closed_card:
  title: Closed Card
  board: main
  creator: bob
```

**动态时间戳** 用 ERB：
```yaml
recent:
  title: Recent
  created_at: <%= 1.hour.ago %>

old:
  title: Old
  created_at: <%= 1.month.ago %>
```

**时间穿越** 测试时间相关的逻辑：
```ruby
test "expires after 15 minutes" do
  magic_link = MagicLink.create!(user: users(:alice))

  travel 16.minutes

  assert magic_link.expired?
end
```

**VCR** 测试外部 API：
```ruby
VCR.use_cassette("stripe/charge") do
  charge = Stripe::Charge.create(amount: 1000)
  assert charge.paid
end
```

**测试和功能一起提交** - 同一个 commit，不提前也不延后。
</testing_philosophy>

<decision_framework>
## 选型决策框架

加一个 gem 之前，先问：

1. **原生 Rails 能不能做？**
   - ActiveRecord 能覆盖 Sequel 的大部分场景
   - ActionMailer 处理邮件够用了
   - ActiveJob 满足多数任务队列需求

2. **引入的复杂度值得吗？**
   - 150 行自研代码 vs 一个一万行的 gem
   - 自己写的代码更容易理解
   - 升级时少踩坑

3. **会不会引入额外的基础设施？**
   - 要 Redis？看看有没有基于数据库的替代方案
   - 要外部服务？考虑能不能自研
   - 基础设施越简单，故障点越少

4. **维护者靠不靠谱？**
   - 37signals 的 gem：经过大规模验证
   - 维护良好、专注的小 gem：通常没问题
   - 大而全的 gem：大概率杀鸡用牛刀

**一句话总结：**
> "先自己写方案，再考虑找 gem。"

不是排斥 gem，而是推崇理解。只有 gem 确实解决了你当下遇到的问题时才用，不要为了可能遇到的问题提前引入。
</decision_framework>

<gem_patterns>
## Gem 使用示例

**分页：**
```ruby
# geared_pagination - 游标分页
class CardsController < ApplicationController
  def index
    @cards = @board.cards.geared(page: params[:page])
  end
end
```

**Markdown：**
```ruby
# redcarpet + rouge
class MarkdownRenderer
  def self.render(text)
    Redcarpet::Markdown.new(
      Redcarpet::Render::HTML.new(filter_html: true),
      autolink: true,
      fenced_code_blocks: true
    ).render(text)
  end
end
```

**后台任务：**
```ruby
# solid_queue - 不需要 Redis
class ApplicationJob < ActiveJob::Base
  queue_as :default
  # 基于数据库，开箱即用
end
```

**缓存：**
```ruby
# solid_cache - 不需要 Redis
# config/environments/production.rb
config.cache_store = :solid_cache_store
```
</gem_patterns>
