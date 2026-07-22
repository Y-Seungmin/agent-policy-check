import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hasCodeownersCoverage, parseCodeowners } from '../src/codeowners.js';

describe('CODEOWNERS coverage', () => {
  const entries = parseCodeowners(`
# Authentication ownership
src/auth/** @org/security
* @org/maintainers
`);

  it('covers changed paths with at least one owner', () => {
    assert.equal(hasCodeownersCoverage(entries, ['src/auth/session.ts']), true);
    assert.equal(hasCodeownersCoverage(entries, ['README.md']), true);
  });

  it('reports uncovered changed paths', () => {
    const onlyAuth = parseCodeowners('src/auth/** @org/security');
    assert.equal(hasCodeownersCoverage(onlyAuth, ['README.md']), false);
  });

  it('supports GitHub wildcard and directory examples', () => {
    assert.equal(
      hasCodeownersCoverage(parseCodeowners('*.js @js-owner'), ['src/app.js']),
      true,
    );
    assert.equal(
      hasCodeownersCoverage(parseCodeowners('/docs/ @docs-owner'), ['docs/guides/start.md']),
      true,
    );
    assert.equal(
      hasCodeownersCoverage(parseCodeowners('/docs/ @docs-owner'), ['packages/docs/start.md']),
      false,
    );
    assert.equal(
      hasCodeownersCoverage(parseCodeowners('apps/ @apps-owner'), ['packages/apps/api.ts']),
      true,
    );
    assert.equal(
      hasCodeownersCoverage(parseCodeowners('docs/* docs@example.com'), ['docs/start.md']),
      true,
    );
    assert.equal(
      hasCodeownersCoverage(
        parseCodeowners('docs/* docs@example.com'),
        ['docs/build/troubleshooting.md'],
      ),
      false,
    );
    assert.equal(
      hasCodeownersCoverage(parseCodeowners('**/logs @log-owner'), ['deep/nested/logs/app.log']),
      true,
    );
  });

  it('lets a later ownerless rule remove earlier coverage', () => {
    const withException = parseCodeowners(`
/apps/ @apps-owner
/apps/github
`);

    assert.equal(hasCodeownersCoverage(withException, ['apps/web/index.ts']), true);
    assert.equal(hasCodeownersCoverage(withException, ['apps/github/index.ts']), false);
  });

  it('ignores inline comments and invalid CODEOWNERS syntax', () => {
    assert.deepEqual(parseCodeowners('*.js @js-owner # inline comment'), [
      { pattern: '*.js', owners: ['@js-owner'] },
    ]);
    assert.deepEqual(parseCodeowners('!secret/** @security\nfile[0-9].txt @files'), []);
  });
});
