import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const testsDir = join(projectRoot, 'tests');
const testFiles = readdirSync(testsDir)
  .filter((file) => file.endsWith('.test.ts'))
  .sort()
  .map((file) => join(testsDir, file));

if (testFiles.length === 0) {
  process.exit(0);
}

const outdir = mkdtempSync(join(tmpdir(), 'sparkflow-state-tests-'));

try {
  await build({
    entryPoints: testFiles,
    outdir,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    bundle: true,
    sourcemap: 'inline',
    absWorkingDir: projectRoot,
    tsconfig: join(projectRoot, 'tsconfig.json'),
    outExtension: { '.js': '.mjs' },
  });

  const compiledTests = readdirSync(outdir)
    .filter((file) => file.endsWith('.mjs'))
    .sort()
    .map((file) => join(outdir, file));

  const result = spawnSync(process.execPath, ['--test', ...compiledTests], {
    cwd: projectRoot,
    stdio: 'inherit',
  });

  process.exit(result.status ?? 1);
} finally {
  rmSync(outdir, { recursive: true, force: true });
}
