import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hasMatchingPath } from '../src/paths.js';

describe('path matching', () => {
  it('supports wildcard and globstar policy paths', () => {
    assert.equal(hasMatchingPath(['src/index.ts'], ['src/*.ts']), true);
    assert.equal(hasMatchingPath(['src/auth/session.ts'], ['src/*.ts']), false);
    assert.equal(hasMatchingPath(['src/auth/session.test.ts'], ['**/*.test.ts']), true);
    assert.equal(hasMatchingPath(['session.test.ts'], ['**/*.test.ts']), true);
  });
});
