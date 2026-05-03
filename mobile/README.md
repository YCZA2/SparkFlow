# SparkFlow Mobile

SparkFlow 的 Expo / React Native 移动端工程。

当前项目只面向 iOS / Android 原生端，不维护 Expo Web 构建、浏览器运行时适配层或 web 导出流程。

## 今日进展（2026-04-01）

- 移动端配置已收口到 Expo runtime config：当前只区分 `development` 与 `production`，通过 `mobile/app.config.ts` 下发 `appEnv`、`defaultApiBaseUrl` 与 `enableDeveloperTools`。
- 正式包默认 API 基地址现已切到 `https://www.onepercent.ltd`；如未显式覆写 `APP_DEFAULT_API_BASE_URL`，production 构建会直接连当前阿里云线上入口。
- 正式包现在会默认移除 `网络设置`、`API 测试` 和 `错误日志` 等开发入口；即使深链命中也会显示拒绝态，不再允许手工覆盖后端地址。
- `fragments / folders` 的 local-first phase 1 已经落地完成：列表、详情、编辑、删除都以本地 SQLite + 文件系统为真值，远端只负责备份与恢复。
- 移动端正式入口已经切到”登录后工作区”：未登录只显示登录页；登录成功后才挂载本地 SQLite、正文文件和备份队列。
- 本地 SQLite、fragment/script 正文文件、音频缓存与 staging 目录都已按 `user_id` 工作区隔离；切换账号会切换整套本地工作区。
- 录音上传、抖音导入、脚本生成、备份冲刷与恢复流程现在都绑定 `user_id + session_version + workspace_epoch` 任务作用域；切号、登出或设备会话失效后，旧任务只会保留在原工作区等待恢复，不会继续回写当前账号。
- 录音转写、抖音链接导入、脚本生成都已经切到“客户端上传本地快照或本地媒体”驱动，不再默认依赖服务端 fragment 业务表作为输入真值。
- 录音上传与抖音链接导入现在都要求客户端**先创建本地 fragment placeholder**，并把 `local_fragment_id` 显式传给后端；服务端不再兜底创建远端 fragment 记录。
- 服务端返回的 `transcript / summary / tags / audio_object_key` 会直接补写进 fragment backup snapshot；客户端后续 backup flush 不会把这些服务器字段冲掉。
- 碎片现在有后台语义层：服务端生成 `system_tags / system_purpose`（仅内部使用），用户在本地维护 `user_tags`；标签简化为备忘录式体验，不再暴露系统建议标签的接受/删除交互；用途由 LLM 自动判断，不再允许用户修正。
- “创作工作台”已接入显式恢复；恢复时会重建本地 SQLite、`body.html` 与媒体缓存，并在需要时按 `object_key` 向后端刷新最新访问地址。
- `script` 本轮已接入 local-first：生成成功后立即落本地 SQLite + `body.html` 文件，后续编辑、回收站、冲突恢复副本和拍摄状态都先写本地，再异步备份；后端 `scripts` 表只保存生成初稿和任务完成后的详情读取，不再反向覆盖本地已编辑正文。
- `fragment` 与 `script` 继续是两个独立领域对象：碎片负责素材沉淀与生成输入，成稿负责派生正文与拍摄消费；两者共享 editor / `body_html` / 导出与媒体能力，但不共享生命周期语义。
- 当前项目仍处于无老用户开发阶段，移动端不保留历史本地 SQLite 升级链、旧备份 payload 或旧远端投影补水；旧开发数据需要通过重装 App / 清库重建。
- 新增代码使用当前 local-first 领域命名，例如 `backup_object_key / pending_body_html / save_state`；不要再引入旧 remote-first 语义字段。
- `fragment / script / folder` 的 list/detail 异步读取现已统一到 React Query：查询 key 绑定 `user_id + session_version + workspace_epoch`，queryFn 直接读取本地 SQLite / 文件系统；实体变更后统一通过 invalidation 刷新，不再维护额外内存 cache store。
- 移动端 UI 现已默认采用 NativeWind：`tailwind.config.js` 承载设计 token，`global.css` 在根布局导入；`Themed/Colors` 旧层已移除，`useAppTheme()` 只保留给富文本编辑器、录音、拍摄、复杂动画和第三方样式桥接场景。

