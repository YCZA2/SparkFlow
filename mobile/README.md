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

- 手动文本碎片会直接走 Markdown 内容创建接口 `POST /api/fragments/content`。
- 碎片详情页会优先展示后端返回的 `compiled_markdown`，兼容旧碎片无 block 的情况。
- 脚本详情页会优先展示 `body_markdown`，旧数据仍回退到原 `content`。
- 移动端尚未提供真正的块式编辑器；当前是“手动创建支持 + 详情展示优先读 Markdown”。
- 知识库移动端仍是占位入口，还没有完整的 Markdown 编辑和素材管理 UI。

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

- 后端 FastAPI（`8000`）
- Expo / Metro（`8081`）

也可以用 npm 别名：

```bash
npm run dev:mobile
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

媒体导入和脚本生成现在默认是任务态：

- `POST /api/transcriptions`
- `POST /api/external-media/audio-imports`
- `POST /api/scripts/generation`

这些接口先返回 `pipeline_run_id`，不会保证请求返回时已经拿到最终 `fragment` 或 `script`。

联调顺序应改为：

1. 发起创建请求，拿到 `pipeline_run_id`
2. 轮询 `GET /api/pipelines/{run_id}`
3. 需要看步骤时，再查 `GET /api/pipelines/{run_id}/steps`
4. 失败后可调用 `POST /api/pipelines/{run_id}/retry`

当前补齐范围：

- 脚本生成页已经按上述任务态接入，会在成功后再跳转脚本详情
- 媒体上传和外链导入的客户端统一任务态展示仍属于后续阶段

### 0.1 Markdown 内容层当前怎么联调

这次内容层改造后，移动端需要区分两类碎片创建：

- 语音上传：继续走 `POST /api/transcriptions`
- 手动文本碎片：走 `POST /api/fragments/content`

当前返回和展示约定：

- 碎片详情优先读取 `compiled_markdown`
- 若是语音碎片且用户还没正式编辑内容，后端会回退到 `capture_text`
- 脚本详情优先读取 `body_markdown`
- 知识库后端已经支持 `body_markdown`，但移动端入口仍未完整接入

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

## 六、后端数据库迁移（本项目联调时常用）

当后端有 Alembic 新迁移（例如新增字段）时，先执行：

```bash
cd backend
.venv/bin/alembic upgrade head
```

当前后台任务流水线依赖以下新表已经存在：

- `pipeline_runs`
- `pipeline_step_runs`

## 七、前后端协作入口

如果移动端和后端由不同成员并行开发，默认遵守仓库内的协作规范：

- 协作规范：[`memory-bank/frontend-backend-collaboration.md`](/Users/hujiahui/Desktop/VibeCoding/SparkFlow/memory-bank/frontend-backend-collaboration.md)
- 架构总览：[`memory-bank/architecture.md`](/Users/hujiahui/Desktop/VibeCoding/SparkFlow/memory-bank/architecture.md)

移动端开发时，优先依据后端 `schemas.py`、`response_model` 和 `/docs` 中的 contract 接口说明接入；在真实接口未完成前，可以先按契约做 mock，但联调前要回到真实结构校验 loading、空态、错误态和处理中状态。
