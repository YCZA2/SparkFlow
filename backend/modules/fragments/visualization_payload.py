from __future__ import annotations

import hashlib
import logging
import re
from collections import Counter, defaultdict
from typing import Any, Optional

from models import Fragment
from utils.serialization import format_iso_datetime, parse_json_list

from .visualization_math import cluster_embeddings, project_embeddings_to_coordinates

logger = logging.getLogger(__name__)

SUMMARY_SPLIT_RE = re.compile(r"[\s,，。.!！?？;；:：/\\\-\n\r\t]+")
TOKEN_RE = re.compile(r"[A-Za-z0-9_]{2,}|[\u4e00-\u9fff]{2,}")
STOPWORDS = {
    "我们",
    "你们",
    "他们",
    "这个",
    "那个",
    "一个",
    "一种",
    "一些",
    "因为",
    "所以",
    "如果",
    "然后",
    "就是",
    "自己",
    "怎么",
    "什么",
    "可以",
    "时候",
    "内容",
    "问题",
    "思考",
    "关于",
}


def _empty_response() -> dict[str, Any]:
    return {
        "points": [],
        "clusters": [],
        "stats": {
            "total_fragments": 0,
            "clustered_fragments": 0,
            "uncategorized_fragments": 0,
        },
        "meta": {
            "projection": "pca",
            "clustering": "kmeans",
            "used_vector_source": "vector_store",
        },
    }


def _round_coordinate(value: float) -> float:
    return round(value, 6)


def _normalize_vector(values: list[float]) -> Optional[list[float]]:
    total = sum(value * value for value in values)
    if total <= 1e-12:
        return None
    norm = total ** 0.5
    return [value / norm for value in values]


def _summary_terms(summary: Optional[str]) -> list[str]:
    if not summary:
        return []
    terms: list[str] = []
    for chunk in SUMMARY_SPLIT_RE.split(summary):
        normalized = chunk.strip()
        if not normalized:
            continue
        if 2 <= len(normalized) <= 12:
            terms.append(normalized)
            continue
        for token in TOKEN_RE.findall(normalized):
            candidate = token.strip()
            if 2 <= len(candidate) <= 12:
                terms.append(candidate)
    return [term for term in terms if term not in STOPWORDS]


def _cluster_keywords(fragments: list[Fragment]) -> list[str]:
    tags_counter: Counter[str] = Counter()
    for fragment in fragments:
        for tag in parse_json_list(fragment.tags, allow_csv_fallback=True) or []:
            normalized = tag.strip()
            if normalized:
                tags_counter[normalized] += 1
    if tags_counter:
        return [item for item, _ in tags_counter.most_common(3)]

    summary_counter: Counter[str] = Counter()
    for fragment in fragments:
        for term in _summary_terms(fragment.summary):
            summary_counter[term] += 1
    if summary_counter:
        return [item for item, _ in summary_counter.most_common(3)]

    for fragment in fragments:
        if fragment.summary:
            return [fragment.summary[:8]]
    return []


def _cluster_label(cluster_id: int, fragments: list[Fragment]) -> tuple[str, list[str]]:
    keywords = _cluster_keywords(fragments)
    if keywords:
        return keywords[0], keywords
    return f"灵感簇 {cluster_id}", []


def _sort_key(fragment: Fragment) -> tuple[str, str]:
    created_at = format_iso_datetime(fragment.created_at) or ""
    return (created_at, fragment.id)


def build_text_feature_embedding(fragment: Fragment, dimensions: int = 24) -> list[float]:
    weighted_terms: list[tuple[str, float]] = []
    for tag in parse_json_list(fragment.tags, allow_csv_fallback=True) or []:
        normalized = tag.strip()
        if normalized:
            weighted_terms.append((normalized, 3.0))
    for term in _summary_terms(fragment.summary):
        weighted_terms.append((term, 2.0))
    for term in _summary_terms((fragment.transcript or "").strip()):
        weighted_terms.append((term, 1.0))
    if not weighted_terms:
        weighted_terms.append((fragment.id, 1.0))

    vector = [0.0] * dimensions
    for term, weight in weighted_terms:
        digest = hashlib.md5(term.encode("utf-8")).digest()
        primary_index = digest[0] % dimensions
        primary_sign = 1.0 if digest[1] % 2 == 0 else -1.0
        secondary_index = digest[2] % dimensions
        secondary_sign = 1.0 if digest[3] % 2 == 0 else -1.0
        vector[primary_index] += weight * primary_sign
        vector[secondary_index] += (weight * 0.5) * secondary_sign

    normalized = _normalize_vector(vector)
    return normalized or vector