## 目录说明

- `app/`: expo-router 页面
- `features/`: 业务 API 与 hooks
- `components/`: 可复用 UI 组件
- `providers/`: 应用级 provider 与初始化逻辑
- `types/`: 共享 TypeScript 类型
- `utils/`: 工具方法（网络配置、日期等）
- `constants/`: 常量与接口地址
- `tailwind.config.js` / `global.css`: NativeWind 样式入口与 Tailwind token 配置

## 当前移动端已接入的内容能力

- fragments / folders 主链路当前采用**local-first 架构**：列表、详情、编辑、删除统一读取本地 SQLite / 文件系统，远端只做自动备份与显式恢复
- 远端快照、待同步正文、待上传图片不再混放在 `AsyncStorage`；`AsyncStorage` 仅保留 token、用户信息、后端地址和少量轻量配置
- 当前不再自动使用测试用户进入主流程；正式登录采用邮箱密码认证，`/api/auth/token` 仅用于本地开发联调
- `AppQueryProvider` 已接入根布局：移动端远端 task 状态统一通过 React Query / QueryObserver 轮询，页面与恢复流程不再各自手写 `while + setTimeout`
- `features/fragments/queries.ts`、`features/scripts/queries.ts`、`features/folders/queries.ts` 现在承接本地 list/detail query、局部写回和统一 invalidation；旧的 fragment/script 列表缓存 store 已删除。
- `AppSessionProvider` 现在会在工作区挂载、前后台切换和定时保活时同时补跑 `flushBackupQueue()` 与 `recoverWorkspaceTaskState()`；页面发起的导入 / 脚本任务也会立即交给工作区恢复层托管，离开当前页后仍能继续落本地真值
- “写下灵感”文本链路当前直接创建本地 fragment 实体；编辑完成后只标记待备份，不再先建远端 fragment 空壳。
- 录音与外链导入同样遵循这条约束：必须先有本地 fragment 实体，再调用 `/api/transcriptions` 或 `/api/external-media/audio-imports`。
- 首页和文件夹页只展示当前本地 SQLite 真值，不再聚合历史草稿缓存或远端投影卡片。
- 首页与文件夹页底部 `+` 当前会打开导入抽屉，而不是直接跳转到其他页面。
- 导入抽屉当前提供 `导入链接` 与 `导入文件` 两个入口，其中 `导入链接` 已接入抖音分享链接导入，`导入文件` 仍为占位入口。
- 碎片详情页默认进入轻量正文编辑视图，正文改动会优先写本地 HTML 草稿；`transcript`、音频、摘要、标签和系统建议收口到右上角“更多”底部抽屉，AI patch 本期已下线；主要用途不再暴露给用户，由 LLM 自动判断。
- 移动端编辑器已抽出 `features/editor/*` 共享底座：统一承载 HTML helper、editor session reducer、`react-native-enriched` 富文本桥接、toolbar 和页面 scaffold，fragment 与 script 详情共用同一套正文编辑协议。
- `features/editor/contentBodyService.ts` 现在负责 DOM 级正文解析、首行标题/预览提取和 `asset://` 图片引用收集；`features/editor/html.ts` 只保留桥接协议、格式化和少量 HTML 拼装 helper。
- 录音页当前也已把 route 与 UI 壳层拆开：`app/record-audio.tsx` 只保留参数接入，界面与按钮组收口到 `features/recording/components/*`。
- `useEditorSession` 当前已经按 `hydration / persistence / image insertion / runtime refs` 拆成内部子模块；页面侧继续只消费同一套 `EditorSessionResult`，不会感知拆分细节。
- 碎片详情内部仍保留 `detail resource / editor session / sheet / screen actions` 四层，但 resource 已经切换为只读本地实体；后台由 backup queue 负责把改动推到远端备份。
- `FragmentDetailSheet` 当前已改成“modal 壳层 + section 组合 + sheet state helper”结构：抽屉 UI 细节已经进一步拆到 `components/detailSheet/*` 下的 primitives / section blocks / styles 子模块，不再和详情页数据组装写在同一个文件里。
- 首页与文件夹页的碎片列表现在共用同一套 list screen model：日期分组、多选上限、跳详情预热缓存、进入 AI 编导的选择态逻辑都从统一 hook 输出。
- 首页、文件夹页、成稿页现在共享一层 `NotesListScreenShell / NotesListHero / NotesScreenStateView` 页面壳层；各页面仍各自保留列表数据源、导航和选择态逻辑。
- 生成页现在采用统一主题输入：用户只需补一个主题即可生成脚本，已选碎片作为可选补充素材；后端按 `topic + SOP + 三层写作上下文` 创建脚本任务。
- 碎片正文详情和列表已接入本地真值：详情优先读本地 HTML 与实体缓存，正文与媒体改动统一留在本地真值并由 backup queue 异步备份。
- 脚本详情页现在也采用 local-first：先读本地 script 真值；生成任务成功后才按 `script_id` 读取后端生成详情并落本地，编辑成功后正文只写本地并进入 backup queue。
- 首页系统区当前包含“全部”和按需出现的“成稿”；只有用户真的存在 script 时才会显示“成稿”入口，成稿列表与碎片列表继续分开，不做混排。
- fragment 与 script 详情页统一成“正文主舞台 + 更多底部抽屉”交互；来源碎片、关联成稿、拍摄入口和附加元信息都收口到抽屉中。
- `fragment` 与 `script` 都可以进入拍摄页；拍摄完成后会记录本地 `is_filmed / filmed_at`，默认不在列表卡片展示，只用于详情与后续筛选。
- 移动端正文输入统一使用 `react-native-enriched` 原生富文本；fragment 支持标题、列表、引用、粗体、斜体和图片，script 支持相同文本格式但不支持图片和“更多”抽屉；Android 与 iOS 16+ 默认通过系统原生编辑菜单触发格式操作。
- 碎片详情里的正文基线解析、自动保存队列、AI fallback patch、图片 fallback 插入和素材去重都已下沉为独立 session helper / reducer，纯状态回归统一由 `mobile/tests/*.test.ts` 覆盖。
- fragments / folders / scripts 列表与详情现在统一从 React Query + SQLite 本地真值读取；页面刷新和任务完成后的回流统一依赖 query invalidation，而不是自管 `isLoading / isRefreshing / stale flag` 模板代码。
- 移动端已移除知识库入口；文件、录音、外链和手动文本都统一成为碎片，文档导入直接走碎片链路，不再维护独立知识库概念。

