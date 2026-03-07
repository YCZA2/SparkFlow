from __future__ import annotations

import math
from collections import defaultdict
from typing import Optional


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
        z = ((index / (count - 1)) * 2.0) - 1.0
        coordinates.append([math.cos(angle) * 0.82, math.sin(angle) * 0.82, z * 0.5])
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
        difference = math.sqrt(sum((next_vector[index] - vector[index]) ** 2 for index in range(count)))
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
        updated_assignments = [
            min(range(len(centers)), key=lambda center_index: _squared_distance(embedding, centers[center_index]))
            for embedding in embeddings
        ]
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
