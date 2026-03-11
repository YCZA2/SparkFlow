import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearVisibleIds,
  countVisibleSelected,
  filterPointsByCluster,
  selectVisibleIds,
  toggleSelectedIds,
} from '../features/fragments/fragmentCloudState';

const points = [
  { id: 'a', cluster_id: 1 },
  { id: 'b', cluster_id: 2 },
  { id: 'c', cluster_id: 1 },
] as any;

test('filterPointsByCluster filters by cluster or returns all', () => {
  assert.equal(filterPointsByCluster(points, 'all').length, 3);
  assert.deepEqual(
    filterPointsByCluster(points, 1).map((item) => item.id),
    ['a', 'c']
  );
});

test('toggleSelectedIds adds and removes ids', () => {
  assert.deepEqual(toggleSelectedIds([], 'a'), ['a']);
  assert.deepEqual(toggleSelectedIds(['a', 'b'], 'a'), ['b']);
});

test('selectVisibleIds and clearVisibleIds manage visible selections', () => {
  const selected = selectVisibleIds(['x'], points);
  assert.deepEqual(selected.sort(), ['a', 'b', 'c', 'x']);

  const cleared = clearVisibleIds(selected, points);
  assert.deepEqual(cleared, ['x']);
});

test('countVisibleSelected counts intersection', () => {
  assert.equal(countVisibleSelected(points, ['a', 'x', 'c']), 2);
});

test('selection helpers keep uniqueness and handle empty inputs', () => {
  assert.deepEqual(selectVisibleIds(['a'], points).sort(), ['a', 'b', 'c']);
  assert.deepEqual(clearVisibleIds(['x'], []), ['x']);
  assert.equal(countVisibleSelected([], ['a', 'b']), 0);
});
