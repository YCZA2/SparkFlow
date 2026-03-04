# SparkFlow 开发脚本

统一开发脚本 `dev`，简化日常开发工作。

## 快速开始

```bash
# 同时启动后端和 iOS 模拟器（推荐）
./scripts/dev start
```

## 命令速查

| 命令 | 说明 |
|------|------|
| `start` | 同时启动后端和 iOS 模拟器 |
| `backend` | 仅启动后端服务 |
| `ios` | 仅启动 iOS 模拟器 |
| `build` | 构建 iOS 真机版本 |
| `build-sim` | 构建 iOS 模拟器版本 |
| `doctor` | 网络诊断（排查连接问题） |
| `logs` | 查看最新日志 |
| `clean` | 清理构建缓存 |
| `install` | 安装所有依赖 |

## 常用场景

### 1. 日常开发

```bash
./scripts/dev start
```

这会同时：
- 启动后端服务（uvicorn）
- 启动 iOS 模拟器
- 自动保存日志到 `logs/` 目录

按 `Ctrl+C` 停止所有服务。

### 2. 分开启动（需要调试时）

**终端 1 - 后端：**
```bash
./scripts/dev backend
```

**终端 2 - 前端：**
```bash
./scripts/dev ios
```

### 3. 构建 iOS 应用

```bash
# 构建到真机
./scripts/dev build

# 构建到模拟器
./scripts/dev build-sim
```

### 4. 网络诊断

如果手机无法连接后端：

```bash
./scripts/dev doctor
```

会检查：
- 本机 IP 地址
- 后端服务状态
- 网络连通性
- 提供解决方案

### 5. 查看日志

```bash
./scripts/dev logs
```

或实时查看：
```bash
tail -f logs/backend.log
tail -f logs/mobile.log
```

## 日志文件

| 文件 | 说明 |
|------|------|
| `logs/backend.log` | 后端服务日志 |
| `logs/mobile.log` | 前端开发服务器日志 |

## 旧脚本

以下脚本已整合到 `dev` 中，保留供参考：

- `build-ios.sh` → 使用 `./scripts/dev build`
- `network-doctor.sh` → 使用 `./scripts/dev doctor`
