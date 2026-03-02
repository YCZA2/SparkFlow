## 🤖 Assistant



# 灵感编导 AI — MVP 实施计划

---

## 阶段 0：开发环境搭建与项目初始化

### 步骤 0.1：安装系统级依赖

在 macOS 终端中使用 Homebrew 安装以下工具：Python 3.12、Node.js（LTS）、Watchman。确认 Xcode Command Line Tools 已安装（iOS 模拟器需要）。

**验证测试：** 分别运行 `python3 --version`、`node --version`、`watchman --version`，每条命令均返回版本号且无报错。在终端运行 `xcode-select -p`，返回一个有效路径。

---

### 步骤 0.2：创建项目根目录与 Git 仓库

在本地创建一个名为 `inspo-director` 的项目根文件夹。在其中初始化 Git 仓库。创建 `.gitignore` 文件，添加对 Python 虚拟环境（`.venv`）、`node_modules`、`data.db`、`__pycache__`、`.expo` 的忽略规则。创建两个子文件夹：`backend` 和 `mobile`。

**验证测试：** 运行 `git status`，显示干净的初始仓库，且 `.gitignore` 已被追踪。确认 `backend/` 和 `mobile/` 目录存在。

---

### 步骤 0.3：搭建 FastAPI 后端骨架

进入 `backend/` 目录。创建 Python 虚拟环境并激活。使用 pip 安装以下包：`fastapi`、`uvicorn[standard]`、`sqlalchemy`、`alembic`、`python-multipart`。创建 `requirements.txt` 冻结依赖。创建 `main.py` 文件，其中定义一个 FastAPI 应用实例，仅包含一个根路径 `GET /`，返回 `{"status": "ok"}`。

**验证测试：** 使用 `uvicorn main:app --reload` 启动服务。在浏览器中访问 `http://localhost:8000`，返回 `{"status": "ok"}`。访问 `http://localhost:8000/docs`，显示 Swagger UI 页面，且该 GET 端点可见。

---

### 步骤 0.4：搭建后端目录结构

在 `backend/` 中创建以下子目录和空的 `__init__.py` 文件：`routers/`、`services/`、`models/`、`prompts/`。在 `routers/` 中创建四个空的 Python 文件：`fragments.py`、`scripts.py`、`knowledge.py`、`transcribe.py`。在 `services/` 中创建四个空的 Python 文件：`llm_service.py`、`stt_service.py`、`vector_service.py`、`scheduler.py`。在 `models/` 中创建 `db_models.py`。在 `prompts/` 中创建两个空文本文件：`mode_a_boom.txt`（导师爆款模式 Prompt）、`mode_b_brain.txt`（专属二脑模式 Prompt）。

**验证测试：** 在项目根目录运行 `find backend -type f | sort`，确认上述所有文件和目录都已存在。启动 uvicorn 服务确认无导入错误。

---

### 步骤 0.5：创建 Expo 前端项目

进入 `mobile/` 目录。使用 `npx create-expo-app@latest` 命令创建 Expo 项目，选择 tabs 模板，使用 TypeScript。项目名设为 `inspo-director-app`。

**验证测试：** 运行 `npx expo start --ios`。iOS 模拟器自动启动，显示 Expo 默认的 tabs 界面，且终端无红色错误。

---

### 步骤 0.6：验证前后端网络连通性

在前端项目中，创建或修改一个临时测试屏幕。在该屏幕中，使用 `fetch` 向 `http://localhost:8000` 发送 GET 请求，将返回的 JSON 显示在屏幕文本中。

**验证测试：** 后端 uvicorn 保持运行。在 iOS 模拟器中打开该测试屏幕，屏幕上显示 `{"status": "ok"}` 或 `ok` 文字。确认前端可以成功调用后端 API。完成后可以删除此临时测试代码。

---

### 步骤 0.7：安装前端核心 Expo 模块

在 `mobile/` 目录中，使用 `npx expo install` 一次性安装以下包：`expo-av`、`expo-camera`、`expo-media-library`、`expo-file-system`、`expo-notifications`、`expo-document-picker`、`expo-sqlite`。

**验证测试：** 打开 `package.json`，确认上述七个包均出现在 dependencies 中。运行 `npx expo start --ios`，App 在模拟器中正常启动，终端无红色模块缺失报错。

---

### 步骤 0.8：安装前端 UI 组件库

在 `mobile/` 目录安装 `react-native-paper` 及其对等依赖 `react-native-safe-area-context`、`react-native-vector-icons`（如需要）。在 App 根布局中配置 Paper 的 `PaperProvider` 包裹器。

**验证测试：** 在任意一个 tab 屏幕中放置一个 Paper 的 `Button` 组件，文字为"测试按钮"。在模拟器中该按钮以 Material Design 样式正确渲染。

---

## 阶段 1：数据库模型与迁移

### 步骤 1.1：定义 SQLAlchemy 数据库连接

在 `backend/models/` 中创建 `database.py` 文件。定义数据库连接 URL 指向 `backend/data.db`（SQLite）。创建 SQLAlchemy 的 `engine` 和 `SessionLocal` 工厂函数。创建 `Base` 声明基类。编写一个 `get_db` 依赖注入函数，用于 FastAPI 路由中获取数据库会话。

**验证测试：** 在 Python 交互式环境中导入 `database.py` 中的 `engine`，调用 `engine.connect()`，无报错，且 `data.db` 文件自动在 `backend/` 目录下生成。

---

### 步骤 1.2：定义 Users 数据模型

