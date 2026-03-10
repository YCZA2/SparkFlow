"""脚本工作流入参收敛测试。"""

from __future__ import annotations

from modules.scripts.context_builder import ResearchContext, build_workflow_inputs


def test_build_workflow_inputs_compacts_context_into_text_fields() -> None:
    """工作流入参应只保留 Dify Start 节点真正消费的文本字段。"""
    context = ResearchContext(
        mode="mode_a",
        query_hint="写一篇关于时间管理误区的口播稿",
        selected_fragments=[
            {
                "id": "fragment-1",
                "transcript": "忙不等于有效产出，很多人只是把时间切得更碎。",
                "summary": "讨论时间管理误区",
                "tags": ["时间管理", "效率"],
                "source": "manual",
                "created_at": "2026-03-10T00:00:00",
            }
        ],
        knowledge_hits=[
            {
                "title": "高赞时间管理文档",
                "doc_type": "high_likes",
                "score": 0.93,
                "body_markdown": "有效产出取决于优先级和反馈闭环。",
            }
        ],
        web_hits=[
            {
                "title": "时间管理文章",
                "url": "https://example.com/time",
                "snippet": "很多人把忙碌当成进展。",
            }
        ],
        user_context={},
        generation_metadata={"query_text_preview": "写一篇关于时间管理误区的口播稿"},
    )

    inputs = build_workflow_inputs(context)

    assert inputs["mode"] == "mode_a"
    assert inputs["query_hint"] == "写一篇关于时间管理误区的口播稿"
    assert "忙不等于有效产出" in inputs["fragments_text"]
    assert "高赞时间管理文档" in inputs["knowledge_context"]
    assert "https://example.com/time" in inputs["web_context"]
    assert set(inputs.keys()) == {"mode", "query_hint", "fragments_text", "knowledge_context", "web_context"}
