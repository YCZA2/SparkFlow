# SparkFlow Mobile

SparkFlow 的 Expo / React Native 移动端工程。

## 目录说明

- `app/`: expo-router 页面
- `features/`: 业务 API 与 hooks
- `components/`: 可复用 UI 组件
- `providers/`: 应用级 provider 与初始化逻辑
- `types/`: 共享 TypeScript 类型
- `utils/`: 工具方法（网络配置、日期等）
- `constants/`: 常量与接口地址

## 当前移动端已接入的内容能力

- fragments 主链路已切到 local-first 镜像：列表/详情索引使用 `expo-sqlite + drizzle-orm`，正文和 staging 文件使用 `expo-file-system`
- 远端快照、本地草稿、待上传图片和 pending ops 不再混放在 `AsyncStorage`；`AsyncStorage` 仅保留 token、用户信息、后端地址和少量轻量配置
- “写下灵感”文本链路已切到 local-first：进入 `/text-note` 时先创建本地 `LocalFragmentDraft`，立即进入编辑器，再后台静默建远端碎片。
- 本地草稿会聚合进首页/文件夹页列表顶部；若后续绑定了 `remote_id`，列表会自动对远端卡片去重。
- 首页与文件夹页底部 `+` 当前会打开导入抽屉，而不是直接跳转到其他页面。
- 导入抽屉当前提供 `导入链接` 与 `导入文件` 两个入口，其中 `导入链接` 已接入抖音分享链接导入，`导入文件` 仍为占位入口。
- 碎片详情页默认进入轻量正文编辑视图，正文改动会优先写本地 HTML 草稿；`transcript`、音频、摘要、标签收口到右上角“更多”底部抽屉，AI patch 本期已下线。
- 碎片详情内部已拆成 `detail resource / editor session / sheet / screen actions` 四层：资源层只负责首次加载远端基线和缓存叠加，编辑会话层以 reducer 驱动的单一 session 内核统一编排 hydrate、本地保存、后台同步、图片插入和桥接状态，抽屉层只消费 `content + tools + actions` 展示更多内容，screen 层统一向页面暴露 `resource / editor / sheet / actions` 四组 view-model。
- 首页与文件夹页的碎片列表现在共用同一套 list screen model：日期分组、多选上限、跳详情预热缓存、进入 AI 编导的选择态逻辑都从统一 hook 输出。
- 碎片正文详情和列表已接入本地缓存与本地草稿聚合：详情会优先读本地 HTML draft，再叠加远端缓存；未同步正文和待上传图片会在应用启动、输入停顿、离页和页面聚焦时静默重试。
- 脚本详情页当前读取 `body_html`，展示层先提取纯文本，后端在导出链路里再负责转换 Markdown。
- 移动端碎片正文已切到 `react-native-enriched` 原生富文本输入，运行时与本地草稿真值统一为 `body_html`，支持标题、列表、引用、粗体、斜体和图片；Android 与 iOS 16+ 默认通过系统原生编辑菜单触发格式操作，图片和 AI 工具入口收口到右上角“更多”抽屉；AI patch 与 WebView/Tiptap 旧桥接层本期已移除。
- 碎片详情里的正文基线解析、自动保存队列、AI fallback patch、图片 fallback 插入和素材去重都已下沉为独立 session helper / reducer，纯状态回归统一由 `mobile/tests/*.test.ts` 覆盖。
- fragments 列表现在统一从 SQLite 本地镜像读取；首页与文件夹页共享同一套“本地镜像秒开 + 后台刷新 + 订阅回显”策略。
- 知识库移动端仍是占位入口，还没有完整的 Markdown 编辑和素材管理 UI。

## 本地数据层说明

- `mobile/features/core/db/`：SQLite 连接、schema、迁移和 Drizzle 查询入口
- `mobile/features/core/files/`：fragment 正文文件、远端正文草稿和图片/音频 staging 文件管理
- `mobile/features/core/sync/`：pending ops 写入与同步状态更新入口
- `mobile/features/fragments/store/`：fragments 本地镜像仓储，负责旧 `AsyncStorage` 缓存迁移、SQLite upsert 和文件正文读写

当前 fragments 读写规则：

- 列表页先读 SQLite 本地镜像，再后台刷新远端
- 详情页先读 SQLite 元数据与本地 `body.html`
- 远端碎片未同步正文继续写入独立草稿文件，不覆盖远端基线正文文件
- 本地 manual fragment 正文直接写本地文件，后台同步成功后回填 `remote_id`

## 一、推荐用法：统一走 `scripts/dev-mobile.sh`

以后你只需要记住两个模式：

### 模式1：不需要 Build 的修改

适用场景：

- 改 JS / TS
- 改页面、样式、交互逻辑
- 改业务接口调用
- 不涉及 `ios/`、插件、Pod、原生配置

启动命令：

```bash
bash scripts/dev-mobile.sh
```

或：

```bash
bash scripts/dev-mobile.sh start
```

它会同时启动：

- Docker PostgreSQL（`5432`）
- 后端 FastAPI（`8000`）
- Expo / Metro（`8081`）

也可以用 npm 别名：