def build_visualization_payload(items: list[tuple[Fragment, list[float]]], used_vector_source: str) -> dict[str, Any]:
    payload = _empty_response()
    if not items:
        payload["meta"]["used_vector_source"] = used_vector_source
        return payload

    items.sort(key=lambda item: _sort_key(item[0]))
    fragments_ordered = [fragment for fragment, _ in items]
    embeddings = [embedding for _, embedding in items]
    coordinates = project_embeddings_to_coordinates(embeddings)

    try:
        cluster_assignments = cluster_embeddings(embeddings)
    except Exception:
        logger.exception("Fragment clustering failed, fallback to point-only visualization")
        cluster_assignments = None

    cluster_id_map: dict[int, int] = {}
    cluster_members: dict[int, list[int]] = defaultdict(list)
    if cluster_assignments:
        for index, raw_cluster_id in enumerate(cluster_assignments):
            cluster_members[raw_cluster_id].append(index)
        ordered_clusters = sorted(
            cluster_members.items(),
            key=lambda item: (-len(item[1]), fragments_ordered[min(item[1])].id),
        )
        cluster_id_map = {
            raw_cluster_id: stable_index
            for stable_index, (raw_cluster_id, _) in enumerate(ordered_clusters, start=1)
        }

    points: list[dict[str, Any]] = []
    for index, fragment in enumerate(fragments_ordered):
        raw_cluster_id = cluster_assignments[index] if cluster_assignments else None
        cluster_id = cluster_id_map.get(raw_cluster_id) if raw_cluster_id is not None else None
        x, y, z = coordinates[index] if index < len(coordinates) else [0.0, 0.0, 0.0]
        points.append(
            {
                "id": fragment.id,
                "x": _round_coordinate(x),
                "y": _round_coordinate(y),
                "z": _round_coordinate(z),
                "transcript": fragment.transcript,
                "summary": fragment.summary,
                "tags": parse_json_list(fragment.tags, allow_csv_fallback=True),
                "source": fragment.source,
                "sync_status": fragment.sync_status,
                "created_at": format_iso_datetime(fragment.created_at),
                "cluster_id": cluster_id,
                "is_noise": cluster_id is None,
            }
        )

    clusters: list[dict[str, Any]] = []
    if cluster_assignments:
        stable_members: dict[int, list[int]] = defaultdict(list)
        for raw_cluster_id, member_indexes in cluster_members.items():
            stable_members[cluster_id_map[raw_cluster_id]] = member_indexes

        for stable_cluster_id in sorted(stable_members):
            member_indexes = stable_members[stable_cluster_id]
            member_fragments = [fragments_ordered[index] for index in member_indexes]
            label, keywords = _cluster_label(stable_cluster_id, member_fragments)
            centroid = {
                "x": _round_coordinate(sum(points[index]["x"] for index in member_indexes) / len(member_indexes)),
                "y": _round_coordinate(sum(points[index]["y"] for index in member_indexes) / len(member_indexes)),
                "z": _round_coordinate(sum(points[index]["z"] for index in member_indexes) / len(member_indexes)),
            }
            clusters.append(
                {
                    "id": stable_cluster_id,
                    "label": label,
                    "keywords": keywords,
                    "fragment_count": len(member_indexes),
                    "centroid": centroid,
                }
            )

    clustered_fragments = sum(cluster["fragment_count"] for cluster in clusters)
    payload["points"] = points
    payload["clusters"] = clusters
    payload["stats"] = {
        "total_fragments": len(points),
        "clustered_fragments": clustered_fragments,
        "uncategorized_fragments": len(points) - clustered_fragments,
    }
    payload["meta"]["used_vector_source"] = used_vector_source
    return payload
