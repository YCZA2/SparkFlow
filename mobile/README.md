# SparkFlow Mobile

SparkFlow 的 Expo / React Native 移动端工程。

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
- “创作工作台”已接入显式恢复；恢复时会重建本地 SQLite、`body.html` 与媒体缓存，并在需要时按 `object_key` 向后端刷新最新访问地址。
- `script` 本轮已接入 local-first：生成成功后立即落本地 SQLite + `body.html` 文件，后续编辑、回收站、冲突恢复副本和拍摄状态都先写本地，再异步备份；后端 `scripts` 表只保留生成初稿与兼容查询投影，不再反向覆盖本地已编辑正文。
- `fragment` 与 `script` 继续是两个独立领域对象：碎片负责素材沉淀与生成输入，成稿负责派生正文与拍摄消费；两者共享 editor / `body_html` / 导出与媒体能力，但不共享生命周期语义。
- 本轮清理已经移除旧的 `localFragmentSyncQueue / localDraftStore / remoteFragments / remoteBodyDrafts` 主链路依赖，兼容层命名统一改成 `legacy*`。
- 以后在移动端新增代码时，`server_id / sync_status / remote_id` 只允许作为 legacy cloud-binding 兼容字段出现，不能再被当作当前领域模型的核心语义。

## 目录说明

- `app/`: expo-router 页面
- `features/`: 业务 API 与 hooks
- `components/`: 可复用 UI 组件
- `providers/`: 应用级 provider 与初始化逻辑
- `types/`: 共享 TypeScript 类型
- `utils/`: 工具方法（网络配置、日期等）
- `constants/`: 常量与接口地址

## 当前移动端已接入的内容能力

- fragments / folders 主链路当前采用**local-first 架构**：列表、详情、编辑、删除统一读取本地 SQLite / 文件系统，远端只做自动备份与显式恢复
- 远端快照、本地草稿、待上传图片不再混放在 `AsyncStorage`；`AsyncStorage` 仅保留 token、用户信息、后端地址和少量轻量配置
- 当前不再自动使用测试用户进入主流程；正式登录采用邮箱密码认证，`/api/auth/token` 仅用于本地开发联调
- “写下灵感”文本链路当前直接创建本地 fragment 实体；编辑完成后只标记待备份，不再先建远端 fragment 空壳。
- 录音与外链导入同样遵循这条约束：必须先有本地 fragment 实体，再调用 `/api/transcriptions` 或 `/api/external-media/audio-imports`。
- legacy 草稿会聚合进首页/文件夹页列表顶部；若后续绑定了 legacy 云端记录 ID，列表会自动对兼容卡片去重。
- 首页与文件夹页底部 `+` 当前会打开导入抽屉，而不是直接跳转到其他页面。
- 导入抽屉当前提供 `导入链接` 与 `导入文件` 两个入口，其中 `导入链接` 已接入抖音分享链接导入，`导入文件` 仍为占位入口。
- 碎片详情页默认进入轻量正文编辑视图，正文改动会优先写本地 HTML 草稿；`transcript`、音频、摘要、标签收口到右上角“更多”底部抽屉，AI patch 本期已下线。
- 移动端编辑器已抽出 `features/editor/*` 共享底座：统一承载 HTML helper、editor session reducer、`react-native-enriched` 富文本桥接、toolbar 和页面 scaffold，fragment 与 script 详情共用同一套正文编辑协议。
- 录音页当前也已把 route 与 UI 壳层拆开：`app/record-audio.tsx` 只保留参数接入，界面与按钮组收口到 `features/recording/components/*`。
- `useEditorSession` 当前已经按 `hydration / persistence / image insertion / runtime refs` 拆成内部子模块；页面侧继续只消费同一套 `EditorSessionResult`，不会感知拆分细节。
- 碎片详情内部仍保留 `detail resource / editor session / sheet / screen actions` 四层，但 resource 已经切换为只读本地实体；后台由 backup queue 负责把改动推到远端备份。
- `FragmentDetailSheet` 当前已改成“modal 壳层 + section 组合 + sheet state helper”结构：抽屉 UI 细节已经进一步拆到 `components/detailSheet/*` 下的 primitives / section blocks / styles 子模块，不再和详情页数据组装写在同一个文件里。
- 首页与文件夹页的碎片列表现在共用同一套 list screen model：日期分组、多选上限、跳详情预热缓存、进入 AI 编导的选择态逻辑都从统一 hook 输出。
- 首页、文件夹页、成稿页现在共享一层 `NotesListScreenShell / NotesListHero / NotesScreenStateView` 页面壳层；各页面仍各自保留列表数据源、导航和选择态逻辑。
- 生成页现在采用统一主题输入：用户补一个主题后，后端按 `topic + SOP + 三层写作上下文` 创建脚本任务。
- 碎片正文详情和列表已接入本地真值与 legacy 兼容层：详情会优先读本地 HTML 与实体缓存，再按需叠加升级期兼容数据；正文与媒体改动统一留在本地真值并由 backup queue 异步备份。
- 脚本详情页现在也采用 local-first：先读本地 script 真值，再按需补远端缺失稿件；编辑成功后正文只写本地并进入 backup queue，`/api/scripts/*` 只用于缺失补齐和兼容查询，不再作为已存在本地稿件的正文权威来源。
- 首页系统区当前包含“全部”和按需出现的“成稿”；只有用户真的存在 script 时才会显示“成稿”入口，成稿列表与碎片列表继续分开，不做混排。
- fragment 与 script 详情页统一成“正文主舞台 + 更多底部抽屉”交互；来源碎片、关联成稿、拍摄入口和附加元信息都收口到抽屉中。
- `fragment` 与 `script` 都可以进入拍摄页；拍摄完成后会记录本地 `is_filmed / filmed_at`，默认不在列表卡片展示，只用于详情与后续筛选。
- 移动端正文输入统一使用 `react-native-enriched` 原生富文本；fragment 支持标题、列表、引用、粗体、斜体和图片，script 支持相同文本格式但不支持图片和“更多”抽屉；Android 与 iOS 16+ 默认通过系统原生编辑菜单触发格式操作。
- 碎片详情里的正文基线解析、自动保存队列、AI fallback patch、图片 fallback 插入和素材去重都已下沉为独立 session helper / reducer，纯状态回归统一由 `mobile/tests/*.test.ts` 覆盖。
- fragments 列表现在统一从 SQLite 本地真值读取；首页与文件夹页共享同一套“本地秒开 + 标记 stale 后重新读库”的策略。
- 知识库移动端仍是占位入口，还没有完整的 Markdown 编辑和素材管理 UI。

