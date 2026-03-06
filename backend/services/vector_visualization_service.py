"""Build lightweight visualization data from stored fragment embeddings."""

from __future__ import annotations

import hashlib
import logging
import math
import re
from collections import Counter, defaultdict
from typing import Any, Optional

from sqlalchemy.orm import Session

from domains.fragments import repository
from models import Fragment
from services.vector_service import list_fragment_documents, upsert_fragment
from utils.serialization import format_iso_datetime, parse_json_list

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
            "used_vector_source": "chromadb",
        },
    }


def _round_coordinate(value: float) -> float:
    return round(value, 6)


def _dot(left: list[float], right: list[float]) -> float:
    return sum(a * b for a, b in zip(left, right))


def _center_embeddings(embeddings: list[list[float]]) -> list[list[float]]:
    if not embeddings:
        return []

    dimension = len(embeddings[0])
    means = [0.0] * dimension
    for row in embeddings:
        for idx, value in enumerate(row):
            means[idx] += value

    count = float(len(embeddings))
    for idx in range(dimension):
        means[idx] /= count

    return [[value - means[idx] for idx, value in enumerate(row)] for row in embeddings]


def _fallback_coordinates(count: int) -> list[list[float]]:
    if count <= 0:
        return []
    if count == 1:
        return [[0.0, 0.0, 0.0]]

    coordinates: list[list[float]] = []
    for index in range(count):
        angle = (2 * math.pi * index) / count
        z = 0.0 if count == 1 else ((index / (count - 1)) * 2.0) - 1.0
        coordinates.append([
            math.cos(angle) * 0.82,
            math.sin(angle) * 0.82,
            z * 0.5,
        ])
    return coordinates


def _build_gram_matrix(centered: list[list[float]]) -> list[list[float]]:
    count = len(centered)
    gram = [[0.0] * count for _ in range(count)]
    for row_index in range(count):
        gram[row_index][row_index] = _dot(centered[row_index], centered[row_index])
        for col_index in range(row_index + 1, count):
            value = _dot(centered[row_index], centered[col_index])
            gram[row_index][col_index] = value
            gram[col_index][row_index] = value
    return gram


def _normalize_vector(values: list[float]) -> Optional[list[float]]:
    norm = math.sqrt(sum(value * value for value in values))
    if norm <= 1e-12:
        return None
    return [value / norm for value in values]


def _matrix_vector_product(matrix: list[list[float]], vector: list[float]) -> list[float]:
    return [sum(value * vector[col_index] for col_index, value in enumerate(row)) for row in matrix]


def _stabilize_eigenvector(vector: list[float]) -> list[float]:
    for value in vector:
        if abs(value) > 1e-9:
            if value < 0:
                return [-item for item in vector]
            break
    return vector


def _power_iteration(matrix: list[list[float]], iterations: int = 50) -> Optional[list[float]]:
    count = len(matrix)
    vector = _normalize_vector([float(index + 1) for index in range(count)])
    if not vector:
        return None

    for _ in range(iterations):
        product = _matrix_vector_product(matrix, vector)
        next_vector = _normalize_vector(product)
        if not next_vector:
            return None

        difference = math.sqrt(
            sum((next_vector[index] - vector[index]) ** 2 for index in range(count))
        )
        vector = next_vector
        if difference <= 1e-7:
            break

    return _stabilize_eigenvector(vector)


def _extract_principal_components(
    gram_matrix: list[list[float]],
    component_count: int,
) -> list[tuple[float, list[float]]]:
    if not gram_matrix:
        return []

    count = len(gram_matrix)
    working = [row[:] for row in gram_matrix]
    components: list[tuple[float, list[float]]] = []

    for _ in range(component_count):
        vector = _power_iteration(working)
        if not vector:
            break

        product = _matrix_vector_product(working, vector)
        eigenvalue = sum(vector[index] * product[index] for index in range(count))
        if eigenvalue <= 1e-8:
            break

        components.append((eigenvalue, vector))
        for row_index in range(count):
            for col_index in range(count):
                working[row_index][col_index] -= eigenvalue * vector[row_index] * vector[col_index]

    return components