在 `backend/models/db_models.py` 中定义 `User` 模型，包含以下字段：`id`（TEXT，主键，UUID）、`role`（TEXT，默认值 `'user'`，预留值 `'creator'`）、`nickname`（TEXT，可空）、`created_at`（TIMESTAMP，默认当前时间）。

**验证测试：** 在 Python 脚本中导入 `User` 模型和 `Base`，调用 `Base.metadata.create_all(bind=engine)`。使用 DB Browser for SQLite 打开 `data.db`，确认 `users` 表存在，且包含上述四个字段，`role` 默认值为 `'user'`。

---

### 步骤 1.3：定义 Fragments 数据模型

在同一文件中定义 `Fragment` 模型，包含字段：`id`（TEXT，主键，UUID）、`user_id`（TEXT，外键关联 `users.id`）、`audio_path`（TEXT，可空）、`transcript`（TEXT，可空）、`summary`（TEXT，可空）、`tags`（TEXT，可空——存储 JSON 数组字符串）、`source`（TEXT，默认值 `'voice'`，未来枚举 `'voice'|'manual'|'video_parse'`）、`created_at`（TIMESTAMP，默认当前时间）。

**验证测试：** 重新运行 `create_all`。用 DB Browser for SQLite 确认 `fragments` 表存在，字段齐全，`source` 默认值为 `'voice'`。

---

### 步骤 1.4：定义 Scripts 数据模型

定义 `Script` 模型，包含字段：`id`（TEXT，主键）、`user_id`（TEXT，外键）、`title`（TEXT，可空）、`content`（TEXT，可空）、`mode`（TEXT，`'mode_a'` 或 `'mode_b'`）、`source_fragment_ids`（TEXT，JSON 数组字符串）、`status`（TEXT，默认 `'draft'`，枚举 `'draft'|'ready'|'filmed'`）、`is_daily_push`（BOOLEAN，默认 0）、`created_at`（TIMESTAMP）。

**验证测试：** 重新运行 `create_all`。用 DB Browser 确认 `scripts` 表存在，包含所列全部字段。

---

### 步骤 1.5：定义 KnowledgeDocs 数据模型

定义 `KnowledgeDoc` 模型，包含字段：`id`（TEXT，主键）、`user_id`（TEXT，外键）、`title`（TEXT）、`content`（TEXT）、`doc_type`（TEXT，`'high_likes'|'language_habit'`）、`vector_ref_id`（TEXT，可空）、`created_at`（TIMESTAMP）。

**验证测试：** 重新运行 `create_all`。用 DB Browser 确认 `knowledge_docs` 表存在。

---

### 步骤 1.6：定义 Agents 预留数据模型

定义 `Agent` 模型，包含字段：`id`（TEXT，主键）、`creator_id`（TEXT，外键关联 `users.id`）、`name`（TEXT）、`description`（TEXT，可空）、`status`（TEXT，默认 `'private'`，枚举 `'private'|'pending'|'published'`）、`created_at`（TIMESTAMP）。

**验证测试：** 重新运行 `create_all`。用 DB Browser 确认 `agents` 表存在，`status` 默认值为 `'private'`。确认数据库现在共有 5 张表：`users`、`fragments`、`scripts`、`knowledge_docs`、`agents`。

---

### 步骤 1.7：初始化 Alembic 迁移系统

在 `backend/` 目录下运行 `alembic init alembic`。修改 `alembic.ini` 中的 `sqlalchemy.url` 指向 `sqlite:///data.db`。修改 `alembic/env.py`，将 `target_metadata` 设为你定义的 `Base.metadata`。生成初始迁移文件：`alembic revision --autogenerate -m "initial tables"`。运行迁移：`alembic upgrade head`。

**验证测试：** 运行 `alembic current`，输出显示当前位于最新的 head 版本。删除 `data.db`，重新运行 `alembic upgrade head`，`data.db` 被重建，用 DB Browser 确认全部 5 张表存在。

---

### 步骤 1.8：创建默认测试用户种子数据

编写一个简单的种子脚本 `backend/seed.py`，在 `users` 表中插入一条默认用户记录，`id` 为固定 UUID（如 `"test-user-001"`），`nickname` 为 `"测试博主"`，`role` 为 `"user"`。该脚本应检查是否已存在，避免重复插入。

**验证测试：** 运行 `python seed.py`。用 DB Browser 查看 `users` 表，确认存在一条记录。再次运行脚本，记录数仍然是 1（无重复）。

---

## 阶段 2：碎片笔记 CRUD API

### 步骤 2.1：创建 Fragments 路由文件并注册到主应用

在 `backend/routers/fragments.py` 中创建一个 FastAPI `APIRouter`，前缀设为 `/api/fragments`。在 `main.py` 中导入并注册该路由器（`app.include_router`）。

**验证测试：** 重启 uvicorn。访问 `http://localhost:8000/docs`，Swagger 页面上出现 `/api/fragments` 分组（即使内部暂无端点，分组应可见或不报错）。

---

### 步骤 2.2：实现创建碎片笔记的 POST 端点

在 fragments 路由中创建 `POST /api/fragments`。请求体接受 JSON 字段：`user_id`（必填）、`transcript`（可选）、`source`（可选，默认 `'voice'`）。服务端自动生成 UUID 作为 `id`，将记录插入 `fragments` 表，返回完整的碎片对象（包含 `id` 和 `created_at`）。

**验证测试：** 在 Swagger UI 中调用该端点，body 传入 `{"user_id": "test-user-001", "transcript": "今天想到了一个关于定位的好点子"}`。返回 201 状态码和包含 `id` 的 JSON。用 DB Browser 确认 `fragments` 表多了一条记录。

---

