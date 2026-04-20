# 测试 - DHH Rails 风格

## 核心理念

"Minitest 配合 fixtures —— 简单、快速、确定性。" 务实优先，不被教条束缚。

## 为什么选 Minitest 不选 RSpec

- **更简单**：少一堆 DSL 魔法，就是普通的 Ruby 断言
- **Rails 自带**：不用额外装依赖
- **启动更快**：开销更少
- **纯 Ruby**：不用学一套专用语法

## 用 Fixtures 做测试数据

不用 factories，fixtures 提供预加载的测试数据：
- 只加载一次，所有测试复用
- 不需要运行时创建对象，省开销
- 数据关系一目了然
- ID 确定，调试方便

### Fixture 结构
```yaml
# test/fixtures/users.yml
david:
  identity: david
  account: basecamp
  role: admin

jason:
  identity: jason
  account: basecamp
  role: member

# test/fixtures/rooms.yml
watercooler:
  name: Water Cooler
  creator: david
  direct: false

# test/fixtures/messages.yml
greeting:
  body: Hello everyone!
  room: watercooler
  creator: david
```

### 在测试中使用 Fixture
```ruby
test "sending a message" do
  user = users(:david)
  room = rooms(:watercooler)

  # 用 fixture 数据测试
end
```

### 动态 Fixture 值
ERB 支持时间相关的数据：
```yaml
recent_card:
  title: Recent Card
  created_at: <%= 1.hour.ago %>

old_card:
  title: Old Card
  created_at: <%= 1.month.ago %>
```

## 测试组织

### 单元测试
用 setup 块和标准断言验证业务逻辑：

```ruby
class CardTest < ActiveSupport::TestCase
  setup do
    @card = cards(:one)
    @user = users(:david)
  end

  test "closing a card creates a closure" do
    assert_difference -> { Card::Closure.count } do
      @card.close(creator: @user)
    end

    assert @card.closed?
    assert_equal @user, @card.closure.creator
  end

  test "reopening a card destroys the closure" do
    @card.close(creator: @user)

    assert_difference -> { Card::Closure.count }, -1 do
      @card.reopen
    end

    refute @card.closed?
  end
end
```

### 集成测试
测试完整的请求/响应周期：

```ruby
class CardsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user = users(:david)
    sign_in @user
  end

  test "closing a card" do
    card = cards(:one)

    post card_closure_path(card)

    assert_response :success
    assert card.reload.closed?
  end

  test "unauthorized user cannot close card" do
    sign_in users(:guest)
    card = cards(:one)

    post card_closure_path(card)

    assert_response :forbidden
    refute card.reload.closed?
  end
end
```

### 系统测试
使用 Capybara 的浏览器测试：

```ruby
class MessagesTest < ApplicationSystemTestCase
  test "sending a message" do
    sign_in users(:david)
    visit room_path(rooms(:watercooler))

    fill_in "Message", with: "Hello, world!"
    click_button "Send"

    assert_text "Hello, world!"
  end

  test "editing own message" do
    sign_in users(:david)
    visit room_path(rooms(:watercooler))

    within "#message_#{messages(:greeting).id}" do
      click_on "Edit"
    end

    fill_in "Message", with: "Updated message"
    click_button "Save"

    assert_text "Updated message"
  end

  test "drag and drop card to new column" do
    sign_in users(:david)
    visit board_path(boards(:main))

    card = find("#card_#{cards(:one).id}")
    target = find("#column_#{columns(:done).id}")

    card.drag_to target

    assert_selector "#column_#{columns(:done).id} #card_#{cards(:one).id}"
  end
end
```

## 进阶模式

### 时间测试
用 `travel_to` 让时间相关的断言确定性：

```ruby
test "card expires after 30 days" do
  card = cards(:one)

  travel_to 31.days.from_now do
    assert card.expired?
  end
end
```

### 用 VCR 测试外部 API
录制并回放 HTTP 交互：

```ruby
test "fetches user data from API" do
  VCR.use_cassette("user_api") do
    user_data = ExternalApi.fetch_user(123)

    assert_equal "John", user_data[:name]
  end
end
```

### 后台任务测试
断言任务入队和邮件投递：

```ruby
test "closing card enqueues notification job" do
  card = cards(:one)

  assert_enqueued_with(job: NotifyWatchersJob, args: [card]) do
    card.close
  end
end

test "welcome email is sent on signup" do
  assert_emails 1 do
    Identity.create!(email: "new@example.com")
  end
end
```

### 测试 Turbo Stream 广播
```ruby
test "message creation broadcasts to room" do
  room = rooms(:watercooler)

  assert_turbo_stream_broadcasts [room, :messages] do
    room.messages.create!(body: "Test", creator: users(:david))
  end
end
```

## 测试原则

### 1. 测试可观测的行为
关注代码做了什么，而不是怎么做的：

```ruby
# ❌ 测试实现细节
test "calls notify method on each watcher" do
  card.expects(:notify).times(3)
  card.close
end

# ✅ 测试行为
test "watchers receive notifications when card closes" do
  assert_difference -> { Notification.count }, 3 do
    card.close
  end
end
```

### 2. 不要什么都 mock

```ruby
# ❌ 过度 mock
test "sending message" do
  room = mock("room")
  user = mock("user")
  message = mock("message")

  room.expects(:messages).returns(stub(create!: message))
  message.expects(:broadcast_create)

  MessagesController.new.create
end

# ✅ 测真实的东西
test "sending message" do
  sign_in users(:david)
  post room_messages_url(rooms(:watercooler)),
    params: { message: { body: "Hello" } }

  assert_response :success
  assert Message.exists?(body: "Hello")
end
```

### 3. 测试和功能一起提交
同一个 commit。不是严格的 TDD 先写测试，也不是做完再补——同步进行。

### 4. 安全修复必须附带回归测试
每一个安全修复都要有一个能捕获该漏洞的测试。

### 5. 集成测试验证完整流程
不要只测单个部件——要测它们组合起来能不能跑通。

## 文件组织

```
test/
├── controllers/         # 控制器集成测试
├── fixtures/            # 所有模型的 YAML fixtures
├── helpers/             # Helper 方法测试
├── integration/         # API 集成测试
├── jobs/                # 后台任务测试
├── mailers/             # 邮件测试
├── models/              # 模型单元测试
├── system/              # 浏览器端系统测试
└── test_helper.rb       # 测试配置
```

## Test Helper 配置

```ruby
# test/test_helper.rb
ENV["RAILS_ENV"] ||= "test"
require_relative "../config/environment"
require "rails/test_help"

class ActiveSupport::TestCase
  fixtures :all

  parallelize(workers: :number_of_processors)
end

class ActionDispatch::IntegrationTest
  include SignInHelper
end

class ApplicationSystemTestCase < ActionDispatch::SystemTestCase
  driven_by :selenium, using: :headless_chrome
end
```

## 登录 Helper

```ruby
# test/support/sign_in_helper.rb
module SignInHelper
  def sign_in(user)
    session = user.identity.sessions.create!
    cookies.signed[:session_id] = session.id
  end
end
```
