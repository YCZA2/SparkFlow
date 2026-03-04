# 本地真机开发指南（无需 TestFlight）

> 使用本地开发模式在 iPhone 真机上直接运行和测试，无需付费开发者账号或 TestFlight。

## 前置要求

- macOS + Xcode 26+
- iPhone（iOS 15.1+）
- Apple ID（普通账号即可，免费）
- 同一 WiFi 网络

---

## 第一步：配置 Xcode + Apple ID

1. 打开 Xcode → Preferences → Accounts
2. 点击 `+` → 选择 "Apple ID"
3. 登录你的 Apple ID（2814350365@qq.com）
4. 选择 "Personal Team"（个人团队）

⚠️ **免费证书限制**：
- 应用 7 天后会过期，需要重新构建安装
- 开发测试完全够用

---

## 第二步：连接 iPhone 并信任电脑

1. 用 USB 线连接 iPhone
2. 手机上会弹出 "信任此电脑？" → 点击 "信任"
3. 输入手机解锁密码

---

## 第三步：生成 iOS 原生项目（CNG）

```bash
cd /Users/hujiahui/Desktop/VibeCoding/SparkFlow/mobile

# 生成 ios 和 android 目录（Continuous Native Generation）
npx expo prebuild --platform ios

# 或完整生成
npx expo prebuild
```

这会创建 `ios/` 目录，包含完整的 Xcode 项目。

---

## 第四步：运行到真机

### 方式 1：命令行（推荐）

```bash
# 自动检测连接的设备并运行
npx expo run:ios --device

# 或明确指定设备
npx expo run:ios --device "你的 iPhone 名称"
```

第一次运行会：
1. 自动签名应用（使用你的 Personal Team）
2. 编译原生代码
3. 安装到 iPhone
4. 启动 Metro 开发服务器

### 方式 2：Xcode 运行

```bash
# 打开 Xcode 项目
open ios/SparkFlowMobile.xcworkspace
```

然后在 Xcode 中：
1. 选择目标设备（你的 iPhone）
2. 选择 Team（你的 Personal Team）
3. 点击 Run 按钮（▶️）

---

## 第五步：信任开发者证书（首次安装）

安装完成后，iPhone 上会提示 "无法打开应用"，需要：

1. iPhone → 设置 → 通用 → VPN 与设备管理
2. 找到你的 Apple ID
3. 点击 "信任"
4. 再次点击 "信任" 确认

---

## 第六步：开始开发

应用启动后会显示 Expo 开发菜单，现在你可以：

1. **测试录音功能**：
   - 点击首页录音按钮
   - 允许麦克风权限
   - 录制语音并查看文件路径

2. **连接后端**：
   - 确保后端运行在局域网可访问的地址
   - 修改前端 API 配置指向你的电脑 IP

---

## 常见问题

### Q: 构建失败 "Signing certificate error"
**A**: 在 Xcode 中手动选择 Team：
```bash
open ios/SparkFlowMobile.xcworkspace
# 然后选择项目 → Signing & Capabilities → 选择你的 Team
```

### Q: "Could not find device"
**A**: 确保 iPhone 已连接并解锁：
```bash
# 查看连接的设备
xcrun xctrace list devices
```

### Q: 7 天后应用打不开了
**A**: 这是免费证书限制，重新运行：
```bash
npx expo run:ios --device
```

### Q: 如何同时保持数据？
**A**: 使用 Expo SecureStore 或 SQLite，数据存储在手机上，重新安装不会丢失。

---

## 与后端联调

### 修改前端 API 地址

编辑 `mobile/utils/api.ts`：

```typescript
// 使用你的电脑局域网 IP（不是 localhost）
const BASE_URL = 'http://192.168.1.xxx:8000';
```

查看你的 IP：
```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
```

### 确保后端监听所有接口

```bash
cd /Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend
source .venv/bin/activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

---

## 下一步

运行成功后，继续开发：
1. 阶段 5.3：创建音频上传 API
2. 阶段 5.4：前端录音后自动上传
3. 阶段 6：语音转写集成

完整录音流程验证：
- 录音 → 保存本地 → 上传后端 → STT 转写 → 创建碎片