### 步骤 2.3：实现获取碎片列表的 GET 端点

创建 `GET /api/fragments`，接受查询参数 `user_id`（必填）。返回该用户的所有碎片笔记列表，按 `created_at` 降序排列。

**验证测试：** 先通过 POST 创建 3 条碎片（同一 user_id）。调用 `GET /api/fragments?user_id=test-user-001`，返回包含 3 条记录的数组，且第一条是最新创建的。

---

### 步骤 2.4：实现获取单条碎片详情的 GET 端点

创建 `GET /api/fragments/{fragment_id}`。返回单条碎片的完整信息。如果 ID 不存在，返回 404。

**验证测试：** 使用一个已存在的 `fragment_id` 调用，返回 200 和完整对象。使用一个不存在的 ID 调用，返回 404。

---

### 步骤 2.5：实现删除碎片的 DELETE 端点

创建 `DELETE /api/fragments/{fragment_id}`。删除成功返回 204 No Content。ID 不存在返回 404。

**验证测试：** 创建一条碎片，记录其 ID。调用 DELETE，返回 204。再调用 GET 该 ID，返回 404。用 DB Browser 确认记录已从表中移除。

---

## 阶段 3：前端碎片库列表页

### 步骤 3.1：配置前端路由结构

使用 expo-router，在 `app/` 目录下规划底部 Tab 导航，包含以下 Tab：
- **首页**（灵感捕手）：对应路由 `/(tabs)/index`
- **碎片库**：对应路由 `/(tabs)/fragments`
- **我的**：对应路由 `/(tabs)/profile`

修改 Tab 布局文件，设置中文标签名和适当的图标。

**验证测试：** 在模拟器中启动 App，底部显示三个 Tab 按钮，点击各 Tab 可正常切换，每个 Tab 屏幕显示对应的占位文字（如"首页"、"碎片库"、"我的"）。

---

### 步骤 3.2：创建 API 请求工具模块

在前端项目的 `lib/` 或 `utils/` 目录中，创建 `api.ts` 文件。定义 `BASE_URL` 常量（值为 `http://localhost:8000`）。封装一个通用的 `fetchApi` 函数，接受 path、method、body 参数，自动拼接 BASE_URL，设置 `Content-Type: application/json`，返回解析后的 JSON。

**验证测试：** 在任意屏幕中临时调用 `fetchApi('/api/fragments?user_id=test-user-001', 'GET')`，在 console.log 中打印返回数据。确认能正确获取到后端碎片列表（需后端运行中）。

---

### 步骤 3.3：实现碎片库列表页面

在碎片库 Tab 屏幕中，页面加载时调用 `GET /api/fragments?user_id=test-user-001`。使用 FlatList 组件渲染碎片列表。每个列表项（卡片）展示：`summary`（如果有，否则显示 `transcript` 的前 50 个字符）和 `created_at`（格式化为可读日期时间）。列表为空时显示"还没有灵感碎片，去首页录一条吧"占位文案。

**验证测试：** 确保后端数据库中有至少 2 条碎片记录。在模拟器中切换到"碎片库"Tab，看到包含 2 个卡片的列表，每个卡片显示文本摘要和时间。删除所有记录后刷新页面，显示空状态提示文案。

---

### 步骤 3.4：实现碎片详情页

创建一个详情屏幕路由（如 `app/fragment/[id].tsx`）。在碎片库列表页中，点击某个卡片后导航到此详情页，并传递 `fragment_id` 参数。详情页加载时调用 `GET /api/fragments/{id}`，展示完整的 `transcript` 文本、`summary`、`tags`（如有）、`source`、`created_at`。

**验证测试：** 在模拟器碎片库列表中点击一条碎片卡片，跳转到详情页，完整内容正确显示。点击返回按钮，回到碎片列表。

---

## 阶段 4：录音功能（模块 1 核心）

### 步骤 4.1：创建首页录音按钮 UI

在首页（`/(tabs)/index`）底部放置一个大尺寸圆形按钮（参照 PRD"硕大的录音按钮"描述），颜色醒目。按钮有两种交互模式的初步实现：点击一次开始录音，再点一次结束录音。按钮标签在"开始录音"和"停止录音"之间切换。在按钮上方添加录音状态文本提示（如"点击开始录音"、"正在录音…"）。

**验证测试：** 在模拟器中打开首页，看到底部有一个大圆形按钮，点击后按钮文字变为"停止录音"，再点一次变回"开始录音"。状态文本随之变化。

---

### 步骤 4.2：实现 expo-av 录音功能

使用 `expo-av` 的 `Audio.Recording` API 实现实际录音。在组件挂载或首次点击录音前，请求麦克风权限。点击"开始录音"后，创建录音实例并开始录制。点击"停止录音"后，停止录制，获取录音文件的本地 URI。将录音文件 URI 保存在组件 state 中，并在界面上临时显示该 URI 路径文本以便调试。

**验证测试：** 在 iOS 模拟器中点击录音按钮，弹出麦克风权限请求（模拟器可能无法实际录音，但权限弹窗应出现并可授权）。如果使用真机测试，录音 5 秒后停止，屏幕上显示类似 `file:///.../.m4a` 的本地文件路径。

---

### 步骤 4.3：创建音频上传 API 端点

在后端 `routers/transcribe.py` 中创建 `POST /api/transcribe`。该端点接受 multipart/form-data 上传，字段名为 `audio`（文件）和 `user_id`（字符串）。将上传的音频文件保存到 `backend/uploads/` 目录下（自动创建该目录），文件名使用 UUID 防止冲突。返回 JSON `{"audio_path": "<保存路径>", "message": "上传成功"}`。（此步骤暂不做转写，仅处理上传。）

