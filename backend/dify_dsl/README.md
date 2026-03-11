# SparkFlow Dify DSL

这个目录存放可直接导入 Dify 的工作流 DSL 文件。

当前提供：

- `sparkflow_script_generation_mode_a.workflow.yml`
  - 用途：生成强结构、可直接拍摄的 mode_a 口播稿
  - 风格：黄金三秒开头 + 痛点陈述 + 干货正文 + 互动引导结尾
  - 输出字段：`title`、`outline`、`draft`、`used_sources`、`review_notes`、`model_metadata`
- `sparkflow_script_generation_mode_b.workflow.yml`
  - 用途：生成更自然、更像创作者本人表达的 mode_b 口播稿
  - 风格：优先保留真实口吻、叙事节奏和自然衔接
  - 输出字段：`title`、`outline`、`draft`、`used_sources`、`review_notes`、`model_metadata`

当前仓库还支持独立的每日推盘 workflow，但 DSL 文件暂未内置到仓库：

- daily push workflow
  - 用途：消费每日推盘筛选后的碎片集合，生成今日待拍稿
  - 最少输出字段：`draft`
  - 可选输出字段：`title`、`outline`、`model_metadata`

## 导入方式

在 Dify Web 中进入：

1. `Studio`
2. `Create from DSL file`
3. 分别导入 `sparkflow_script_generation_mode_a.workflow.yml` 与 `sparkflow_script_generation_mode_b.workflow.yml`

或者直接在仓库里自动导入并回填后端 `.env`：

```bash
cd backend
.venv/bin/python scripts/import_dify_workflow.py \
  --mode mode_a \
  --console-email your-email@example.com \
  --console-password 'your-password'

.venv/bin/python scripts/import_dify_workflow.py \
  --mode mode_b \
  --console-email your-email@example.com \
  --console-password 'your-password'
```

脚本会优先读取对应 mode 的 app 标识：

- 如果已存在，会对对应 Dify app 执行原地更新
- 如果不存在，才会创建新的 Dify app

## 导入后需要检查的项

1. LLM 节点的模型提供商
   - 当前 DSL 默认引用 `OpenAI / gpt-4o-mini`
   - 如果你的 Dify 里没有配置 OpenAI，需要在导入后改成你已接入的模型

2. Start 节点输入格式
   - Dify 的 Start 节点只接收少量文本字段
   - 当前脚本工作流输入为 `mode`、`query_hint`、`fragments_text`、`knowledge_context`、`web_context`
   - 不再要求在 Dify 侧解析 `selected_fragments`、`knowledge_hits`、`web_hits` 这类 JSON 字符串

3. 与 SparkFlow 后端的输入对齐
   - 当前 SparkFlow 后端会先把碎片、知识库命中和网页命中整理成可读文本，再提交给 Dify
   - 这样提示词逻辑保留在工作流里，Start 节点只承载工作流真正需要的内容

4. 每日推盘 workflow 的输入差异
   - 每日推盘不复用脚本生成 workflow
   - 当前后端会向 daily push workflow 传递 `selected_fragments`、`fragments_text`、`target_date`、`trigger_kind`、`force`、`generation_metadata`
   - 如需为 daily push 单独搭建 Dify workflow，请按上述字段对齐 Start 节点输入

## 推荐命名

导入后建议把应用名保持为：

- `SparkFlow Script Generation Mode A`
- `SparkFlow Script Generation Mode B`

然后将各自生成的 API Key 填回：

- `DIFY_MODE_A_API_KEY`
- `DIFY_MODE_B_API_KEY`

再把 Dify 中显示的 workflow/app 标识填回：

- `DIFY_MODE_A_APP_ID`
- `DIFY_MODE_A_WORKFLOW_ID`
- `DIFY_MODE_B_APP_ID`
- `DIFY_MODE_B_WORKFLOW_ID`
- `DIFY_DAILY_PUSH_WORKFLOW_ID`

如果 daily push workflow 使用独立应用 API Key，还需要配置：

- `DIFY_DAILY_PUSH_API_KEY`
