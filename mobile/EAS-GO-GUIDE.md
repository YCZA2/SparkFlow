# Expo SDK 55 自定义 Expo Go 构建与 TestFlight 分发指南

> 由于官方 Expo Go 在 App Store 上还未支持 SDK 55，我们需要使用 `eas go` 创建自定义构建并上传到 TestFlight 进行分发。

## 前置要求

- ✅ Xcode 26+（当前: 26.3）
- ✅ Node.js 18+（当前: v24.3.0）
- ✅ Expo SDK 55（当前: ~55.0.4）
- ✅ Apple Developer 账号（个人免费版或付费版）

---

## 第一步：修复 npm 并安装 EAS CLI

由于当前 npm 认证有问题，请先执行以下命令：

```bash
# 清除 npm 缓存
npm cache clean --force

# 重新登录 npm
npm login

# 安装 EAS CLI
npm install -g @expo/eas-cli

# 验证安装
eas --version
```

如果 npm 登录仍有问题，可以尝试：
```bash
# 使用 corepack（Node.js 16+ 内置）
corepack enable
yarn global add @expo/eas-cli
```

---

## 第二步：登录 EAS 并初始化项目

```bash
cd /Users/hujiahui/Desktop/VibeCoding/SparkFlow/mobile

# 登录 Expo 账户（需要有 Expo 账号）
eas login

# 初始化 EAS 项目（如果提示已有配置，选择更新）
eas init

# 或者手动创建项目后关联
eas project:create
```

执行 `eas init` 后：
- 系统会在 `app.json` 中自动添加 `extra.eas.projectId`
- 请记下这个 projectId

---

## 第三步：使用 eas go 创建自定义 Expo Go

Expo SDK 55 新增的 `eas go` 命令可以快速创建支持特定 SDK 版本的自定义 Expo Go：

```bash
# 创建 iOS 版本的自定义 Expo Go（用于 TestFlight）
eas go --platform ios

# 或者创建模拟器版本（用于开发测试）
eas go --platform ios --profile development
```

### 构建配置说明

构建过程中会提示以下选项：

| 选项 | 推荐选择 | 说明 |
|------|---------|------|
| Build type | `app` | 创建 .ipa 文件 |
| iOS credentials | `Generate new credentials` | 自动生成签名证书 |
| Apple Team | 选择你的 Apple ID 团队 | 个人免费证书或付费团队 |

### 构建流程

```bash
# 完整的自定义 Expo Go 构建命令
eas build --profile development --platform ios --type app

# 或者使用交互式向导
eas build
# 然后选择:
# - Platform: iOS
# - Profile: development (或 preview)
# - Build type: app
```

---

## 第四步：上传到 TestFlight

构建完成后，EAS 会提供下载链接。要上传到 TestFlight：

### 方式 1：EAS 自动上传（推荐）

```bash
# 修改 eas.json 添加自动提交配置
```

编辑 `eas.json`：

```json
{
  "cli": {
    "version": ">= 16.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "store",
      "ios": {
        "ascAppId": "YOUR_APP_STORE_CONNECT_APP_ID"
      }
    }
  },
  "submit": {
    "production": {
      "ios": {
        "ascAppId": "YOUR_APP_STORE_CONNECT_APP_ID",
        "ascTeamId": "YOUR_TEAM_ID"
      }
    }
  }
}
```

然后运行：
```bash
# 构建并自动提交到 TestFlight
eas build --platform ios --profile development --auto-submit
```

### 方式 2：手动上传到 TestFlight

1. 从 EAS 构建页面下载 `.ipa` 文件
2. 打开 Xcode → Window → Organizer
3. 点击 "Distribute App" → "App Store Connect" → "Upload"
4. 选择你的开发团队，上传构建

---

## 第五步：测试用户安装

上传到 TestFlight 后：

1. 在 App Store Connect 中邀请测试人员
2. 测试人员会收到邮件邀请
3. 安装 TestFlight App（从 App Store 下载）
4. 在 TestFlight 中接受邀请并安装 SparkFlow-mobile

---

## 常见问题

### Q: 个人免费开发者证书可以使用吗？
**A:** 可以，但有以下限制：
- 免费证书签名的 App 7 天后会过期
- TestFlight 需要付费开发者账号（$99/年）
- 免费证书只能用于本地真机调试：`npx expo run:ios --device`

### Q: 如何获取 App Store Connect App ID？
**A:**
1. 访问 https://appstoreconnect.apple.com
2. 进入 "我的 App" → 创建新 App
3. 填写名称、Bundle ID（与 app.json 中的 `bundleIdentifier` 一致）
4. 创建后，App ID 显示在 URL 或 App 信息页面

### Q: 构建失败怎么办？
**A:** 检查以下几点：
- `app.json` 中的 `bundleIdentifier` 是否唯一
- iOS 权限描述是否完整（NSMicrophoneUsageDescription, NSCameraUsageDescription, NSPhotoLibraryUsageDescription）
- `package.json` 中的依赖版本是否兼容

### Q: 可以跳过 TestFlight 直接安装吗？
**A:** 可以，使用内部测试（Internal Distribution）：
```bash
# 修改 eas.json
"preview": {
  "distribution": "internal"
}

# 构建后生成安装链接
eas build --profile preview --platform ios
```

---

## 参考文档

- [Expo SDK 55 Changelog](https://expo.dev/changelog/sdk-55)
- [EAS Build Documentation](https://docs.expo.dev/build/introduction/)
- [EAS Go Command](https://docs.expo.dev/develop/development-builds/create-a-go-build/)
- [TestFlight 分发指南](https://docs.expo.dev/submit/ios/)

---

## 下一步

完成自定义 Expo Go 构建后，你的团队就可以：
1. 通过 TestFlight 安装 SparkFlow-mobile
2. 使用 Expo Go 扫描项目 QR 码
3. 在真机上测试录音、相机等原生功能

然后可以继续开发 **阶段 5.3（音频上传 API）** 和后续功能。
