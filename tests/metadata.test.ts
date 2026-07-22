import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { parse as parseYaml } from 'yaml';
import { parsePolicy } from '../src/policy.js';

const repositoryRoot = path.resolve('.');

describe('release metadata', () => {
  it('declares the Node 24 entrypoint, outputs, and Marketplace branding', async () => {
    const action = parseYaml(await read('action.yml')) as Record<string, unknown>;
    const runs = action.runs as Record<string, unknown>;
    const outputs = action.outputs as Record<string, unknown>;
    const branding = action.branding as Record<string, unknown>;

    assert.equal(runs.using, 'node24');
    assert.equal(runs.main, 'dist/index.js');
    assert.deepEqual(Object.keys(outputs).sort(), ['result', 'violation-count']);
    assert.equal(typeof (outputs.result as Record<string, unknown>).description, 'string');
    assert.equal(typeof (outputs['violation-count'] as Record<string, unknown>).description, 'string');
    assert.equal(branding.icon, 'shield');
    assert.equal(branding.color, 'blue');
  });

  it('pins every external Action in CI to a full commit SHA', async () => {
    const workflow = await read('.github/workflows/test.yml');
    const references = [...workflow.matchAll(/^\s*uses:\s*([^\s#]+)/gm)].map((match) => match[1]);

    assert.ok(references.length > 0);
    for (const reference of references) {
      assert.match(reference, /^[^@]+@[a-f0-9]{40}$/);
    }
    assert.match(workflow, /pnpm run test:e2e/);
    assert.match(workflow, /actionlint@v1\.7\.12/);
  });

  it('keeps the public README in English and documents deterministic edge cases', async () => {
    const readme = await read('README.md');

    assert.doesNotMatch(readme, /[\uac00-\ud7af]/);
    assert.match(readme, /Renames and deletions/);
    assert.match(readme, /3,000/);
    assert.match(readme, /code owner approval/i);
    assert.match(readme, /violation-count/);
  });

  it('requires Node 24 and enforces coverage thresholds', async () => {
    const packageJson = JSON.parse(await read('package.json')) as {
      engines?: { node?: string };
      scripts?: Record<string, string>;
    };

    assert.equal(packageJson.engines?.node, '>=24');
    assert.match(packageJson.scripts?.test ?? '', /test-coverage-lines=95/);
    assert.match(packageJson.scripts?.test ?? '', /test-coverage-branches=85/);
    assert.match(packageJson.scripts?.test ?? '', /test-coverage-functions=95/);
    assert.equal(packageJson.scripts?.['test:e2e'], 'node --import tsx --test e2e/**/*.test.ts');
  });

  it('keeps the repository dogfood policy valid', async () => {
    const policy = parsePolicy(await read('.policy-check.yml'));

    assert.equal(policy.rules.length, 3);
  });
});

function read(relativePath: string): Promise<string> {
  return readFile(path.join(repositoryRoot, relativePath), 'utf8');
}
