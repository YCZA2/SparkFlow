import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';

const projectRoot = process.cwd();
const appDir = join(projectRoot, 'app');
const layoutPath = join(appDir, '_layout.tsx');
const PUBLIC_ROUTES = new Set(['+not-found', 'login']);

function listRouteFiles(dir: string): string[] {
  /*递归枚举 app 目录下的文件路由，供导航声明校验复用。 */
  const routes: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) {
      continue;
    }

    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      routes.push(...listRouteFiles(fullPath));
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith('.tsx') || entry.name === '_layout.tsx') {
      continue;
    }

    const relativePath = relative(appDir, fullPath).replace(/\.tsx$/, '');
    routes.push(relativePath.endsWith('/index') ? relativePath.slice(0, -'/index'.length) : relativePath);
  }

  return routes;
}

test('root layout explicitly declares every non-public file route', () => {
  const layoutSource = readFileSync(layoutPath, 'utf8');
  const declaredRoutes = new Set([...layoutSource.matchAll(/name="([^"]+)"/g)].map((match) => match[1]));
  const routeFiles = listRouteFiles(appDir).filter((route) => !PUBLIC_ROUTES.has(route));
  const missingRoutes = routeFiles.filter((route) => !declaredRoutes.has(route)).sort();

  assert.deepEqual(missingRoutes, []);
});