## 本地数据层说明

- `mobile/features/core/db/`：SQLite 连接、schema、迁移和 Drizzle 查询入口
- `mobile/features/core/files/`：fragment / script 正文文件和图片/音频 staging 文件管理；当前已按 `runtimePaths.native.ts`（工作区与路径约束）和 `runtimeFs.native.ts`（文件读写与 staging 操作）拆分
- `mobile/features/core/query/workspace.ts`：工作区隔离 query scope 与统一 query key 入口
- `mobile/features/fragments/store/`：fragments 本地数据入口，当前按 `localEntityStore / runtime / shared update helpers` 拆分职责；主链路统一从 `store/index.ts` 读取本地实体能力
- `mobile/features/scripts/store/`：scripts 本地数据入口，负责成稿真值、lineage、回收站、冲突副本和恢复合并
- `mobile/features/fragments/queries.ts` / `mobile/features/scripts/queries.ts` / `mobile/features/folders/queries.ts`：本地 list/detail query、局部 query data 写回与统一 invalidation 入口
- `mobile/features/editor/html.ts`：唯一 HTML / 纯文本快照 helper 真值源，fragment 与 script 共用
- `mobile/features/tasks/taskQuery.ts`：统一任务查询 hook、终态消费 hook、QueryObserver 轮询和 UI phase 映射；脚本生成、抖音导入、录音转写回写和工作区恢复共用这套语义
- `mobile/features/tasks/taskRecoveryRegistry.ts`：统一约束后台任务恢复的作用域键和 observer 去重，避免页面 handoff、工作区恢复和前后台补跑重复追踪同一 task

