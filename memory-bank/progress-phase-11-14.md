# SparkFlow — 阶段 11-14 现状记录

> 最后更新：2026-03-10

本文档只记录阶段 11-14 在当前仓库中的真实落地状态，不再沿用已经失真的旧路径和旧任务描述。

## 阶段 11：知识库基础

### 当前状态

| 子项 | 状态 | 说明 |
|------|------|------|
| 11.1 文档创建 API | 已完成 | `POST /api/knowledge` |
| 11.2 文档列表 / 详情 / 删除 / 更新 | 已完成 | `GET /api/knowledge` / `GET /api/knowledge/{id}` / `PATCH /api/knowledge/{id}` / `DELETE /api/knowledge/{id}` |
| 11.3 文件上传解析 | 已完成 | 支持 `.txt` / `.docx` |
| 11.4 Markdown 正文存储 | 已完成 | `knowledge_docs.body_markdown` 已落地 |
| 11.5 素材资源挂载基础层 | 已完成 | 已有统一 `media_assets` / `content_media_links` |
| 11.6 移动端知识库入口 | 部分完成 | 只有占位页，没有完整管理 UI |

### 当前实现位置

- Router: [`backend/modules/knowledge/presentation.py`](/Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend/modules/knowledge/presentation.py)
- Use case: [`backend/modules/knowledge/application.py`](/Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend/modules/knowledge/application.py)
- Repository: `backend/domains/knowledge/repository.py`
- Mobile placeholder: [`mobile/app/knowledge.tsx`](/Users/hujiahui/Desktop/VibeCoding/SparkFlow/mobile/app/knowledge.tsx)

### 已落地能力

- JSON 创建知识库文档。
- 表单上传 `.txt` / `.docx` 文件并解析内容。
- 知识库正文统一落到 `body_markdown`，并兼容下游纯文本提取。
- 按 `doc_type` 过滤与分页查询。
- 基于向量库进行知识库搜索。
- 删除时同步删除对应向量文档。

### 当前缺口

- 移动端没有真正的“我的方法论”管理页。
- 还没有完整的知识库 Markdown 编辑器和素材管理 UI。
- 长文档 chunking 还没有单独设计。
- 产品侧还没有决定知识库前端的最终交互。

## 阶段 12：向量数据库集成

### 当前状态

| 子项 | 状态 | 说明 |
|------|------|------|
| 12.1 碎片自动向量化 | 已完成 | 转写成功后自动写入 |
| 12.2 碎片语义相似检索 | 已完成 | `POST /api/fragments/similar` |
| 12.3 Markdown 正文参与内容消费 | 已完成 | 下游优先消费正式正文，缺失时回退机器转写 |
| 12.4 Mode B 历史碎片增强 | 未完成 | 仍未稳定接入生成流程 |
| 12.5 碎片向量可视化 | 已完成 | `GET /api/fragments/visualization` |
| 12.6 知识库向量化增强 | 部分完成 | 文档已写向量，但高级检索策略未展开 |

### 当前实现位置

- Vector adapter: [`backend/modules/shared/infrastructure.py`](/Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend/modules/shared/infrastructure.py)
- Container entry: [`backend/modules/shared/container.py`](/Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend/modules/shared/container.py)
- Fragment query/use case: [`backend/modules/fragments/application.py`](/Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend/modules/fragments/application.py)
- Visualization: [`backend/modules/fragments/visualization.py`](/Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend/modules/fragments/visualization.py)
- Chroma provider: `backend/services/chroma_vector_db.py`

### 已落地能力

- 转写完成后自动生成 embedding 并写入 `fragments_{user_id}`。
- `fragment_blocks` 编译结果和 `body_markdown` 已能进入脚本上下文、daily push 与知识库消费链路。
- 可按语义查询相似碎片，并回表补齐摘要、标签、来源和时间。
- 灵感云图可批量读取用户向量，做 PCA / 聚类 / fallback projection。
- 知识库文档创建时会同步写入 `knowledge_{user_id}`。

### 当前缺口

