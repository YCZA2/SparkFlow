# SparkFlow — 阶段 12.4 实施计划：碎片向量可视化（MVP 轻量版）

> 版本：v1
> 日期：2026-03-06
> 适用范围：阶段 12.4

---

## 1. 目标

为用户已向量化的碎片笔记提供一个可交互的"灵感云图"视图。

MVP 目标不是做完整 3D 语义宇宙，而是先稳定打通以下链路：

1. 从 ChromaDB 读取当前用户的全部碎片向量
2. 回表 SQLite 补齐业务字段并过滤失效数据
3. 生成可视化坐标与基础聚类结果
4. 在移动端展示轻量 2D/2.5D 云图
5. 支持按类别筛选、点击查看碎片、继续进入口播稿生成

---

## 2. 本阶段边界

### 2.1 纳入本次实施

- 当前登录用户的碎片可视化
- 基于现有 embedding 的 PCA 3D 坐标生成
- 基于原始 embedding 的 K-Means 聚类
- 基于 `tags` / `summary` 的类别命名
- `GET /api/fragments/visualization` API
- 移动端"灵感云图"页面
- 点位点击、类别筛选、从当前类别继续生成口播稿

### 2.2 明确不纳入本次实施

- Mode B 风格检索增强（12.3）
- UMAP / t-SNE / HDBSCAN
- Three.js / React Three Fiber
- LLM 实时为类别命名
- 独立 cluster 详情接口
- 力导向动画、球体包裹、连线网络、双击聚焦

---

## 3. 关键设计原则

### 3.1 复用现有数据

- 不重复调用 Embedding API
- 可视化只消费阶段 12.1 已写入的向量
- 任何缺失向量的碎片，不在当前版本里临时补算

### 3.2 聚类与展示分离

- 聚类在原始 embedding 上完成
- 展示只消费降维后的 `x/y/z`
- 不在降维后的 3D 坐标上做语义判断

### 3.3 降级优先

- 集合不存在：返回空结果
- 向量数量不足：只展示点，不聚类
- 聚类失败：整体退化为点位展示
- 单个脏数据：过滤，不拖垮整次请求

### 3.4 保持现有架构风格

- Router 只做鉴权、参数、响应封装
- Domain / Service 负责业务聚合
- Vector adapter 只负责 Chroma 数据读写

---

## 4. 目标文件清单

### 4.1 后端新增/修改

- `backend/services/base/base_vector_db.py`
- `backend/services/chroma_vector_db.py`
- `backend/services/vector_service.py`
- `backend/domains/fragments/service.py`
- `backend/routers/fragments.py`
- `backend/schemas/fragment.py`
- `backend/tests/test_core_flows.py`

### 4.2 建议新增文件

- `backend/services/vector_visualization_service.py`

如果后续更强调 domain 边界，也可以改为：

- `backend/domains/fragments/visualization_service.py`

MVP 阶段优先保持简单，建议先放 `services/`。

### 4.3 前端新增/修改

- `mobile/app/(tabs)/fragments.tsx`
- `mobile/app/fragment-cloud.tsx`
- `mobile/app/_layout.tsx`
- `mobile/features/fragments/api.ts`
- `mobile/features/fragments/hooks.ts`
- `mobile/types/fragment.ts`

如现有结构不适配，可新增：

- `mobile/components/FragmentCloud.tsx`
- `mobile/components/ClusterFilterBar.tsx`
- `mobile/features/fragments/visualization.ts`

---

## 5. 后端实施计划

### 步骤 1：补充向量批量读取能力

#### 目标

让向量层支持从某个 namespace 读取全部文档，包含 embedding 与 metadata。

#### 修改点

在 `base_vector_db.py` 增加一个新接口，例如：

```python
@abstractmethod
async def list_documents(
    self,
    namespace: str,
    include_embeddings: bool = True,
    **kwargs
) -> list[VectorDocument]:
    pass
```

如果 `VectorDocument` 不够表达读取结果，可以新增一个只读 dataclass，例如：

```python
@dataclass
class StoredVectorDocument:
    id: str
    text: str
    embedding: Optional[list[float]]
    metadata: Optional[dict[str, Any]]
```

#### Chroma 实现要求

- 使用 collection `get()`
- `include=["documents", "metadatas", "embeddings"]`
- namespace 不存在时返回空列表
- 某条 embedding 缺失时允许过滤

#### 验收标准

- 可读取 `fragments_{user_id}` 下的全部向量
- 返回结构统一，不泄漏 Chroma 原始响应格式

---

### 步骤 2：封装可视化数据聚合服务

#### 目标

把"向量读取 + 回表 + 降维 + 聚类 + 命名"收敛到一个服务函数中。

#### 建议函数签名