补充约定：
- SQLite 迁移当前采用开发期基线重建策略；`user_version` 低于当前版本时会重建本地表，不迁移历史开发数据。
- `media_task_*` 是当前移动端 fragment 媒体导入任务状态的正式本地字段，会参与任务恢复、失败提示和重试。
- 新增 UI 默认使用 NativeWind `className` 和 Tailwind token；仅在动画、复杂运行时计算样式或第三方组件限制里继续使用 `StyleSheet.create`。
- `Themed/Colors` 旧样式包装层已删除；普通页面不要再新建兼容主题组件。
- `mobile/theme/tokens.ts` 继续服务迁移中的 `useAppTheme()` 调用，但新颜色、间距、圆角和阴影应先进入 `mobile/theme/tailwind-tokens.js`，再由 `tailwind.config.js` 暴露为 utility class。

当前 fragments / folders / scripts 读写规则：

- 列表页和详情页都只读本地 SQLite + `body.html`
- 异步读取统一通过 React Query 组织：`fragment / folder / script` 变更后只做 query invalidation，不再同步第二层内存列表/详情缓存
- 编辑、删除、创建文件夹都会先修改本地实体并增加 `entity_version`
- 图片、音频等大对象先存本地 staging，再由 `/api/backups/assets` 补传
- 远端备份统一通过 `features/backups/queue.ts` 扫描 `backup_status=pending|failed` 的实体批量推送；当前 snapshot 已覆盖 fragment / folder / media_asset / script
- scripts 列表页只读本地 SQLite；只有脚本生成或恢复任务成功后，客户端才按 `script_id` 拉取后端生成详情并写入本地
- “创作工作台”页已提供显式“从备份恢复”入口：会先创建 restore session，再拉取 `/api/backups/snapshot` 重建本地 SQLite 与 `body.html`，并尽量把音频/图片重新缓存到 app sandbox
- 恢复媒体缓存前，移动端会先调用 `/api/backups/assets/access` 按 `object_key` 刷新最新访问地址，减少签名 URL 过期导致的恢复失败
- fragment 自身音频现在也会把 `audio_object_key` 持久化到本地真值与备份快照，恢复时会和媒体素材一起刷新访问地址并重建本地缓存
- script 恢复当前不会粗暴覆盖本地稿；若本地已有活跃成稿，远端同 ID 快照会恢复为副本并自动追加标题后缀
- 若后端返回“当前设备会话已失效”，前端不会再自动抢回 token，而是停留在本地只读态；用户可在“创作工作台”页显式点击“重新连接当前设备”

## 一、推荐用法：统一走 `scripts/dev-mobile.sh`

以后你只需要记住三个模式：

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

- 本机 PostgreSQL（`5432`）
- 本机 RabbitMQ（`5672`）
- Celery worker（媒体导入、转写、文档导入、脚本生成等后台任务）
- 后端 FastAPI（`8000`）
- Expo / Metro（`8081`）

脚本会自动注入：

- `APP_ENV=development`
- `APP_DEFAULT_API_BASE_URL=http://<你的局域网 IP>:8000`（LAN 模式）或 `http://127.0.0.1:8000`（simulator）

也可以用 npm 别名：

```bash
npm run dev
```

首次在新机器启动前，建议先完成依赖引导：

```bash
cp backend/.env.example backend/.env
python3.12 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt
brew install rabbitmq
cd mobile && npm install
```

补充约定：