**验证测试：** 使用 Swagger UI 或 curl 命令上传一个小 `.m4a` 或 `.wav` 文件，设置 `user_id` 为 `test-user-001`。返回 200 和文件路径。确认 `backend/uploads/` 目录下出现了上传的文件。

---

### 步骤 4.4：前端录音结束后自动上传音频

在首页录音逻辑中，录音停止并获得本地文件 URI 后，使用 `expo-file-system` 的 `uploadAsync` 或标准 `fetch` + `FormData` 将音频文件 POST 到 `http://localhost:8000/api/transcribe`。上传时同时传入 `user_id`。上传成功后显示"上传成功"的 Toast 或文字提示；失败时显示错误信息。

**验证测试：**（需要真机或使用预制的测试音频文件）点击录音 → 停止 → 界面显示"上传成功"。检查 `backend/uploads/` 目录确认新文件出现。后端终端日志显示收到 POST 请求。

---

## 阶段 5：语音转写集成（STT）

### 步骤 5.1：配置外部 API 密钥管理

在 `backend/` 目录下创建 `.env` 文件（并确认 `.gitignore` 已忽略 `.env`）。添加字段 `OPENAI_API_KEY=sk-...`（或所选 STT 服务的密钥）。安装 `python-dotenv` 包。在 `main.py` 启动时加载 `.env` 中的环境变量。

**验证测试：** 在 `main.py` 中临时打印 `os.getenv("OPENAI_API_KEY")` 的前 8 个字符。启动 uvicorn，终端输出密钥前缀（如 `sk-xxxxx`）。确认后删除此打印语句。

---

### 步骤 5.2：实现 STT 服务封装

在 `backend/services/stt_service.py` 中，编写一个函数 `transcribe_audio(file_path: str) -> str`。该函数读取指定路径的音频文件，调用 OpenAI Whisper API（或讯飞 STT API），返回转写后的纯文本字符串。处理可能的异常（文件不存在、API 调用失败），在异常时返回明确的错误信息或抛出自定义异常。

**验证测试：** 准备一段 10 秒的中文语音测试文件，放入 `backend/uploads/`。在 Python 交互环境中调用 `transcribe_audio("uploads/test.m4a")`，返回对应的中文文本字符串，内容与语音基本吻合。

---

### 步骤 5.3：完善上传端点——上传后自动转写并创建碎片

修改 `POST /api/transcribe` 端点的逻辑：音频文件保存后，自动调用 `transcribe_audio` 获取转写文本。将转写结果、音频路径、user_id 组装后，插入 `fragments` 表（创建一条新碎片记录）。返回完整的碎片对象（包含 `id`、`transcript`、`created_at` 等）。

**验证测试：** 通过 Swagger UI 上传一段语音文件和 user_id。返回的 JSON 中包含 `transcript` 字段，内容为转写文本。用 DB Browser 检查 `fragments` 表，确认新增了一条记录，`transcript` 和 `audio_path` 均有值。

---

### 步骤 5.4：前端录音全流程联调

在首页录音 → 停止 → 上传的流程基础上，上传成功后读取返回的碎片对象数据，在界面上显示转写文本（临时在录音按钮上方以文本卡片形式展示"刚刚录入的灵感"）。之后切换到碎片库 Tab，确认新碎片出现在列表中。

**验证测试：** 完整执行：点击录音 → 说话 5 秒 → 停止 → 等待上传和转写 → 首页出现转写文本 → 切换到碎片库 Tab → 新碎片出现在列表顶部。整个流程无崩溃、无卡死。

---

## 阶段 6：AI 自动摘要与标签

### 步骤 6.1：实现 LLM 服务封装

在 `backend/services/llm_service.py` 中，编写函数 `call_llm(system_prompt: str, user_message: str) -> str`。该函数使用 OpenAI SDK（或 Claude SDK），向 LLM 发送消息并返回文本回复。模型使用 `gpt-4o-mini` 或 `claude-3-5-sonnet`（根据 `.env` 中配置选择）。包含基本的错误处理和超时设置。

**验证测试：** 在 Python 交互环境中调用 `call_llm("你是一个助手", "你好")`，返回一段正常的中文回复文本。

---

### 步骤 6.2：实现自动摘要生成函数

在 `llm_service.py` 中新增函数 `generate_summary(transcript: str) -> str`。该函数构造一个 system prompt，要求 LLM"根据以下口述内容生成一句简短的中文摘要（20 字以内），描述核心主题"。将 transcript 作为 user_message 传入 `call_llm`，返回摘要文本。

**验证测试：** 调用 `generate_summary("我今天突然想到做定位其实最重要的就是找到差异化，你要想清楚你和别人到底有什么不同")`，返回类似"关于如何做差异化定位的思考"的简短摘要。

---

### 步骤 6.3：实现自动标签生成函数

在 `llm_service.py` 中新增函数 `generate_tags(transcript: str) -> list[str]`。system prompt 要求 LLM"根据以下内容生成 2-4 个中文标签关键词，以 JSON 数组格式返回，如 `["定位", "差异化"]`"。解析 LLM 返回的 JSON 字符串为 Python 列表。如果解析失败，返回空列表。

**验证测试：** 调用 `generate_tags("我今天突然想到做定位其实最重要的就是找到差异化")`，返回一个 Python 列表，如 `["定位", "差异化", "个人品牌"]`。确认返回类型是 `list` 而非字符串。

---

### 步骤 6.4：在转写流程中串联摘要和标签生成

