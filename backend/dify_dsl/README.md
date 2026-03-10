# SparkFlow Dify DSL

这个目录存放可直接导入 Dify 的工作流 DSL 文件。

当前提供：

- `sparkflow_script_generation.workflow.yml`
  - 用途：将 SparkFlow 后端整理后的碎片上下文转换成结构化口播稿
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
3. 选择 `sparkflow_script_generation.workflow.yml`

## 导入后需要检查的项

1. LLM 节点的模型提供商
   - 当前 DSL 默认引用 `OpenAI / gpt-4o-mini`
   - 如果你的 Dify 里没有配置 OpenAI，需要在导入后改成你已接入的模型

2. Start 节点输入格式
   - Dify 的 Start 节点目前更适合文本类输入
   - 这个 DSL 将 `selected_fragments`、`knowledge_hits`、`web_hits` 等复杂输入定义为 JSON 字符串文本，再在 Code 节点里解析

3. 与 SparkFlow 后端的输入对齐
   - 当前 SparkFlow 后端已经按这个 DSL 的约定，把复杂字段序列化为 JSON 字符串后再提交
   - 对应字段包括 `selected_fragments`、`knowledge_hits`、`web_hits`、`user_context`、`generation_metadata`

4. 每日推盘 workflow 的输入差异
   - 每日推盘不复用脚本生成 workflow
   - 当前后端会向 daily push workflow 传递 `selected_fragments`、`fragments_text`、`target_date`、`trigger_kind`、`force`、`generation_metadata`
   - 如需为 daily push 单独搭建 Dify workflow，请按上述字段对齐 Start 节点输入

## 推荐命名

导入后建议把应用名保持为：

- `SparkFlow Script Generation`

然后将该应用生成的 API Key 填回：

- `DIFY_API_KEY`

再把 Dify 中显示的 workflow/app 标识填回：

- `DIFY_SCRIPT_WORKFLOW_ID`
- `DIFY_DAILY_PUSH_WORKFLOW_ID`

如果 daily push workflow 使用独立应用 API Key，还需要配置：

- `DIFY_DAILY_PUSH_API_KEY`
