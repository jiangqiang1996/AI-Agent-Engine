# 工具索引

按 `id` 查主 scene。对工具名或用法不确定时，先 `wechatide <id> -h`（或 `--help`），再调用；亦可查 `tools.yaml`。

`tools.yaml` 的 `scenes` **第一项为主归属**；多项时其余为可借用 scene，勿跨 scene 随便混用。

| id | scene | 摘要 |
|----|-------|------|
| `check_wechatide_status` | wechatide-initializer | 只读获取登录态（loginExpired）、当前用户（loginUser）、skill 版本关系（versionRelation）、CLI 可选令牌（cl... |
| `close_project_window` | wechatide-initializer | 关闭包含模拟器的项目窗口，不等于完全退出微信开发者工具 |
| `open_project_window` | wechatide-initializer | 打开包含模拟器的项目窗口。如果之前窗口已存在，则不打开新窗口，直接返回已打开的窗口 ID |
| `quit` | wechatide-initializer | 关闭 WechatIDE。 |
| `login` | wechatide-initializer | 触发扫码登录并返回 taskId；可打开独立置顶窗口，或直接向 agent 返回二维码图片。 |
| `polling_task_result` | wechatide-initializer（主；亦可 wechatide-project-manager, wechatide-compiler, wechatide-previewer, wechatide-debugger, wechatide-automator, wechatide-cloudbase-operator） | 通用异步结果查询：任何需要用户授权、扫码或操作确认的 toolCall 都会返回 taskId。 |
| `project_import` | wechatide-project-manager | 将本地项目目录导入到微信开发者工具项目列表，不打开项目窗口；路径已在列表中时返回 alreadyImported。 |
| `share_minicode` | wechatide-project-manager | 将本地项目分享为代码片段并返回链接，不打开项目窗口。 |
| `import_minicode` | wechatide-project-manager | 通过代码片段链接导入项目并加入项目列表，不打开项目窗口；导入后须先检查代码安全性。 |
| `project_list` | wechatide-project-manager | 只读列出微信开发者工具已导入的项目列表；默认返回主列表（小程序/小游戏等），可通过 scope 查看其他项目。不等于打开项目窗口。 |
| `project_remove` | wechatide-project-manager | 从项目列表移除项目，不删除磁盘文件，不等于关闭整个微信开发者工具。 |
| `auto_preview` | wechatide-previewer | 把预览直接推送到开发者微信，无需生成二维码文件。 |
| `build_npm` | wechatide-compiler | 构建 npm。 |
| `create_preview_qrcode` | wechatide-previewer | 生成可扫码的小程序预览二维码。默认使用 qr-format=window 在新窗口中展示，无需指定本地输出路径。 |
| `upload` | wechatide-previewer | 上传代码包(发布体验版)。仅在用户明确要求「上传代码」或者「发布体验版」时调用。 |
| `simulator_open_page` | wechatide-compiler | 触发项目窗口模拟器编译并打开指定页面。 |
| `simulator_refresh` | wechatide-compiler | 触发项目窗口模拟器重新编译/刷新当前页面；不返回编译结果 |
| `get_simulator_console` | wechatide-debugger | 对小程序 console 缓冲区执行 grep 过滤并返回命中行。command 是 grep 命令字符串（不含文件名），如 'grep -i error... |
| `get_simulator_network` | wechatide-debugger | 对小程序 network 缓冲区执行 grep 过滤并返回命中行。command 是 grep 命令字符串（不含文件名）。要获取全部请求记录请用 'gre... |
| `simulator_screenshot` | wechatide-debugger（主；亦可 wechatide-automator） | 截图；返回 path + imageWidth/imageHeight；默认优化尺寸（长边 1280 JPEG） |
| `get_user_appids` | wechatide-initializer | 获取当前登录用户可管理的全部 AppID 列表。可通过 type 按小程序/小游戏过滤。 |
| `compile_wxml` | wechatide-compiler | 只读获取 WXML 模板的编译结果摘要，用于诊断模板编译产物；不是整页编译或预览。 |
| `compile_wxss` | wechatide-compiler | 只读获取 WXSS 样式的编译结果摘要，用于诊断样式编译产物；不是整页编译或预览。 |
| `automation_element_action` | wechatide-automator | 读取或操作 selector 命中的元素；交互 action 会真实触发点击、输入、滚动或触摸事件，支持操作前等待。 |
| `automation_game_action` | wechatide-automator | 小游戏画布触摸：tap / swipe / touch*；坐标默认画布空间，可用 coordinateSpace=image + imageWidth/H... |
| `automation_evaluate` | wechatide-automator | 在当前小程序或小游戏运行时执行一段 JS 函数字符串并返回结果。该工具会实际执行代码，不是只读查询 |
| `automation_generate_script` | wechatide-automator | 把已记录调用生成可用 node 运行的自动化脚本；不传项目路径时使用录制时的路径。 |
| `automation_navigate` | wechatide-automator | 在当前小程序运行时执行页面导航，不负责页面断言；支持 waitForSelector / wait 在导航前等待。 |
| `automation_page_action` | wechatide-automator | 针对当前页面实例执行页面级读写。可选 waitForSelector/wait 在操作前等待 |
| `automation_runtime_info` | wechatide-initializer（主；亦可 wechatide-automator, wechatide-debugger） | 读取当前小程序运行时信息。 |
| `automation_testaccount` | wechatide-automator | 管理小程序测试号与登录 ticket：列出测试号、获取/设置/刷新 ticket。 |
| `automation_viewport_action` | wechatide-automator | 执行滚动、真机调试或关闭工具；支持操作前等待 |
| `automation_wx_api` | wechatide-debugger（主；亦可 wechatide-automator） | 调用、mock 或恢复 wx API。 |
| `debug_clear_cache` | wechatide-debugger | 清理当前项目的本地调试缓存，会影响当前调试上下文；清除的缓存类型由 action 指定。 |
| `cloud_db_read_doc` | wechatide-cloudbase-operator | 只读查询云数据库集合文档，支持条件、投影、排序和分页。 |
| `cloud_db_read_struct` | wechatide-cloudbase-operator | 只读查询云数据库集合与索引结构。 |
| `cloud_db_write_doc` | wechatide-cloudbase-operator | 修改云数据库集合文档（插入/更新/删除），属于写操作。 |
| `cloud_db_write_struct` | wechatide-cloudbase-operator | 修改云数据库集合结构（创建/删除集合、管理索引），属于写操作。 |
| `cloud_env_list` | wechatide-cloudbase-operator | 只读列出当前项目或 AppID 可用的云环境 |
| `cloud_fn_deploy` | wechatide-cloudbase-operator | 按云函数目录路径完整部署单个云函数到指定云环境，属于写操作；一次只允许部署一个云函数目录，目录名即函数名称。 |
| `cloud_fn_inc_deploy` | wechatide-cloudbase-operator | 按云函数目录路径增量部署变更文件或目录到指定云环境，属于写操作；函数目录名即函数名称。 |
| `cloud_fn_info` | wechatide-cloudbase-operator | 只读查询指定云函数的详情和状态 |
| `cloud_fn_list` | wechatide-cloudbase-operator | 只读列出指定云环境中的云函数 |
| `cloud_query_storage` | wechatide-cloudbase-operator | 只读查询云存储文件列表、文件信息、临时下载链接或文本内容。 |
| `cloud_manage_storage` | wechatide-cloudbase-operator | 管理云存储文件（上传/下载/删除）；upload/delete 属于写操作。 |
| `cloud_query_msg_push` | wechatide-cloudbase-operator | 只读查询小程序云开发消息推送配置或合法事件约束。 |
| `cloud_manage_msg_push` | wechatide-cloudbase-operator | 管理小程序云开发消息推送配置（订阅/退订/启停/确保云函数模式），属于写操作。 |

## 已废弃（勿调用，且不出现在 `wechatide -h` 默认目录）

- `project_setting_get`：【已废弃】请改用 skills/wechatide-project-config：直接读取 project.config.json / project.private.config.json。调用仅返回废弃提示。
- `project_setting_update`：【已废弃】请改用 skills/wechatide-project-config：直接修改 project.config.json / project.private.config.json。调用仅返回废弃提示，不会写入。
