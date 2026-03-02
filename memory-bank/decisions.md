# SparkFlow MVP 决策记录

> 本文档记录开发前确认的关键技术决策，确保项目执行一致性。
> 最后更新：2026-03-03

---

## 决策汇总

| # | 决策项 | 决策内容 | 影响范围 |
|---|--------|----------|----------|
| 1 | 开发者账号 | Apple ID 个人免费证书 | 真机测试可行，需每7天重新部署 |
| 2 | API 提供商 | 阿里云全家桶（LLM + STT + Embedding） | 需要配置 `.env` 中的阿里云密钥 |
| 3 | 音频转码 | **不转码**，直接使用 `.m4a` | 简化步骤，移除 pydub + ffmpeg 依赖 |
| 4 | 存储配额 | MVP **跳过**配额检查 | `users.storage_quota` 字段预留但不使用 |
| 5 | 离线支持 | MVP 仅支持 **在线-only** | 网络恢复时自动同步机制后续迭代 |
| 6 | Mode B 实现 | 分阶段实现 | 阶段8简化（无知识库），阶段12增强 |
| 7 | 每日推盘关联 | 数量 ≥3 **且** 语义相似度匹配 | 使用向量检索找相关碎片 |
| 8 | 测试用户 Token | 硬编码 `/api/auth/token` 返回固定 Token | 简化开发流程 |

---

## 详细说明

### 1. 开发者账号

**决策**：使用 Apple ID 个人免费证书

**可行性**：
- ✅ 可以在真机上运行测试
- ✅ 通过 Xcode → Preferences → Accounts 添加 Apple ID 自动创建证书
- ⚠️ 限制：7天后需要重新签名，App 重启后失效（开发测试足够）

**配置步骤**：
```bash
# 部署到真机
npx expo run:ios --device

# 首次需要在 iPhone 设置中信任开发者
# 设置 → 通用 → VPN与设备管理 → 信任开发者证书
```

---

### 2. API 提供商

**决策**：使用阿里云全家桶

| 能力 | 服务 | 模型/SDK | 环境变量 |
|------|------|----------|----------|
| LLM | 阿里通义千问 | `qwen-turbo` 或 `qwen-max` | `DASHSCOPE_API_KEY` |
| STT | 阿里云语音识别 NLS | `alibabacloud-nls` | `ALIBABA_CLOUD_*` |
| Embedding | 阿里通义千问 | `text-embedding-v2` | 复用 `DASHSCOPE_API_KEY` |
| 向量数据库 | ChromaDB | 本地持久化 | `CHROMADB_PATH` |

**预留扩展接口**：
- `LLM_PROVIDER=qwen` 可切换为 `wenxin`, `zhipu`, `openai`
- `STT_PROVIDER=aliyun` 可切换为 `xunfei`, `baidu`
- `VECTOR_DB_PROVIDER=chromadb` 可切换为 `pinecone`, `qdrant`

---

### 3. 音频转码

**决策**：MVP 阶段 **不转码**，直接使用 `.m4a` 格式

**理由**：
- 阿里云 NLS 已支持 `.m4a` 格式
- 转码增加复杂度和依赖（需要 pydub + ffmpeg）
- MVP 阶段无需回放功能，原始文件直接存储

**影响**：
- 删除 implementation-plan.md 步骤 2.11 的转码相关内容
- 更新 progress.md 标记 2.11 为"不转码"
- 移除 pydub 依赖

---

### 4. 存储配额

**决策**：MVP **跳过**配额检查逻辑

**说明**：
- `users.storage_quota` 字段已在数据库 Schema 中预留（默认 1GB）
- MVP 阶段不实现配额检查和限制逻辑
- 后续版本（有付费模式时）再启用

---

### 5. 离线支持

**决策**：MVP 仅支持 **在线-only**

**实现**：
- 有网络：正常上传、转写、生成
- 无网络：提示用户"请检查网络连接"，录音保留在本地但不自动同步

**后续迭代**：
- 网络恢复时自动同步机制
- 本地 SQLite 队列 + 同步状态管理

---

### 6. Mode B 实现（分阶段）

**决策**：分两个阶段实现 Mode B

**阶段 8（MVP）**：
- Mode B 仅基于选中的碎片内容生成
- 不检索知识库
- Prompt 强调"保持用户原文的语气词、口头禅"

**阶段 12（增强）**：
- 在调用 LLM 前，使用碎片内容作为查询文本
- 检索用户知识库中最相关的 3 段文本
- 将检索结果作为 LLM system prompt 的补充上下文
- 实现真正的"学习用户个人表达"能力

---

### 7. 每日推盘关联逻辑

**决策**：数量 ≥3 **且** 语义相似度匹配

**算法**：
1. 查询用户昨天（过去 24 小时）创建的碎片笔记
2. **数量检查**：碎片数量 ≥ 3 条
3. **语义关联检查**：
   - 使用向量检索，检查这些碎片是否与用户历史碎片有语义关联
   - 主题相似度达到一定阈值才认为"相关联"
4. 满足以上条件时，合并关联碎片的 `transcript`
5. 使用 Mode A 的 Prompt 调用 LLM 生成口播稿

**边界处理**：
- 如果碎片不足 3 条：不生成
- 如果 3 条以上但主题不相关：不生成
- 如果有关联但相似度低：降低阈值或只取最高相似度的几条

---

### 8. 测试用户 Token

**决策**：硬编码 `/api/auth/token` 返回固定测试用户 Token

**实现**：
```python
# backend/routers/auth.py
@router.post("/api/auth/token")
def get_test_token():
    """返回固定测试用户的 JWT Token（仅开发测试使用）"""
    token = create_access_token(
        user_id="test-user-001",
        role="user"
    )
    return {"access_token": token, "token_type": "bearer"}
```

**说明**：
- 固定用户 ID：`test-user-001`
- 固定昵称：`测试博主`
- 固定角色：`user`
- 为未来多用户改造预留接口

---

## 环境变量检查清单

在开始开发前，请确认已准备好以下阿里云密钥：

- [ ] `DASHSCOPE_API_KEY` - 阿里云灵积平台（通义千问 LLM + Embedding）
- [ ] `ALIBABA_CLOUD_ACCESS_KEY_ID` - 阿里云 RAM AccessKey
- [ ] `ALIBABA_CLOUD_ACCESS_KEY_SECRET` - 阿里云 RAM AccessKey Secret
- [ ] `ALIBABA_CLOUD_APP_KEY` - 阿里云 NLS 应用 Key

**获取地址**：
- DashScope（灵积平台）：https://dashscope.aliyun.com/
- RAM AccessKey：https://ram.console.aliyun.com/manage/ak
- NLS 语音识别：https://nls-portal.console.aliyun.com/

---

## 下一步行动

确认以上决策后，可以开始执行：

1. **阶段 0.1**：安装系统级依赖（Python 3.12, Node.js, Watchman, Xcode）
2. **阶段 0.2**：创建项目根目录与 Git 仓库
3. **阶段 0.3**：搭建 FastAPI 后端骨架
4. ...（继续按 implementation-plan.md 执行）
