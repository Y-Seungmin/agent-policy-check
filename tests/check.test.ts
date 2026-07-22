import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePolicy } from '../src/check.js';
import type { ChangedFile } from '../src/github.js';
import type { Policy } from '../src/policy.js';

describe('policy evaluation', () => {
  const policy: Policy = {
    version: 1,
    rules: [{
      name: 'auth changes',
      when: { paths: ['src/auth/**'] },
      require: [
        { 'changed-path': 'tests/auth/**' },
        { 'codeowners-covered': true },
      ],
    }],
  };

  it('returns violations for missing required paths and CODEOWNERS coverage', () => {
    assert.deepEqual(
      evaluatePolicy(policy, [changed('src/auth/session.ts')], false),
      [{
        rule: 'auth changes',
        matchedPaths: ['src/auth/session.ts'],
        missing: ['tests/auth/**', 'CODEOWNERS coverage'],
      }],
    );
  });

  it('passes when all requirements are satisfied', () => {
    assert.deepEqual(
      evaluatePolicy(policy, [
        changed('src/auth/session.ts'),
        changed('tests/auth/session.test.ts'),
      ], true),
      [],
    );
  });

  it('ignores requirements when the rule does not match changed paths', () => {
    assert.deepEqual(evaluatePolicy(policy, [changed('README.md')], false), []);
  });

  it('checks CODEOWNERS only for paths matched by the rule', () => {
    assert.deepEqual(
      evaluatePolicy(
        policy,
        [changed('src/auth/session.ts'), changed('docs/guide.md')],
        (paths) => paths.length === 1,
      ),
      [{
        rule: 'auth changes',
        matchedPaths: ['src/auth/session.ts'],
        missing: ['tests/auth/**'],
      }],
    );
  });

  it('triggers on the previous path when a sensitive file is renamed out', () => {
    const files: ChangedFile[] = [{
      path: 'src/public/session.ts',
      previousPath: 'src/auth/session.ts',
      status: 'renamed',
    }];
    const coveredPaths: string[][] = [];

    assert.deepEqual(
      evaluatePolicy(policy, files, (paths) => {
        coveredPaths.push(paths);
        return true;
      }),
      [{
        rule: 'auth changes',
        matchedPaths: ['src/auth/session.ts'],
        missing: ['tests/auth/**'],
      }],
    );
    assert.deepEqual(coveredPaths, [['src/auth/session.ts']]);
  });

  it('does not let a deleted companion file satisfy changed-path', () => {
    assert.deepEqual(
      evaluatePolicy(policy, [
        changed('src/auth/session.ts'),
        changed('tests/auth/session.test.ts', 'removed'),
      ], true),
      [{
        rule: 'auth changes',
        matchedPaths: ['src/auth/session.ts'],
        missing: ['tests/auth/**'],
      }],
    );
  });

  it('lets a live rename destination satisfy changed-path', () => {
    assert.deepEqual(
      evaluatePolicy(policy, [
        changed('src/auth/session.ts'),
        {
          path: 'tests/auth/session.test.ts',
          previousPath: 'tests/legacy/session.test.ts',
          status: 'renamed',
        },
      ], true),
      [],
    );
  });
});

function changed(path: string, status: ChangedFile['status'] = 'modified'): ChangedFile {
  return { path, status };
}