- 不要在仓库根目录执行 `npm install` 或 `npm ci`；根目录 npm scripts 只保留 `dev`、`simulator`、`ios:build`、`ios:install` 四个常用入口。
- 需要安装移动端依赖时，请进入 `mobile/` 执行：`cd mobile && npm install`
- 仓库根目录现在带有安装保护；如误在根目录执行安装，会直接失败并提示正确路径。
- `mobile/app.config.ts` 和 Expo config plugins 是移动端原生配置真值；本地 `mobile/ios`、`mobile/android` 只是按需重建的生成目录，并且已被 `mobile/.gitignore` 忽略。
- `scripts/dev-mobile.sh` 启动后端时会优先使用 `backend/.venv`；如果 `.venv` 不存在，脚本会退回系统 `python3`，常见结果是 `alembic` 等后端依赖缺失。
- 后端启动前需要在 `backend/.env` 中提供非空 `DASHSCOPE_API_KEY`。如果你当前只需要联调登录、列表和其他非 AI 页面，可临时填 `test-dashscope-key` 一类占位值；录音转写、脚本生成、摘要、标签、向量检索等能力仍然需要真实 DashScope key。

如果你要用 iOS 模拟器而不是真机，请执行：

```bash
npm run simulator
```

这个模式会先启动 Metro，再由脚本手动唤起已安装的 iOS dev client，
比直接依赖 Expo CLI 自动 `openurl` 更稳定。
如果脚本提示 `no available iOS simulator device found` 或 `no booted iOS Simulator detected`，通常不是项目问题，而是本机 Xcode 还没有安装任何 iOS Simulator runtime；请到 `Xcode > Settings > Components` 里先安装一个 iOS Simulator，再重试。

如需单独管理本地数据库：

```bash
bash scripts/postgres-local.sh start all
bash scripts/postgres-local.sh status
```

### 模式2：需要 Build 的修改

适用场景：

- 新增/删除 Expo 原生模块
- 修改 `mobile/app.config.ts`
- 修改 `ios/` 目录下原生工程文件
- 修改 `Info.plist`、`AppDelegate.swift`
- 修改 Pod 或其他 iOS 原生配置

执行命令：

```bash
bash scripts/dev-mobile.sh build
```

脚本现在会在执行时提示你手动选择构建目标：

- `iOS Simulator`
- `Physical iPhone`

如果你想跳过交互，也可以直接传参数：

```bash
bash scripts/dev-mobile.sh build simulator
bash scripts/dev-mobile.sh build device
```

也可以用 npm 别名：

```bash
npm run ios:build
```

这个模式只做重建相关步骤，不会启动前后端。

执行完模式2后，再按目标进入日常联调：

```bash
bash scripts/dev-mobile.sh simulator   # 如果刚才构建的是 simulator
bash scripts/dev-mobile.sh             # 如果刚才构建的是 device / LAN 联调
```

如需在本地验证 Android 原生改动，请显式按 Expo config 重生 Android 目录：

```bash
cd mobile
APP_ENV=development npx expo prebuild --platform android --clean
APP_ENV=development npx expo run:android
```

### 模式5：install-only（只重试安装）

适用场景：

- 你已经执行过 `build`，但卡在“连接设备/安装 app”阶段失败
- 不想再走一遍 `prebuild --clean` + `pod-install`

执行命令：

```bash
bash scripts/dev-mobile.sh install
```

也可以用 npm 别名：

```bash
npm run ios:install
```

这个模式会自动复用 DerivedData 里最近一次构建的 `SparkFlowDev.app`，
仅执行安装到设备，不会重新构建。

## 二、模式2 实际会做什么

`build` 模式会依次执行：

```bash
cd mobile
npm install
npx expo prebuild --platform ios --clean
npx pod-install ios
npx expo run:ios --device "<当前 iOS Simulator 名称>"   # 选择 simulator 时
# 或
npx expo run:ios --device      # 选择 device 时
```

完成后脚本会提示你回到模式1。

补充说明：

- 上面的 iOS 重建流程会直接从 `mobile/app.config.ts` 和当前 Expo config plugins 重新生成原生目录，因此修改 app identity、scheme、权限、插件后，应以这条流程为准，而不是手工修补生成目录。
- EAS 云构建同样遵循这条约束：因为 `mobile/.gitignore` 已忽略生成的 `ios/`、`android/`，上传到 EAS 的项目会按当前 Expo 配置重新 prebuild。

## 发布命令

移动端发布从 `mobile/` 目录直接走现有 EAS npm scripts：

