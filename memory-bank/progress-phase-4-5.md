# SparkFlow — 阶段 4-5: 前端基础与录音功能

> 最后更新：2026-03-04

---

## 阶段 4：前端碎片库列表页

### 任务清单

| 步骤 | 任务 | 状态 |
|------|------|------|
| 4.1 | 配置前端路由结构 (Tabs) | ✅ 已完成 |
| 4.2 | 创建 API 请求工具模块 | ✅ 已完成 |
| 4.3 | 实现碎片库列表页面 | ✅ 已完成 |
| 4.4 | 实现碎片详情页 | ✅ 已完成 |

### 4.3 碎片库列表页面

**文件**: `mobile/app/(tabs)/fragments.tsx`

**功能**:
- 使用 FlatList 渲染碎片列表
- 每个卡片展示：summary（优先）或 transcript 前50字符、tags、创建时间、来源
- 支持下拉刷新
- 空状态显示友好提示"还没有灵感碎片，去首页录一条吧"
- 错误状态显示重试按钮

**配套组件**:
- `FragmentCard` 组件：展示单个碎片卡片
- `useFragments` Hook：管理碎片列表数据获取和刷新

### 4.4 碎片详情页面

**文件**: `mobile/app/fragment/[id].tsx`

**功能**:
- 动态路由：`/fragment/[id]`
- 展示完整信息：
  - 同步状态和来源
  - AI 摘要（如果有）
  - 完整转写文本
  - 标签列表（如果有）
  - 音频路径（如果有）
  - 创建时间
- 导航栏右上角"删除"按钮
- 加载状态和错误状态处理

### 验证清单

```bash
# 1. 启动后端服务
cd backend
source .venv/bin/activate && uvicorn main:app --reload --host 0.0.0.0 --port 8000

# 2. 启动前端
cd mobile
npx expo start --ios

# 3. 验证碎片库列表页
# - 切换到"碎片库"Tab，确认显示碎片列表
# - 列表为空时显示"还没有灵感碎片，去首页录一条吧"
# - 下拉刷新功能正常

# 4. 验证碎片详情页
# - 点击列表中的任意碎片卡片
# - 跳转到详情页，显示完整内容
# - 点击"删除"按钮，确认删除后返回列表页
# - 点击"返回"按钮，返回列表页
```

---

## 阶段 5：录音功能

### 任务清单

| 步骤 | 任务 | 状态 |
|------|------|------|
| 5.1 | 创建首页录音按钮 UI | ✅ 已完成 |
| 5.2 | 实现 expo-av 录音功能 | ✅ 已完成 |
| 5.3 | 创建音频上传 API 端点 | ✅ 已完成 |
| 5.4 | 前端录音结束后自动上传音频 | ⏳ 待实施 |

### 5.1 录音按钮 UI

**文件**: `mobile/app/(tabs)/index.tsx`

**功能**:
- 顶部显示"灵感捕手"标题和副标题"随时记录你的灵感碎片"
- 底部红色大圆形录音按钮
- 按钮标签在"开始录音"和"停止录音"之间切换
- 状态文本提示（"点击开始录音"、"正在录音…"）

### 5.2 expo-av 录音功能

**配置**:
- 音频格式：.m4a (AAC 编码)
- 采样率：44100 Hz
- 声道数：1（单声道）
- 比特率：128000 bps
- 权限描述："需要访问麦克风来录制语音灵感"

**⚠️ 重要：录音功能必须在真机上测试，iOS 模拟器不支持录音**

### 5.3 音频上传 API 端点

**文件**: `backend/routers/transcribe.py`

**端点**:

| 端点 | 方法 | 说明 | 认证 |
|------|------|------|------|
| `/api/transcribe/` | POST | 上传音频文件 | Bearer Token |
| `/api/transcribe/status/{fragment_id}` | GET | 查询转写状态 | Bearer Token |

**POST /api/transcribe/ 功能**:
- 接收 multipart/form-data 格式的音频文件
- 支持格式：.m4a, .wav, .mp3, .aac
- 文件大小限制：最大 50MB
- 存储路径：`uploads/{user_id}/{uuid}.m4a`
- 创建碎片记录（sync_status='pending'）

### 验证清单

#### 5.1 录音按钮 UI 验证

```bash
npx expo start --ios

# 验证步骤：
# 1. 首页布局：顶部标题+副标题，底部红色大圆形按钮
# 2. 按钮交互：点击开始/停止状态切换
# 3. 状态文字：随录音状态变化
```

#### 5.2 录音功能验证（需真机）

```bash
# 连接 iPhone
npx expo run:ios --device

# 验证步骤：
# 1. 首次录音弹出麦克风权限请求
# 2. 计时器正常递增
# 3. 停止后显示录音文件路径
```

#### 5.3 音频上传 API 验证

```bash
# 1. 启动后端
source .venv/bin/activate && uvicorn main:app --reload

# 2. 获取 Token
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/token \
  -H "Content-Type: application/json" -d '{}' | \
  grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

# 3. 创建测试音频文件
echo "test audio content" > test_audio.m4a

# 4. 上传音频
curl -X POST http://localhost:8000/api/transcribe/ \
  -H "Authorization: Bearer $TOKEN" \
  -F "audio=@test_audio.m4a"

# 5. 验证文件存储
ls -la uploads/test-user-001/

# 6. 验证数据库记录
sqlite3 data.db "SELECT id, audio_path, sync_status FROM fragments WHERE source='voice' ORDER BY created_at DESC LIMIT 1;"
```

---

## 决策记录

| 日期 | 问题 | 决策 |
|------|------|------|
| 2026-03-03 | 开发者账号 | Apple ID 个人免费证书，7天重签周期 |
| 2026-03-03 | 音频转码 | **不转码**，直接使用 `.m4a` 格式 |
| 2026-03-03 | 存储配额检查 | MVP **跳过**配额检查 |
| 2026-03-03 | 离线支持 | MVP 仅 **在线-only**，离线同步后续迭代 |