def _normalize_coordinates(coordinates: list[list[float]]) -> list[list[float]]:
    if not coordinates:
        return []

    normalized = [row[:] for row in coordinates]
    for axis in range(3):
        max_abs = max(abs(row[axis]) for row in normalized)
        if max_abs <= 1e-9:
            for row in normalized:
                row[axis] = 0.0
            continue

        for row in normalized:
            row[axis] = row[axis] / max_abs

    return normalized


def project_embeddings_to_coordinates(embeddings: list[list[float]]) -> list[list[float]]:
    count = len(embeddings)
    if count == 0:
        return []
    if count < 2:
        return _fallback_coordinates(count)

    centered = _center_embeddings(embeddings)
    gram_matrix = _build_gram_matrix(centered)
    components = _extract_principal_components(gram_matrix, component_count=min(3, count - 1))
    if not components:
        return _fallback_coordinates(count)

    coordinates = [[0.0, 0.0, 0.0] for _ in range(count)]
    for axis, (eigenvalue, eigenvector) in enumerate(components):
        scale = math.sqrt(max(eigenvalue, 0.0))
        for row_index, vector_value in enumerate(eigenvector):
            coordinates[row_index][axis] = vector_value * scale

    if all(max(abs(row[axis]) for row in coordinates) <= 1e-9 for axis in range(3)):
        return _fallback_coordinates(count)

    return _normalize_coordinates(coordinates)


def _squared_distance(left: list[float], right: list[float]) -> float:
    return sum((a - b) ** 2 for a, b in zip(left, right))


def _choose_initial_centers(embeddings: list[list[float]], cluster_count: int) -> list[list[float]]:
    centers: list[list[float]] = [embeddings[0][:]]
    chosen_indexes = {0}

    while len(centers) < cluster_count:
        candidate_index = None
        candidate_distance = -1.0

        for index, embedding in enumerate(embeddings):
            if index in chosen_indexes:
                continue

            min_distance = min(_squared_distance(embedding, center) for center in centers)
            if min_distance > candidate_distance:
                candidate_distance = min_distance
                candidate_index = index

        if candidate_index is None:
            break

        chosen_indexes.add(candidate_index)
        centers.append(embeddings[candidate_index][:])

    return centers


def cluster_embeddings(embeddings: list[list[float]]) -> Optional[list[int]]:
    count = len(embeddings)
    if count < 8:
        return None

    cluster_count = min(count, min(6, max(2, round(math.sqrt(count / 2)))))
    centers = _choose_initial_centers(embeddings, cluster_count)
    if len(centers) < 2:
        return None

    assignments = [-1] * count
    for _ in range(15):
        updated_assignments: list[int] = []
        for embedding in embeddings:
            best_index = min(
                range(len(centers)),
                key=lambda center_index: _squared_distance(embedding, centers[center_index]),
            )
            updated_assignments.append(best_index)

        if updated_assignments == assignments:
            break
        assignments = updated_assignments

        grouped_indexes: dict[int, list[int]] = defaultdict(list)
        for index, cluster_id in enumerate(assignments):
            grouped_indexes[cluster_id].append(index)

        new_centers: list[list[float]] = []
        for cluster_id, center in enumerate(centers):
            member_indexes = grouped_indexes.get(cluster_id)
            if not member_indexes:
                new_centers.append(center)
                continue

            dimension = len(center)
            averaged = [0.0] * dimension
            for member_index in member_indexes:
                for dim in range(dimension):
                    averaged[dim] += embeddings[member_index][dim]
            member_count = float(len(member_indexes))
            for dim in range(dimension):
                averaged[dim] /= member_count
            new_centers.append(averaged)

        centers = new_centers

    return assignments if len(set(assignments)) >= 2 else None


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


