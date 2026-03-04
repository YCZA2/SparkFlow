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
| 5.4 | 前端录音结束后自动上传音频 | ✅ 已完成 |

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

### 5.4 前端录音结束后自动上传音频

**文件**: `mobile/app/(tabs)/index.tsx`, `mobile/utils/api.ts`

**功能**:
- 录音停止后自动调用 `handleUploadAudio` 上传音频文件
- 上传使用 `multipart/form-data` 格式
- 显示上传进度和状态（上传中、成功、失败）
- 网络错误处理：提示用户检查网络
- 重复提交防护：`isUploading` 状态防止同一条录音重复上传
- 允许开始新的录音（并行录制不受限制）

**实现细节**:
```typescript
// 上传状态管理
const [isUploading, setIsUploading] = useState(false);
const [uploadResult, setUploadResult] = useState(...);
const [uploadError, setUploadError] = useState(...);

// 录音停止后自动上传
const stopRecording = async () => {
  // ... 停止录音逻辑
  if (uri) {
    setRecordedUri(uri);
    await handleUploadAudio(uri);  // 自动上传
  }
};

// 上传函数
const handleUploadAudio = async (uri: string) => {
  setIsUploading(true);
  try {
    const result = await uploadAudio(uri);
    // 显示成功状态
  } catch (error) {
    // 处理网络错误和上传失败
  }
};
```

**UI 状态显示**:
- 上传中：显示加载指示器和"正在上传音频..."提示
- 上传成功：显示绿色勾选图标和播放按钮
- 上传失败：显示红色错误图标和"重新上传"按钮
- 录音按钮在上传过程中禁用并显示加载指示器

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

#### 5.4 前端录音上传验证（需真机 + 后端）

```bash
# 1. 启动后端
source .venv/bin/activate && uvicorn main:app --reload --host 0.0.0.0 --port 8000

# 2. 连接 iPhone 启动前端
npx expo run:ios --device

# 3. 验证步骤：
# 步骤 A: 正常上传流程
# - 点击"开始录音"，对着手机说话 5-10 秒
# - 点击"停止录音"
# - 界面显示"正在上传音频..."加载状态
# - 上传成功后显示绿色勾选图标和"上传成功"提示
# - 弹出"音频已上传，正在后台转写中..."提示框

# 步骤 B: 验证后端文件存储
ls -la backend/uploads/test-user-001/
# 应该看到新上传的 .m4a 文件

# 步骤 C: 验证数据库记录
sqlite3 backend/data.db "SELECT id, audio_path, sync_status, source FROM fragments ORDER BY created_at DESC LIMIT 1;"
# 应该看到 source='voice', sync_status='pending' 的记录

# 步骤 D: 网络错误处理
# - 关闭后端服务或断开手机 WiFi
# - 再次录音并停止
# - 应该显示"网络不可用，请检查网络连接后重试"提示

# 步骤 E: 重复提交防护
# - 开始录音 → 停止 → 立即再次点击录音
# - 由于正在上传，录音按钮显示加载指示器（灰色禁用状态）
# - 等待上传完成后才能开始新的录音
```

**预期结果**：
- [ ] 录音停止后自动触发上传，无需手动操作
- [ ] 上传过程中显示加载状态
- [ ] 上传成功显示绿色勾选图标
- [ ] 上传失败显示红色错误图标和"重新上传"按钮
- [ ] 后端 `uploads/test-user-001/` 目录出现新文件
- [ ] 数据库 `fragments` 表新增 source='voice' 的记录
- [ ] 网络错误时显示友好的错误提示
- [ ] 上传过程中录音按钮被禁用

---

## 决策记录

| 日期 | 问题 | 决策 |
|------|------|------|
| 2026-03-03 | 开发者账号 | Apple ID 个人免费证书，7天重签周期 |
| 2026-03-03 | 音频转码 | **不转码**，直接使用 `.m4a` 格式 |
| 2026-03-03 | 存储配额检查 | MVP **跳过**配额检查 |
| 2026-03-03 | 离线支持 | MVP 仅 **在线-only**，离线同步后续迭代 |