```python
async def build_fragment_visualization(
    db: Session,
    user_id: str,
) -> dict[str, Any]:
    pass
```

#### 服务内部职责

1. 读取当前用户全部向量文档
2. 提取 fragment ids
3. 回表查询数据库中的有效碎片
4. 过滤数据库中已不存在的向量结果
5. 构造可视化算法输入矩阵
6. 产出 points / clusters / stats / meta

#### 回表字段

- `id`
- `summary`
- `tags`
- `created_at`
- `transcript`
- `source`
- `sync_status`

#### 验收标准

- 服务输出结构稳定
- 数据库中不存在的碎片不会出现在结果里
- 无数据时返回空结构，不抛错

---

### 步骤 3：实现 PCA 3D 降维

#### 目标

为每个碎片生成稳定的 `x/y/z` 坐标。

#### 建议实现

优先使用 `scikit-learn`：

- `sklearn.decomposition.PCA`

如果你不想引入这个依赖，第二方案是用 `numpy.linalg.svd` 自己做 PCA；但实现和测试成本更高，不建议作为首选。

#### 输入

- `n x d` embedding matrix

#### 输出

- `n x 3` coordinates

#### 规范化建议

- 对 PCA 结果做简单缩放
- 将坐标归一化到 `[-1, 1]` 或近似范围
- 避免前端布局极端离散

#### 降级逻辑

- 向量数 `< 2`：直接返回 `(0, 0, 0)` 或简单线性铺开
- PCA 异常：记录 warning，退化为固定布局

#### 验收标准

- 相同输入多次调用，坐标输出稳定
- 点位不会全部重叠在一个位置

---

### 步骤 4：实现 K-Means 聚类

#### 目标

为足够数量的碎片生成基础主题簇。

#### 建议实现

- `sklearn.cluster.KMeans`
- `random_state` 固定，保证测试可重复

#### 聚类启用阈值

- `n < 5`：不聚类
- `5 <= n < 8`：默认只出点位
- `n >= 8`：启用聚类

#### 聚类数策略

```python
cluster_count = min(6, max(2, round(sqrt(n / 2))))
```

聚类数不能超过样本数。

#### 输出

每个点：

- `cluster_id`
- `is_noise=False`

每个簇：

- `id`
- `fragment_count`
- `centroid`

#### 验收标准

- 同一组输入多次运行，cluster id 分布稳定
- 聚类失败时不影响点位数据返回

---

### 步骤 5：生成类别标签

#### 目标

不依赖 LLM，为每个簇生成可读标签。

#### 规则

1. 优先统计该簇内 `tags` 的高频词
2. 若 tags 不足，则拆分 `summary` 做高频词统计
3. 取前 1-3 个关键词
4. 若完全无有效词，则标签为 `"未分类主题"` 或 `"灵感簇 {id}"`

#### 实现建议

- 先用最简单的词频方案
- 不做中文复杂分词
- 直接复用已有标签和摘要即可

#### 验收标准

- 簇标签稳定
- 不依赖外部服务
- 无标签/无摘要时仍能降级输出

---

### 步骤 6：设计 API 和 Schema

#### 路由

在 `backend/routers/fragments.py` 新增：

```python
@router.get("/visualization")
async def get_fragment_visualization(...):
    ...
```

#### 鉴权

- 使用 `get_current_user`
- 不接受 `user_id`

#### 响应体建议

```json
{
  "points": [
    {
      "id": "fragment-1",
      "x": 0.2,
      "y": -0.1,
      "z": 0.6,
      "summary": "关于定位的思考",
      "tags": ["定位", "个人品牌"],
      "created_at": "2026-03-06T10:00:00",
      "cluster_id": 1,
      "is_noise": false
    }
  ],
  "clusters": [
    {
      "id": 1,
      "label": "定位",
      "keywords": ["定位", "表达"],
      "fragment_count": 8,
      "centroid": { "x": 0.1, "y": 0.2, "z": 0.4 }
    }
  ],
  "stats": {
    "total_fragments": 12,
    "clustered_fragments": 8,
    "uncategorized_fragments": 4
  },
  "meta": {
    "projection": "pca",
    "clustering": "kmeans",
    "used_vector_source": "chromadb"
  }
}
```

#### Schema 建议

在 `backend/schemas/fragment.py` 新增：

- `FragmentVisualizationPoint`
- `FragmentVisualizationCluster`
- `FragmentVisualizationStats`
- `FragmentVisualizationResponse`

#### 验收标准

- Swagger 中接口结构清晰
- 返回格式与项目统一响应规范兼容

---

## 6. 前端实施计划

### 步骤 7：新增 API 封装与类型

#### 目标

让前端能请求云图数据并拥有明确类型定义。

#### 实现点