def _build_text_feature_embedding(fragment: Fragment, dimensions: int = 24) -> list[float]:
    weighted_terms: list[tuple[str, float]] = []

    for tag in parse_json_list(fragment.tags, allow_csv_fallback=True) or []:
        normalized = tag.strip()
        if normalized:
            weighted_terms.append((normalized, 3.0))

    for term in _summary_terms(fragment.summary):
        weighted_terms.append((term, 2.0))

    transcript = (fragment.transcript or "").strip()
    for term in _summary_terms(transcript):
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


def _build_visualization_payload(
    items: list[tuple[Fragment, list[float]]],
    used_vector_source: str,
) -> dict[str, Any]:
    payload = _empty_response()
    if not items:
        payload["meta"]["used_vector_source"] = used_vector_source
        return payload

    items.sort(key=lambda item: _sort_key(item[0]))
    fragments_ordered = [fragment for fragment, _ in items]
    embeddings = [embedding for _, embedding in items]

    coordinates = project_embeddings_to_coordinates(embeddings)
    cluster_assignments: Optional[list[int]]
    try:
        cluster_assignments = cluster_embeddings(embeddings)
    except Exception:
        logger.exception("Fragment clustering failed, falling back to point-only visualization")
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


async def _backfill_missing_fragment_vectors(
    db: Session,
    user_id: str,
    existing_vector_ids: set[str],
) -> int:
    candidates = repository.list_vectorizable_by_user(db=db, user_id=user_id)
    created_count = 0

    for fragment in candidates:
        transcript = (fragment.transcript or "").strip()
        if not transcript or fragment.id in existing_vector_ids:
            continue

        try:
            await upsert_fragment(
                user_id=user_id,
                fragment_id=fragment.id,
                text=transcript,
                source=fragment.source,
                summary=fragment.summary,
                tags=parse_json_list(fragment.tags, allow_csv_fallback=True),
            )
            existing_vector_ids.add(fragment.id)
            created_count += 1
        except Exception as exc:
            logger.warning(
                "Backfill vector skipped for user=%s fragment=%s: %s",
                user_id,
                fragment.id,
                str(exc),
            )
            break

    return created_count


async def build_fragment_visualization(
    db: Session,
    user_id: str,
) -> dict[str, Any]:
    existing_vector_documents = await list_fragment_documents(
        user_id=user_id,
        include_embeddings=False,
    )
    existing_vector_ids = {document.id for document in existing_vector_documents}
    await _backfill_missing_fragment_vectors(
        db=db,
        user_id=user_id,
        existing_vector_ids=existing_vector_ids,
    )

    vector_documents = await list_fragment_documents(user_id=user_id, include_embeddings=True)
    if not vector_documents:
        fallback_fragments = repository.list_vectorizable_by_user(db=db, user_id=user_id)
        fallback_items = [
            (fragment, _build_text_feature_embedding(fragment))
            for fragment in fallback_fragments
            if (fragment.transcript or "").strip()
        ]
        return _build_visualization_payload(
            items=fallback_items,
            used_vector_source="fallback_text_features",
        )

    fragments = repository.get_by_ids(
        db=db,
        user_id=user_id,
        fragment_ids=[document.id for document in vector_documents],
    )
    fragments_by_id = {fragment.id: fragment for fragment in fragments}

    valid_items: list[tuple[Fragment, list[float]]] = []
    for document in vector_documents:
        fragment = fragments_by_id.get(document.id)
        if not fragment:
            continue

        if not document.embedding:
            logger.warning("Skipping fragment %s because embedding is missing", document.id)
            continue

        valid_items.append((fragment, [float(value) for value in document.embedding]))

    if not valid_items:
        fallback_fragments = repository.list_vectorizable_by_user(db=db, user_id=user_id)
        fallback_items = [
            (fragment, _build_text_feature_embedding(fragment))
            for fragment in fallback_fragments
            if (fragment.transcript or "").strip()
        ]
        return _build_visualization_payload(
            items=fallback_items,
            used_vector_source="fallback_text_features",
        )

    return _build_visualization_payload(
        items=valid_items,
        used_vector_source="chromadb",
    )