修改 `POST /api/transcribe` 的逻辑：在获得转写文本后，依次调用 `generate_summary` 和 `generate_tags`。将 `summary` 和 `tags`（序列化为 JSON 字符串存储）写入碎片记录。返回的碎片对象中包含 `summary` 和 `tags` 字段。

**验证测试：** 上传一段语音文件。返回的 JSON 中 `transcript` 有内容，`summary` 为一句话摘要，`tags` 为标签数组。用 DB Browser 查看新碎片记录，`summary` 和 `tags` 字段均不为空。

---

### 步骤 6.5：前端碎片卡片显示摘要和标签

更新碎片库列表页的卡片组件：优先显示 `summary` 作为卡片标题。如果有 `tags`，在摘要下方显示标签（以小标签/chip 样式展示）。详情页同步展示完整的摘要和标签信息。

**验证测试：** 在模拟器中打开碎片库 Tab，卡片上方显示 AI 生成的摘要文本，下方有 1-4 个标签 chip。点击进入详情页，摘要和标签完整显示。

---

## 阶段 7：AI 口播稿生成（模块 2 核心）

### 步骤 7.1：编写导师爆款模式 Prompt

在 `backend/prompts/mode_a_boom.txt` 中编写 system prompt。该 Prompt 应指示 LLM 扮演一位"资深知识口播编导"角色，要求将用户提供的散乱灵感碎片整合为一篇结构化口播稿，必须遵循以下结构：（1）黄金三秒开头（吸引注意力的钩子）→（2）痛点陈述 →（3）干货正文 →（4）互动引导结尾。输出的口播稿应口语化，适合直接照着念，长度控制在 300-500 字之间。

**验证测试：** 在 Python 中读取该文件内容，确认文本不为空，包含"黄金三秒"、"痛点"、"干货"、"互动"四个关键词。

---

### 步骤 7.2：编写专属二脑模式 Prompt

在 `backend/prompts/mode_b_brain.txt` 中编写 system prompt。该 Prompt 指示 LLM "以用户个人的表达风格"将灵感碎片整合为口播稿。要求保持用户原文的语气词、口头禅和叙事方式，不做过度结构化处理，产出更自然、更像"自己说话"的稿子。（MVP 阶段暂不引入知识库匹配，仅基于当前碎片内容模拟。）

**验证测试：** 在 Python 中读取该文件内容，确认文本不为空，包含"用户风格"或"个人表达"相关描述。

---

### 步骤 7.3：实现口播稿生成 API 端点

在 `backend/routers/scripts.py` 中创建 `POST /api/scripts/generate`。请求体接受：`user_id`（必填）、`fragment_ids`（必填，字符串数组——选中的碎片 ID 列表）、`mode`（必填，`'mode_a'` 或 `'mode_b'`）。后端逻辑：（1）根据 `fragment_ids` 查询对应碎片的 `transcript` 文本。（2）将所有碎片文本拼接为一个用户消息。（3）根据 `mode` 读取对应的 Prompt 文件。（4）调用 `call_llm`。（5）将生成结果写入 `scripts` 表。（6）返回完整的口播稿对象。在 `main.py` 中注册此路由。

**验证测试：** 先在数据库中确保存在 2-3 条碎片。在 Swagger UI 中调用 `POST /api/scripts/generate`，传入这些碎片 ID 和 `mode: "mode_a"`。返回 JSON 包含 `title`、`content`（口播稿正文）、`mode` 为 `"mode_a"`、`source_fragment_ids` 数组。`content` 应包含一段完整的口播稿文本。用 `mode_b` 再调用一次，返回的 `content` 风格应与 `mode_a` 有明显差异。用 DB Browser 确认 `scripts` 表新增了 2 条记录。

---

### 步骤 7.4：实现口播稿列表 API

创建 `GET /api/scripts`，接受查询参数 `user_id`。返回该用户的所有口播稿，按 `created_at` 降序排列。

**验证测试：** 调用后返回前面步骤生成的口播稿列表，至少 2 条，最新的排在前面。

---

### 步骤 7.5：实现口播稿详情 API

创建 `GET /api/scripts/{script_id}`。返回单条口播稿完整信息。不存在返回 404。

**验证测试：** 使用已存在的 ID 调用返回 200 和完整对象，使用不存在的 ID 返回 404。

---

### 步骤 7.6：前端——碎片多选与"交给 AI 编导"按钮

在碎片库列表页添加"多选模式"功能：页面顶部或右上角添加"选择"按钮。点击后进入多选模式，每个卡片左侧出现复选框。底部出现一个浮动按钮"交给 AI 编导"，点击后导航到一个新的"生成稿件"页面，携带选中碎片的 ID 数组。

**验证测试：** 在模拟器中点击"选择"按钮进入多选模式。勾选 2-3 条碎片，底部按钮显示"交给 AI 编导（已选 N 条）"。点击按钮后跳转到新页面（暂时可以是空白页，但导航要成功且 ID 数组参数正确传递过来——在新页面临时显示选中的 ID 列表以验证）。

---

### 步骤 7.7：前端——AI 生成页面（模式选择与生成）

创建"生成稿件"页面（如 `app/generate.tsx`）。页面上方展示选中碎片的摘要列表（只读）。中间提供两个模式选择按钮：【导师爆款模式】和【我的专属二脑】。底部一个大的"生成口播稿"按钮。用户选择模式后点击生成，调用 `POST /api/scripts/generate`。生成期间按钮显示加载状态（如转圈+文字"AI 正在编写…"）。生成完成后自动跳转到口播稿详情页，展示完整的口播稿内容。