## 本地数据层说明

- `mobile/features/core/db/`：SQLite 连接、schema、迁移和 Drizzle 查询入口
- `mobile/features/core/files/`：fragment / script 正文文件和图片/音频 staging 文件管理；当前已按 `runtimePaths.native.ts`（工作区与路径约束）和 `runtimeFs.native.ts`（文件读写与 staging 操作）拆分
- `mobile/features/fragments/store/`：fragments 本地数据入口，当前按 `localEntityStore / legacyMigration / runtime` 拆分职责；主链路统一从 `store/index.ts` 读取本地实体能力，legacy 运行时逻辑集中在迁移主文件中，只有少量纯工具函数独立保留给迁移测试复用
- `mobile/features/scripts/store/`：scripts 本地数据入口，负责成稿真值、lineage、回收站、冲突副本和恢复合并
- `mobile/features/editor/html.ts`：唯一 HTML / 纯文本快照 helper 真值源，fragment 与 script 共用

补充约定：
- SQLite 物理列仍保留 `server_id / sync_status / remote_id` 以兼容旧库，但 Drizzle 层属性名已经切到 `legacyServerBindingId / legacyCloudBindingStatus / legacyRemoteId`；新增代码不要再把这些字段当本地真值主语义。
- 兼容旧缓存、旧正文草稿、旧云端绑定时，命名统一使用 `legacy*` / `compat*`；不要再新增 `remote*`、`server*`、`localDraft*` 这类会混淆主链路语义的名字。

当前 fragments / folders / scripts 读写规则：

- 列表页和详情页都只读本地 SQLite + `body.html`
- 编辑、删除、创建文件夹都会先修改本地实体并增加 `entity_version`
- 图片、音频等大对象先存本地 staging，再由 `/api/backups/assets` 补传
- 远端备份统一通过 `features/backups/queue.ts` 扫描 `backup_status=pending|failed` 的实体批量推送；当前 snapshot 已覆盖 fragment / folder / media_asset / script
- scripts 列表页的远端同步当前只负责补齐本地缺失稿件，不会再用后端 `scripts` 旧投影覆盖已存在的本地 `body.html`
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
- 后端 FastAPI（`8000`）
- Expo / Metro（`8081`）

脚本会自动注入：

- `APP_ENV=development`
- `APP_DEFAULT_API_BASE_URL=http://<你的局域网 IP>:8000`（LAN 模式）或 `http://127.0.0.1:8000`（simulator/web）