```bash
npm run dev:mobile
```

如果你要用 iOS 模拟器而不是真机，请执行：

```bash
npm run dev:mobile:simulator
```

这个模式会先启动 Metro，再由脚本手动唤起已安装的 iOS dev client，
比直接依赖 Expo CLI 自动 `openurl` 更稳定。

如果你要启动浏览器 Web 端联调，请执行：

```bash
npm run dev:mobile:web
```

这个模式会同时启动：

- Docker PostgreSQL（`5432`）
- 后端 FastAPI（`8000`）
- Expo Web（`8081`）

浏览器访问：

```text
http://127.0.0.1:8081
```

Web 端请求业务 API 时，仍然应该指向：

```text
http://127.0.0.1:8000
```

如需单独管理本地数据库：

```bash
npm run dev:db
npm run dev:db:status
```

### 模式2：需要 Build 的修改

适用场景：

- 新增/删除 Expo 原生模块
- 修改 `app.json`
- 修改 `ios/` 目录下原生工程文件
- 修改 `Info.plist`、`AppDelegate.swift`
- 修改 Pod 或其他 iOS 原生配置

执行命令：

```bash
bash scripts/dev-mobile.sh build
```

也可以用 npm 别名：

```bash
npm run dev:mobile:build
```

这个模式只做重建相关步骤，不会启动前后端。

执行完模式2后，再执行模式1开始联调：

```bash
bash scripts/dev-mobile.sh
```

## 二、模式2 实际会做什么

`build` 模式会依次执行：

```bash
cd mobile
npm install
npx expo prebuild --platform ios --clean
npx pod-install ios
npx expo run:ios --device
```

完成后脚本会提示你回到模式1。

## 三、真机联调约定

### 1. 两个端口不要混淆

真机联调时有两个不同用途的地址：

- 后端 API：`http://电脑局域网IP:8000`
- Expo / Metro Bundler：`http://电脑局域网IP:8081`

其中：

- `8000` 只给应用内业务接口使用
- `8081` 只给 Expo Dev Client 拉 JS bundle 使用

如果把 `8000` 当成 Metro 地址，通常会看到类似报错：

- `GET /index.bundle?... 404 Not Found`
- `WebSocket /message?... 403`
- 红屏里出现 `http://<你的IP>:8000/index.bundle?...`

### 2. 正确的打开方式

推荐流程：

1. 如果刚改了原生配置，先执行模式2：

```bash
bash scripts/dev-mobile.sh build
```

2. 再执行模式1：

```bash
bash scripts/dev-mobile.sh
```

3. 用手机扫描 Expo 终端里的二维码打开项目

不要直接依赖手机桌面上一次残留的开发包状态。

如果使用 iOS 模拟器，推荐流程改为：

1. 首次安装或原生配置变更后，先执行模式2：

```bash
bash scripts/dev-mobile.sh build
```

2. 日常联调执行：

```bash
bash scripts/dev-mobile.sh simulator
```

3. 若脚本提示 dev client 未安装，先重新执行一次 build 模式。

### 3. 应用内网络设置填什么

应用内“网络设置”页面填写的是后端地址，不是 Metro 地址：

```text
http://电脑局域网IP:8000
```

例如：

```text
http://192.168.31.157:8000
```

## 四、常见问题排查

### 0. 新的后台任务接口怎么联调

媒体导入、脚本生成和每日推盘触发现在默认是任务态：

- `POST /api/transcriptions`
- `POST /api/external-media/audio-imports`
- `POST /api/scripts/generation`
- `POST /api/scripts/daily-push/trigger`
- `POST /api/scripts/daily-push/force-trigger`

这些接口先返回 `pipeline_run_id`，不会保证请求返回时已经拿到最终 `fragment` 或 `script`。

联调顺序应改为：

1. 发起创建请求，拿到 `pipeline_run_id`
2. 轮询 `GET /api/pipelines/{run_id}`
3. 需要看步骤时，再查 `GET /api/pipelines/{run_id}/steps`
4. 失败后可调用 `POST /api/pipelines/{run_id}/retry`

当前补齐范围：

- 脚本生成页已经按上述任务态接入，会在成功后再跳转脚本详情
- 每日推盘触发接口后端已经切成任务态，移动端首页主入口仍未完整消费
- 外链导入已接入底部 `+` 抽屉与任务态轮询，成功后会进入对应碎片详情
- 外链导入请求支持透传当前 `folderId`，在文件夹页发起导入时会直接归入该文件夹

### 0.1 正文内容层当前怎么联调

这次内容层改造后，移动端需要区分两类碎片创建：

- 语音上传：继续走 `POST /api/transcriptions`
- 手动文本碎片：本地先创建 `LocalFragmentDraft`，同步队列再调用 `POST /api/fragments/content` 创建远端空白碎片并 patch 正文

当前返回和展示约定：