**验证测试：** 从碎片库选择 2 条碎片 → 进入生成页面 → 选择"导师爆款模式"→ 点击生成 → 等待数秒 → 自动跳转到详情页 → 显示完整的口播稿文本。返回后重复选择"专属二脑"模式，也能成功生成并展示稿件。

---

## 阶段 8：提词器功能（模块 3 上半部分）

### 步骤 8.1：口播稿详情页底部添加"一键去拍摄"按钮

在口播稿详情页（展示生成稿件内容的页面）底部添加一个醒目的大按钮，文字为"一键去拍摄"。点击后导航到一个新的"拍摄"页面（如 `app/shoot.tsx`），并将该口播稿的 `id` 和 `content` 作为参数传递过去。

**验证测试：** 在口播稿详情页看到底部大按钮。点击后成功跳转到拍摄页面（暂时显示空白或占位文字），不崩溃。在拍摄页面临时打印收到的稿件内容，确认参数传递正确。

---

### 步骤 8.2：实现提词器文本滚动组件

创建一个独立的可复用组件 `TeleprompterOverlay`。接受 `text`（口播稿内容）和 `scrollSpeed`（滚动速度，可先设默认值）作为 props。组件渲染方式：半透明背景，白色或高对比度文字，大字号（方便阅读）。使用 React Native 的 `Animated` API 实现文字从下往上自动匀速滚动。提供暂停/继续控制（点击文字区域即可切换暂停与滚动）。

**验证测试：** 在拍摄页面中临时挂载该组件，传入一段 300 字的测试文本。启动后文字自动从下往上滚动，速度平稳。点击文字区域，滚动暂停。再点击，恢复滚动。

---

### 步骤 8.3：提词器滚动速度可调

在提词器组件中或拍摄页面上，添加一个简单的速度调节控件（如一个小滑块或"加速/减速"按钮）。用户可以在拍摄前或拍摄中调整滚动速度。

**验证测试：** 在拍摄页面滑动滑块或点击加速/减速按钮，提词器文字滚动速度明显发生变化（加速变快，减速变慢）。

---

## 阶段 9：相机拍摄与保存（模块 3 下半部分）

### 步骤 9.1：实现基础相机预览

在拍摄页面中使用 `expo-camera` 组件，在页面打开时请求相机权限。被授权后，页面全屏显示相机预览画面（默认前置摄像头）。提供一个小按钮用于前置/后置摄像头切换。不添加任何美颜或滤镜效果。

**验证测试：**（需真机或确认模拟器支持相机模拟）打开拍摄页面，弹出相机权限请求。授权后屏幕显示相机实时画面。点击切换按钮，摄像头从前置切换到后置（或反之）。

---

### 步骤 9.2：在相机预览上叠加提词器

将 `TeleprompterOverlay` 组件叠加在相机预览画面之上。提词器位于屏幕上半部分（约占屏幕 30-40% 高度），半透明背景使得底下的相机画面隐约可见。相机画面占据全屏。底部放置拍摄控制按钮。

**验证测试：** 打开拍摄页面，同时看到：（1）全屏相机实时画面；（2）上方半透明的提词器文字在自动滚动；（3）底部有拍摄相关按钮。三者同屏显示，互不遮挡主区域。

---

### 步骤 9.3：实现视频录制功能

在拍摄页面底部添加一个"开始录制"圆形按钮（红色大圆）。点击后开始录制视频（使用 `expo-camera` 的录制 API），按钮变为"停止录制"（可改为方块形状或颜色变化）。再次点击停止录制，获取录制好的本地视频文件 URI。录制过程中提词器保持滚动。

**验证测试：** 点击"开始录制"，按钮状态变化，录制 5 秒后点击"停止录制"，获得一个视频文件 URI。在 console 中打印该 URI，确认格式为有效的本地文件路径。

---

### 步骤 9.4：保存视频到系统相册

录制停止并获得视频 URI 后，使用 `expo-media-library` 请求相册写入权限，然后将视频文件保存到设备系统相册。保存成功后弹出提示"视频已保存到相册"。同时更新关联口播稿的 `status` 为 `'filmed'`（调用后端 API 或本地标记）。

**验证测试：**（需真机）完整流程：打开拍摄页面 → 提词器滚动中 → 点击录制 → 录制 5 秒 → 停止 → 提示"视频已保存到相册"。打开设备的系统相册 App，确认最新的视频就是刚刚录制的内容。

---

### 步骤 9.5：实现口播稿状态更新 API

在后端创建 `PATCH /api/scripts/{script_id}` 端点，允许更新口播稿的 `status` 字段（值为 `'draft'`、`'ready'`、`'filmed'` 之一）。

**验证测试：** 调用 `PATCH /api/scripts/{id}`，body 为 `{"status": "filmed"}`，返回 200 和更新后的对象。GET 该 script 确认 status 已变为 `'filmed'`。

---

## 阶段 10：知识库基础（模块 4）

### 步骤 10.1：实现知识库文档上传 API

在 `backend/routers/knowledge.py` 中创建 `POST /api/knowledge`。接受 JSON 请求体：`user_id`（必填）、`title`（必填，如"我的高赞文案"）、`content`（必填，粘贴的文本内容）、`doc_type`（必填，`'high_likes'` 或 `'language_habit'`）。将数据插入 `knowledge_docs` 表，返回完整记录。在 `main.py` 中注册该路由。

**验证测试：** 在 Swagger UI 中调用，传入 `{"user_id": "test-user-001", "title": "我的高赞文案合集", "content": "这是一段很长的文案内容...", "doc_type": "high_likes"}`。返回包含 `id` 的完整对象。DB Browser 确认 `knowledge_docs` 表新增一条记录。