- 在 fragments feature 的 api 文件中新增 `getFragmentVisualization()`
- 在 types 中新增 visualization 相关类型

#### 验收标准

- 页面层不直接拼 fetch
- 类型结构和后端响应对齐

---

### 步骤 8：新增"灵感云图"页面

#### 页面建议

- 路由：`/fragment-cloud`
- 入口：先挂在碎片库页面右上角或顶部操作区

#### 页面结构

1. 顶部标题区
2. 类别筛选栏
3. 云图主区域
4. 底部详情卡片或弹层

#### 空状态

- 没有向量数据：提示用户先录入并完成几条碎片转写
- 碎片太少：仍可展示点位，但不显示类别筛选

---

### 步骤 9：实现轻量云图渲染

#### 渲染策略

- 用 `x/y` 作为平面坐标
- 用 `z` 映射点大小、阴影或透明度
- 点颜色按 `cluster_id` 区分
- 未分类点统一灰色

#### 推荐实现方式

- 使用普通 React Native View 布局和绝对定位
- 不引入 3D 引擎
- 点位通过百分比布局映射到容器宽高

#### 交互

- 点击点位：展示摘要、标签、时间
- 点击类别：过滤点位
- 点击详情卡片：跳转碎片详情页

#### 验收标准

- 页面在 iPhone 屏幕上可正常展示
- 点位可点击
- 筛选后视图与详情同步更新

---

### 步骤 10：支持从类别继续生成口播稿

#### 目标

让云图不只是看，还能作为创作入口。

#### MVP 做法

- 在某个 cluster 的筛选结果中允许多选碎片
- 调起已有的生成页 `/generate`
- 复用现有 `fragmentIds` 传参模式

#### 验收标准

- 从云图进入生成页时，已选碎片正确带入
- 不破坏现有碎片库多选流程

---

## 7. 测试计划

### 7.1 后端单元测试

建议新增以下场景：

1. namespace 不存在时返回空结果
2. 向量存在但数据库记录不存在时会过滤
3. 碎片数不足时不聚类，只返回点位
4. 聚类失败时退化为点位输出
5. 簇标签可由 tags/summary 生成

### 7.2 API 测试

新增接口测试：

1. `GET /api/fragments/visualization` 返回 200
2. 返回结构包含 `points/clusters/stats/meta`
3. 未带 token 返回 401

### 7.3 前端验证

1. 页面可正常加载
2. 点位渲染不越界
3. 类别筛选正确
4. 点击点位可查看详情
5. 从筛选结果继续生成口播稿

---

## 8. 依赖建议

### 后端建议新增

如果接受新增依赖，建议：

```txt
scikit-learn
numpy
```

说明：

- `numpy` 通常是 `scikit-learn` 的依赖
- 如果当前环境安装成本可接受，优先采用该方案

如果你不希望引入这组依赖，则需要改为：

- 自己实现 PCA
- 暂时取消聚类，只保留坐标投影

这会显著增加开发成本或降低效果，不建议作为首选。

---

## 9. 风险与应对

### 风险 1：向量读取接口改动会影响抽象层

应对：

- 新增接口而不是修改原有查询接口语义
- 保持现有 12.1 / 12.2 行为不变

### 风险 2：聚类结果不稳定

应对：

- 固定随机种子
- 控制聚类数上限
- 用原始 embedding 聚类，不用投影坐标聚类

### 风险 3：前端点位布局在小屏设备上拥挤

应对：

- 对坐标做归一化和边距约束
- 点位最小点击面积扩大
- 初版不显示过多文字，只在点击后展示详情

### 风险 4：数据量少导致可视化价值不高

应对：

- 做好空状态与低样本降级
- 提示用户继续积累更多碎片

---

## 10. 实施顺序建议

建议严格按下面顺序做，避免前后端互相等待：

1. 向量层补 `list_documents`
2. 可视化服务输出稳定 JSON
3. 后端接口与测试
4. 前端类型与 API 封装
5. 云图页面静态布局
6. 点位渲染
7. 筛选与详情交互
8. 复用生成页流程

---

## 11. 完成定义

当满足以下条件时，可认为阶段 12.4 MVP 完成：

1. 当前用户可通过接口获取可视化数据
2. 接口能处理空集合、少量碎片、脏数据过滤
3. App 中存在可访问的灵感云图页面
4. 用户可点击点位查看碎片信息
5. 用户可按类别筛选碎片
6. 用户可从云图进入口播稿生成流程

---

## 12. 后续升级方向

MVP 完成后，后续可继续迭代：

1. 用 UMAP 替换 PCA
2. 用 HDBSCAN 替换 K-Means
3. 加入 LLM 类别命名
4. 升级到真正 3D 渲染
5. 增加时间维度、最近 7 天筛选、主题演化视图