也可以用 npm 别名：

```bash
npm run dev:mobile
```

补充约定：

- 不要在仓库根目录执行 `npm install` 或 `npm ci`；根目录只保留联调 / 发布脚本入口。
- 需要安装移动端依赖时，请进入 `mobile/` 执行：`cd mobile && npm install`
- 仓库根目录现在带有安装保护；如误在根目录执行安装，会直接失败并提示正确路径。

如果你要用 iOS 模拟器而不是真机，请执行：

```bash
npm run dev:mobile:simulator
```

这个模式会先启动 Metro，再由脚本手动唤起已安装的 iOS dev client，
比直接依赖 Expo CLI 自动 `openurl` 更稳定。

如需单独管理本地数据库：

```bash
npm run dev:db
npm run dev:db:status
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

也可以用 npm 别名：

```bash
npm run dev:mobile:build
```

这个模式只做重建相关步骤，不会启动前后端。

执行完模式2后，再执行模式1开始联调：

```bash
bash scripts/dev-mobile.sh
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
npm run dev:mobile:install
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
npx expo run:ios --device
```

完成后脚本会提示你回到模式1。

## 发布命令

现在推荐统一走根目录发布脚本，不再手动记忆 EAS profile：

```bash
npm run release:mobile:dev:ios
npm run release:mobile:dev:android
npm run release:mobile:prod:ios
npm run release:mobile:prod:android
npm run release:mobile:submit:ios
npm run release:mobile:submit:android
```

等价底层脚本：

```bash
bash scripts/mobile-release.sh build dev ios
bash scripts/mobile-release.sh build prod android --non-interactive
bash scripts/mobile-release.sh submit prod ios --latest
```

约定：

- `dev` 固定映射到 `development:device` profile，并注入 `APP_ENV=development`
- `prod` 固定映射到 `production` profile，并注入 `APP_ENV=production`
- `submit` 只允许 `prod`，避免误把开发包提审

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

### 0.1 local-first 内容层当前怎么联调

这次内容层改造后，移动端需要区分两类碎片创建：

- 语音上传：继续走 `POST /api/transcriptions`
- 手动文本碎片：本地先创建 local fragment entity，后续只进入 backup queue，不再先建远端空白碎片

当前返回和展示约定：

- 碎片详情正文读取 `body_html`，列表摘要和生成页预览读取 `plain_text_snapshot`
- `transcript` 表示机器转写原文；语音碎片在转写成功后，客户端会把它作为初始正文种子写入 `body_html`，后续编辑只围绕正文进行
- 碎片详情默认只把正文编辑器作为主界面；原文时间线、音频播放、摘要、标签、来源和删除操作都从右上角“更多”抽屉进入
- 当语音碎片的转写已经种入正文后，抽屉不再重复显示 transcript 文本，只保留音频播放器
- 碎片正文详情采用**local-first + backup/recovery**：优先读取本地 SQLite / `body.html`，编辑中不再自动远端刷新当前会话；本地保存和图片上传失败时会保留待备份状态，重新进入详情仍可继续编辑
- AI 编辑接口本期停用，不再参与正文链路
- 脚本详情直接编辑 `body_html`，并保留“一键去拍摄”入口消费当前最新正文
- 知识库后端已经支持 `body_markdown`，但移动端入口仍未完整接入
- 文件访问统一读取后端返回的 `audio_file_url` / `file_url`，不再拼接 `audio_path` / `storage_path`
- 录音上传和外链导入都会先创建本地 placeholder fragment，再在 pipeline 成功后把 `transcript` 种成可编辑正文，并将 `summary / tags / 音频元数据` 一并 patch 回写到本地实体
- 手动脚本生成前会先显式执行一次 `flushBackupQueue()`；如果本地正文还没成功同步，客户端会阻断生成，避免后端基于旧 snapshot 出稿
- local-first 语音上传成功后的主状态查询统一走 `pipeline_run_id -> GET /api/pipelines/{run_id}`；旧的 `GET /api/transcriptions/{fragment_id}` 兼容查询接口已移除

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
bash scripts/test-all.sh
```

这样以后真机红屏或接口报错，不需要再手动复制大段报错文本。

## 五、手动命令对照表

如果你以后不想记脚本，可以对照下面理解：

- 模式1 ≈ 启动后端 + `npx expo start --lan`
- 模式2 ≈ `npm install` + `expo prebuild` + `pod-install` + `expo run:ios --device`
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