---

### 步骤 10.2：实现知识库文档列表 API

创建 `GET /api/knowledge`，接受 `user_id` 参数，返回该用户的所有知识库文档列表。

**验证测试：** 插入 2 条知识文档后调用，返回包含 2 条记录的列表。

---

### 步骤 10.3：实现文件上传解析（TXT/Word）

修改 `POST /api/knowledge` 端点，增加一个可选的文件上传方式（multipart/form-data，字段名 `file`）。后端检测文件扩展名：如果是 `.txt`，直接读取文本内容；如果是 `.docx`，使用 `python-docx` 库提取文本内容。提取的文本填入 `content` 字段存入数据库。安装 `python-docx` 并加入 `requirements.txt`。

**验证测试：** 准备一个包含中文内容的 `.txt` 文件和一个 `.docx` 文件。分别通过 Swagger 上传，返回的对象中 `content` 字段包含正确的文件文本内容。

---

### 步骤 10.4：前端知识库管理入口

在"我的"Tab 页面中添加一个"我的方法论"入口按钮。点击后导航到一个知识库管理页面。该页面展示已有知识文档列表（调用 `GET /api/knowledge`）。页面有"添加文档"按钮，点击后提供两种方式：（1）手动粘贴文本（弹出文本输入框 + 标题输入 + 类型选择）；（2）上传文件（调用 `expo-document-picker` 选择 TXT/Word 文件后上传）。

**验证测试：** 在模拟器"我的"Tab → 点击"我的方法论" → 进入知识库页面 → 看到已有文档列表（或空状态）。点击"添加文档"→ 选择"粘贴文本"→ 填写标题、内容、类型 → 提交 → 列表刷新出现新文档。

---

## 阶段 11：向量数据库集成（知识库增强）

### 步骤 11.1：配置向量数据库连接

在 `.env` 文件中添加向量数据库（Pinecone 或 Qdrant Cloud）的连接信息：API Key 和环境/URL。安装对应的 Python 客户端包（`pinecone-client` 或 `qdrant-client`）。在 `backend/services/vector_service.py` 中初始化客户端连接。

**验证测试：** 在 Python 交互环境中导入 `vector_service`，调用连接初始化函数，无报错。如果使用 Pinecone，可以调用 `list_indexes()` 确认连接成功。

---

### 步骤 11.2：创建用户专属向量命名空间

在 `vector_service.py` 中实现函数 `upsert_document(user_id: str, doc_id: str, text: str)`。该函数将 `text` 拆分为段落或固定长度的 chunk，使用 OpenAI `text-embedding-3-small` 模型（或其他 Embedding 模型）生成每个 chunk 的向量，以 `user_id` 作为 namespace（Pinecone）或 collection 前缀（Qdrant）进行数据隔离，将向量写入数据库。

**验证测试：** 调用 `upsert_document("test-user-001", "doc-001", "这是一段测试文本，包含了关于口播定位的方法论...")`。无报错。在向量数据库的管理后台（Web Dashboard）中确认数据已写入对应 namespace 下。

---

### 步骤 11.3：实现向量相似度查询

在 `vector_service.py` 中实现函数 `query_similar(user_id: str, query_text: str, top_k: int = 3) -> list[str]`。该函数将 `query_text` 转为向量，在该用户的 namespace 下检索最相似的 `top_k` 条文本 chunk，返回文本列表。

**验证测试：** 先确保步骤 11.2 已写入数据。调用 `query_similar("test-user-001", "怎么做定位")`，返回一个非空列表，内容与之前写入的文本语义相关。使用一个不同的 `user_id` 调用同样的 query，返回空列表（数据隔离正确）。

---

### 步骤 11.4：知识库文档上传时自动写入向量库

修改 `POST /api/knowledge` 端点：在文档保存到 SQLite 后，自动调用 `upsert_document` 将文档内容写入向量库。将向量库返回的引用信息写入 `knowledge_docs` 表的 `vector_ref_id` 字段。

**验证测试：** 通过 API 上传一篇新的知识文档。DB Browser 中确认 `vector_ref_id` 字段有值。在向量库管理后台确认新数据已写入。

---

### 步骤 11.5（可选增强）：Mode B 生成时检索知识库

修改 `POST /api/scripts/generate` 中 Mode B 的逻辑：在调用 LLM 前，使用碎片内容作为查询文本，调用 `query_similar` 检索该用户知识库中最相关的文本片段。将检索到的参考文本作为 LLM system prompt 的补充上下文（如"以下是用户过往的写作风格参考：..."）。这使 Mode B 真正具备"学习用户个人表达"的能力。

**验证测试：** 先为测试用户上传至少一篇包含特定风格用语的知识文档。然后用 Mode B 生成口播稿，生成的内容应体现出知识库中的部分用语或风格。与不加知识库参考的生成结果对比，能看出差异。

---

## 阶段 12：每日灵感推盘（自动聚合）

### 步骤 12.1：实现每日聚合逻辑函数

在 `backend/services/scheduler.py` 中，编写函数 `daily_aggregate()`。逻辑：查询每个用户昨天（过去 24 小时内）创建的碎片笔记。如果某用户的碎片数量 >= 3 条，则将这些碎片的 `transcript` 合并，使用 Mode A 的 Prompt 调用 LLM 生成一篇口播稿。将生成的口播稿写入 `scripts` 表，`is_daily_push` 标记为 `true`。（此步骤不处理推送通知，仅处理数据生成。）