- 碎片详情正文读取 `body_html`，列表摘要和生成页预览读取 `plain_text_snapshot`
- `transcript` 表示机器转写原文，不参与正文编辑
- 碎片详情默认只把正文编辑器作为主界面；原文时间线、音频播放、摘要、标签、来源和删除操作都从右上角“更多”抽屉进入
- 碎片正文详情采用 local-first：优先读取本地 draft / SQLite 镜像，编辑中不再自动远端刷新当前会话；本地保存和图片上传失败时会保留草稿与待上传状态，重新进入详情仍可继续编辑
- AI 编辑接口本期停用，不再参与正文链路
- 脚本详情只读取 `body_html`
- 知识库后端已经支持 `body_markdown`，但移动端入口仍未完整接入
- 文件访问统一读取后端返回的 `audio_file_url` / `file_url`，不再拼接 `audio_path` / `storage_path`

### 1. 一打开 App 就红屏，出现 `8000/index.bundle`

原因：Dev Client 把后端 `8000` 错当成了 Metro 地址。

处理步骤：

1. 执行模式2重新安装开发包：

```bash
bash scripts/dev-mobile.sh build
```

2. 再执行模式1启动联调：

```bash
bash scripts/dev-mobile.sh
```

3. 不要直接点手机桌面图标，重新扫码打开项目

### 2. 应用启动后提示“无法连接到后端服务”

按顺序检查：

1. 后端是否已启动
2. 本地 Docker PostgreSQL 是否已就绪，可执行：

```bash
bash scripts/postgres-local.sh status
```
2. 手机和电脑是否在同一 Wi‑Fi
3. 应用网络设置中填写的是否为 `http://电脑IP:8000`
4. 后端日志里是否能看到来自手机 IP 的请求

如果接口请求成功但页面一直卡在处理中，再额外检查：

1. `GET /api/pipelines/{run_id}` 是否一直停在 `queued` / `running`
2. 后端是否已经完成 Alembic 迁移
3. Dify、本地 STT 或外链解析依赖是否可用

### 3. 后端日志出现 `HEAD / 200 OK`

这是正常的连通性探测日志，不代表报错。

### 4. 看到 `watchman recrawl` 警告

可以执行：

```bash
watchman watch-del '/Users/hujiahui/Desktop/VibeCoding/SparkFlow'
watchman watch-project '/Users/hujiahui/Desktop/VibeCoding/SparkFlow'
```

### 5. 让 Codex 直接读取前端报错

现在移动端错误日志会同时：

- 显示在 App 内的 `错误日志` 页面
- 同步进入后端结构化日志链路，并写入本地文件 [`backend/runtime_logs/mobile-debug.log`](/Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend/runtime_logs/mobile-debug.log)

推荐调试方式：

1. 启动联调：

```bash
bash scripts/dev-mobile.sh
```

2. 在 App 里打开：

- `创作工作台`
- `错误日志`

3. 复现问题后，直接让 Codex 读取：

```bash
backend/runtime_logs/mobile-debug.log
```

这份日志会记录：

- `console.error`
- 全局 JS 异常
- 未处理 Promise 异常（Web）
- API 请求失败 / 响应错误

## 五、测试

移动端状态测试：

```bash
cd mobile
npm run test:state
```

当前移动端测试仍是轻量状态测试，只覆盖 `tests/*.test.ts` 下的纯状态 helper，不包含 UI 渲染测试或 Expo 原生集成测试；测试通过仓库内置的 `scripts/run-state-tests.mjs` 先用 esbuild 预编译再执行 `node --test`，`mobile/features` 不再保留 `.js` / `.d.ts` 编译产物。

TypeScript 类型检查：

```bash
cd mobile
npx tsc --noEmit
```

全仓测试：

```bash
bash scripts/test-all.sh
```

这样以后真机红屏或接口报错，不需要再手动复制大段报错文本。

## 五、手动命令对照表

如果你以后不想记脚本，可以对照下面理解：

- 模式1 ≈ 启动后端 + `npx expo start --lan`
- 模式4 ≈ 启动后端 + `npx expo start --web`
- 模式2 ≈ `npm install` + `expo prebuild` + `pod-install` + `expo run:ios --device`

## 六、后端数据库迁移（本项目联调时常用）

默认本地数据库由 Docker 提供。手动运行迁移前，先确保数据库容器已启动：

```bash
bash scripts/postgres-local.sh start dev
```

当后端有 Alembic 新迁移（例如新增字段）时，先执行：

```bash
cd backend
.venv/bin/alembic upgrade heads
```

当前后台任务流水线依赖以下新表已经存在：

- `pipeline_runs`
- `pipeline_step_runs`

## 七、前后端协作入口

如果移动端和后端由不同成员并行开发，默认遵守仓库内的协作规范：

- 协作规范：[`memory-bank/frontend-backend-collaboration.md`](/Users/hujiahui/Desktop/VibeCoding/SparkFlow/memory-bank/frontend-backend-collaboration.md)
- 架构总览：[`memory-bank/architecture.md`](/Users/hujiahui/Desktop/VibeCoding/SparkFlow/memory-bank/architecture.md)

移动端开发时，优先依据后端 `schemas.py`、`response_model` 和 `/docs` 中的 contract 接口说明接入；在真实接口未完成前，可以先按契约做 mock，但联调前要回到真实结构校验 loading、空态、错误态和处理中状态。