- `mode_b` 还没有系统化利用相似碎片作为风格参考。
- 知识库侧还没有 chunk、混合检索、重排序等增强策略。
- 碎片多模态 block 还没有开放，当前只有 Markdown block。

## 阶段 13：每日灵感推盘

### 当前状态

| 子项 | 状态 | 说明 |
|------|------|------|
| 13.1 每日聚合用例 | 已完成 | `DailyPushUseCase` + `daily_push_generation` pipeline 已存在 |
| 13.2 APScheduler 定时任务 | 已完成 | app lifespan 中自动启动 |
| 13.3 查询 / 触发 API | 已完成 | `GET/POST /api/scripts/daily-push*`，触发接口返回异步 `pipeline_run_id` |
| 13.4 移动端首页灵感卡片 | 部分完成 | hooks 已有，当前主首页未稳定接入 |

### 当前实现位置

- Use case: [`backend/modules/scripts/application.py`](/Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend/modules/scripts/application.py)
- Pipeline: [`backend/modules/scripts/daily_push_pipeline.py`](/Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend/modules/scripts/daily_push_pipeline.py)
- Selector rules: [`backend/modules/scripts/daily_push.py`](/Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend/modules/scripts/daily_push.py)
- Router: [`backend/modules/scripts/presentation.py`](/Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend/modules/scripts/presentation.py)
- Scheduler: [`backend/modules/scheduler/application.py`](/Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend/modules/scheduler/application.py)
- App bootstrap: [`backend/main.py`](/Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend/main.py)
- Mobile hooks: `mobile/features/scripts/hooks.ts`

### 已落地能力

- 查询今日 daily push 稿件。
- 为当前用户手动触发异步生成，并返回 `pipeline_run_id`。
- 提供强制触发入口，忽略语义集中度不足的限制，同样走异步 pipeline。
- 定时任务按 `APP_TIMEZONE` 和配置时间自动执行。
- 通过向量相似度图找出主题最集中的碎片集合。
- 每日推盘正文生成已切到 Dify workflow，不再走后端直连 `llm_provider.generate(...)`。

### 当前缺口

- 当前主首页并没有稳定展示“昨天的 N 个灵感，已为你写成待拍脚本”的卡片。
- 本地推送通知链路还没有作为成品收口到移动端主路径。

## 阶段 14：收尾与全流程验证

### 当前状态

| 子项 | 状态 | 说明 |
|------|------|------|
| 14.1 后端路由与核心流程自动化验证 | 部分完成 | `backend/tests` 已覆盖多条主路径 |
| 14.2 数据库预留字段检查 | 部分完成 | schema 已具备核心预留字段 |
| 14.3 API 契约与异常路径检查 | 部分完成 | 有 route contracts / core flow tests |
| 14.4 Markdown 内容层与资源层验证 | 已完成 | 路由契约、核心测试、全量测试均已通过 |
| 14.5 文档收口 | 进行中 | 本次已更新 README / architecture / progress / 计划文档 |

### 当前已有验证

- `backend/tests/test_route_contracts.py`
- `backend/tests/test_core_flows.py`
- `mobile/package.json` 中的 `npm run test:state`
- `bash scripts/test-all.sh` 全量测试已通过

### 当前仍缺的验证

- 真机完整冒烟：录音 -> 转写 -> 合稿 -> 拍摄 -> 相册保存。
- daily push 前端主路径验证。
- 知识库移动端真实入口验证。
- `backend/dify_dsl/README.md`、`CLAUDE.md`、移动端使用说明和 onboarding 口径还需要继续收口。

## 当前结论

- 阶段 11 不是“未完成”，而是“后端完成、前端占位”。
- 阶段 12 的主干能力已经可用，未完成项集中在增强体验而非基础设施。
- 阶段 13 不能再标记为“待开始”，后端链路已经存在。
- 阶段 14 也不是完全空白，测试和文档已经有基础，只是还没有完成最终收口。
- 当前文档口径已经切换到“当前版本范围”，不再把未来规划当成当前交付内容。