```bash
cd mobile
npm run build:dev:ios
npm run build:dev:android
npm run build:prod:ios
npm run build:prod:android
npm run submit:prod:ios
npm run submit:prod:android
```

常用非交互示例：

```bash
cd mobile
APP_ENV=development npx eas build --platform ios --profile development:device
APP_ENV=production npx eas build --platform android --profile production --non-interactive
APP_ENV=production npx eas submit --platform ios --profile production --latest
```

约定：

- `dev` 固定映射到 `development:device` profile，并注入 `APP_ENV=development`
- `prod` 固定映射到 `production` profile，并注入 `APP_ENV=production`
- `submit` 只允许 `prod`，避免误把开发包提审
- 由于生成原生目录不作为仓库真值，发布前若刚改过 `mobile/app.config.ts` 或 Expo plugins，请先在本地执行一次对应平台的 prebuild / native build，确认生成结果和运行态一致。

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

2. 如果构建已成功但安装失败，先执行模式5重试安装：

```bash
bash scripts/dev-mobile.sh install
```

3. 再执行模式1：

```bash
bash scripts/dev-mobile.sh
```

4. 用手机扫描 Expo 终端里的二维码打开项目

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

3. 如果你手动删掉了 simulator 里的 app，`simulator` 模式现在会先检测 `com.sparkflow.mobile` 是否存在；缺失时会自动调用 `expo run:ios --simulator "<当前已启动模拟器>"` 补装后再继续打开。
4. 若自动补装失败，再重新执行一次 build 模式。

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

这些接口先返回 `task_id` / `task_type` / `status_query_url`，不会保证请求返回时已经拿到最终 `fragment` 或 `script`。

联调顺序应改为：

1. 发起创建请求，拿到 `task_id`
2. 轮询 `GET /api/tasks/{task_id}`
3. 需要看步骤时，再查 `GET /api/tasks/{task_id}/steps`
4. 失败后可调用 `POST /api/tasks/{task_id}/retry`

当前补齐范围：

- 脚本生成页已经按上述任务态接入，会在成功后再跳转脚本详情
- 每日推盘触发接口后端已经切成任务态，移动端首页主入口仍未完整消费
- 外链导入已接入底部 `+` 抽屉与任务态轮询，成功后会进入对应碎片详情
- 外链导入请求支持透传当前 `folderId`，在文件夹页发起导入时会直接归入该文件夹

### 0.1 local-first 内容层当前怎么联调

这次内容层改造后，移动端需要区分两类碎片创建：

- 语音上传：继续走 `POST /api/transcriptions`
- 手动文本碎片：本地先创建 local fragment entity，后续只进入 backup queue，不再先建远端空白碎片

当前返回和展示约定：

- 碎片详情正文读取 `body_html`，列表摘要和生成页预览读取 `plain_text_snapshot`
- `transcript` 表示机器转写原文；语音碎片在转写成功后，客户端会把它作为初始正文种子写入 `body_html`，后续编辑只围绕正文进行
- 碎片详情默认只把正文编辑器作为主界面；原文时间线、音频播放、摘要、标签、系统建议、来源和删除操作都从右上角“更多”抽屉进入；主要用途由 LLM 自动判断，不再暴露给用户修正
- 当语音碎片的转写已经种入正文后，抽屉不再重复显示 transcript 文本，只保留音频播放器
- 碎片正文详情采用**local-first + backup/recovery**：优先读取本地 SQLite / `body.html`，编辑中不再自动远端刷新当前会话；本地保存和图片上传失败时会保留待备份状态，重新进入详情仍可继续编辑
- AI 编辑接口本期停用，不再参与正文链路
- 脚本详情直接编辑 `body_html`，并保留“一键去拍摄”入口消费当前最新正文
- 知识库后端仍保留兼容能力，但移动端已移除知识库入口；文档导入统一走碎片链路
- 文件访问统一读取后端返回的 `audio_file_url` / `file_url`，不再拼接 `audio_path` / `storage_path`
- 录音上传和外链导入都会先创建本地 placeholder fragment，再在任务成功后把 `transcript` 种成可编辑正文，并将 `summary / tags / 音频元数据` 一并 patch 回写到本地实体
- 手动脚本生成前会先显式执行一次 `flushBackupQueue()`；如果本地正文还没成功同步，客户端会阻断生成，避免后端基于旧 snapshot 出稿。生成请求会携带当前文件夹和标签筛选上下文，后端按碎片用途区分“写什么”和“怎么写”。
- local-first 语音上传成功后的主状态查询统一走 `task_id -> GET /api/tasks/{task_id}`；不再保留按 fragment 读取转写状态的接口