**验证测试：** 在数据库中手动插入 4 条碎片，`created_at` 设为当天日期，`user_id` 为测试用户。手动调用 `daily_aggregate()` 函数。检查 `scripts` 表，确认新增一条记录，`is_daily_push` 为 1（True），`content` 包含一篇口播稿。如果碎片不足 3 条，则不生成稿件。

---

### 步骤 12.2：配置 APScheduler 定时任务

在 `scheduler.py` 中配置 APScheduler，添加一个 cron 类型的定时任务：每天早上 8:00 运行 `daily_aggregate`。在 FastAPI 的 `startup` 事件中启动 scheduler，在 `shutdown` 事件中关闭 scheduler。

**验证测试：** 启动 uvicorn 后，终端日志中显示 APScheduler 已启动和注册了定时任务的信息。将 cron 临时改为"每 1 分钟执行一次"进行测试，观察 1 分钟后函数被自动触发（通过日志输出确认）。测试完成后改回每天 8:00。

---

### 步骤 12.3：实现每日推盘 API 查询端点

创建 `GET /api/scripts/daily-push`，接受 `user_id` 参数。返回该用户最新的一条 `is_daily_push` 为 True 的口播稿（如果没有则返回 `null` 或 404）。

**验证测试：** 在有每日推盘稿件的情况下调用，返回该稿件。在没有时返回 null 或 404。

---

### 步骤 12.4：前端首页每日灵感卡片

在首页（录音按钮上方区域），检查是否有今日的每日推盘稿件（调用 `GET /api/scripts/daily-push`）。如果有，显示一张醒目的卡片："昨天的 N 个灵感，已为您写成今日待拍脚本，去看看？"。点击卡片跳转到该口播稿的详情页。如果没有每日推盘，不显示此卡片。

**验证测试：** 手动触发 daily_aggregate 确保数据库中存在每日推盘稿件。在模拟器首页看到推盘卡片。点击卡片跳转到对应稿件详情页。删除该条 daily push 记录后刷新首页，卡片消失。

---

## 阶段 13：收尾与全流程端到端验证

### 步骤 13.1：端到端冒烟测试——完整用户旅程

按照 PRD 定义的核心业务流，完整执行一次全流程操作：

1. 打开 App 首页
2. 点击录音按钮，说一段话（约 15 秒），停止录音
3. 等待上传、转写、摘要、标签自动生成完成
4. 切换到碎片库 Tab，确认新碎片出现
5. 重复录音 2 次，共创建 3 条碎片
6. 在碎片库中进入多选模式，选中 3 条碎片
7. 点击"交给 AI 编导"，选择"导师爆款模式"，生成口播稿
8. 查看生成的口播稿内容
9. 点击"一键去拍摄"
10. 提词器在相机画面上方自动滚动
11. 点击录制，录制约 10 秒，停止
12. 视频保存到相册

**验证测试：** 上述 12 个步骤全部顺利完成，无崩溃、无白屏、无未捕获的错误。碎片库中有 3 条碎片，口播稿列表中有 1 条稿件，系统相册中有 1 个新视频。

---

### 步骤 13.2：验证数据库预留字段完整性

用 DB Browser for SQLite 打开 `data.db`，逐表检查以下 PRD 第五章预留字段的存在性：

- `users` 表：`role` 字段存在（RBAC 预留）
- `fragments` 表：`source` 字段存在，有 `'voice'` 默认值（数据来源标识预留）
- `scripts` 表：`is_daily_push` 字段存在；`status` 字段存在
- `knowledge_docs` 表：`vector_ref_id` 字段存在
- `agents` 表：存在且包含 `status` 字段（`'private'|'pending'|'published'`）

**验证测试：** 执行 `PRAGMA table_info(表名)` 对每张表检查，确认上述所有字段都存在于各自的表中，数据类型和默认值正确。

---

### 步骤 13.3：验证 API 文档完整性

访问 `http://localhost:8000/docs`（Swagger UI），确认以下端点全部存在且可交互测试：

- `POST /api/transcribe` —— 音频上传转写
- `GET /api/fragments` —— 碎片列表
- `GET /api/fragments/{id}` —— 碎片详情
- `DELETE /api/fragments/{id}` —— 删除碎片
- `POST /api/scripts/generate` —— AI 生成口播稿
- `GET /api/scripts` —— 口播稿列表
- `GET /api/scripts/{id}` —— 口播稿详情
- `PATCH /api/scripts/{id}` —— 更新口播稿状态
- `GET /api/scripts/daily-push` —— 每日推盘
- `POST /api/knowledge` —— 上传知识文档
- `GET /api/knowledge` —— 知识文档列表

**验证测试：** 在 Swagger UI 中确认上述 11 个端点全部可见，schema 正确展示了请求参数和响应结构，点击 "Try it out" 能正常调用并返回预期结果。

---

### 步骤 13.4：清理与文档化

1. 删除所有临时调试代码（console.log、临时打印的 API key 前缀等）。
2. 在 `backend/` 根目录创建 `README.md`，包含：项目描述、环境变量列表（`.env` 需要哪些 key）、启动命令。
3. 在 `mobile/` 根目录创建 `README.md`，包含：项目描述、启动命令、所需的后端地址配置。
4. 确保 `requirements.txt` 是最新的（`pip freeze > requirements.txt` 或手工维护精简版本）。
5. 提交所有变更到 Git。

**验证测试：** 假设从零开始：`git clone` 项目 → 按 README 操作 → 后端 5 分钟内可运行 → 前端 5 分钟内在模拟器中启动 → 基础 API 可调通。让另一个人（或另一个终端环境）按照 README 步骤操作，确认可以从零运行起来。