### 1. 一打开 App 就红屏，出现 `8000/index.bundle`

原因：Dev Client 把后端 `8000` 错当成了 Metro 地址。

处理步骤：

1. 先执行模式5仅重试安装：

```bash
bash scripts/dev-mobile.sh install
```

2. 如果提示找不到已有 `.app`，再执行模式2完整重建：

```bash
bash scripts/dev-mobile.sh build
```

3. 再执行模式1启动联调：

```bash
bash scripts/dev-mobile.sh
```

3. 不要直接点手机桌面图标，重新扫码打开项目

### 2. 应用启动后提示“无法连接到后端服务”

按顺序检查：

1. 后端是否已启动
2. 本机 PostgreSQL 是否已就绪，可执行：

```bash
bash scripts/postgres-local.sh status
```
2. 手机和电脑是否在同一 Wi‑Fi
3. 应用网络设置中填写的是否为 `http://电脑IP:8000`
4. 后端日志里是否能看到来自手机 IP 的请求

如果接口请求成功但页面一直卡在处理中，再额外检查：

1. `GET /api/tasks/{task_id}` 是否一直停在 `queued` / `running`
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
- 未处理 Promise 异常
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
cd backend && .venv/bin/pytest
cd ../mobile && npm run test:state
```

这样以后真机红屏或接口报错，不需要再手动复制大段报错文本。

## 五、手动命令对照表

如果你以后不想记脚本，可以对照下面理解：

- 模式1 ≈ 启动后端 + `npx expo start --lan`
- 模式2 ≈ `npm install` + `expo prebuild` + `pod-install` + `expo run:ios --device <simulator>|--device`
- 模式5 ≈ 复用已有 `.app` + `expo run:ios --device --binary <path>`
- 根目录 `npm install` 会被保护脚本拦住；只有 `cd mobile && npm install` 才是正确安装路径

## 六、后端数据库迁移（本项目联调时常用）

默认本地数据库使用本机 PostgreSQL 服务。手动运行迁移前，先确保数据库服务已启动：

```bash
bash scripts/postgres-local.sh start dev
```

如果你还没在 macOS 上安装 PostgreSQL，推荐先执行：

```bash
brew install postgresql@16
brew services start postgresql@16
```

后台任务还依赖本机 RabbitMQ；整套联调推荐直接运行 `npm run dev`，脚本会自动启动 RabbitMQ、Celery worker 和 Celery beat。若需要单独检查：

```bash
bash scripts/rabbitmq-local.sh status
bash scripts/celery-worker.sh
bash scripts/celery-beat.sh
```

当后端有 Alembic 新迁移（例如新增字段）时，先执行：

```bash
cd backend
.venv/bin/alembic upgrade heads
```

当前后台任务依赖以下新表已经存在：

- `task_runs`
- `task_step_runs`

## 七、前后端协作入口

如果移动端和后端由不同成员并行开发，默认遵守仓库内的协作规范：

- 协作规范：[`memory-bank/frontend-backend-collaboration.md`](/Users/hujiahui/Desktop/VibeCoding/SparkFlow/memory-bank/frontend-backend-collaboration.md)
- 架构总览：[`memory-bank/architecture.md`](/Users/hujiahui/Desktop/VibeCoding/SparkFlow/memory-bank/architecture.md)

移动端开发时，优先依据后端 `schemas.py`、`response_model` 和 `/docs` 中的 contract 接口说明接入；在真实接口未完成前，可以先按契约做 mock，但联调前要回到真实结构校验 loading、空态、错误态和处理中状态。
