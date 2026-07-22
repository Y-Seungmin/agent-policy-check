import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parsePolicy } from '../src/policy.js';

describe('policy file', () => {
  it('parses path and CODEOWNERS requirements', () => {
    assert.deepEqual(
      parsePolicy(`
version: 1
rules:
  - name: auth changes
    when:
      paths:
        - src/auth/**
    require:
      - changed-path: tests/auth/**
      - codeowners-covered: true
`),
      {
        version: 1,
        rules: [{
          name: 'auth changes',
          when: { paths: ['src/auth/**'] },
          require: [
            { 'changed-path': 'tests/auth/**' },
            { 'codeowners-covered': true },
          ],
        }],
      },
    );
  });

  it('rejects empty rule fields', () => {
    assert.throws(
      () => parsePolicy(`
version: 1
rules:
  - name: auth changes
    when:
      paths: []
    require:
      - codeowners-covered: true
`),
      /when\.paths must contain at least one path/,
    );
    assert.throws(
      () => parsePolicy(`
version: 1
rules:
  - name: auth changes
    when:
      paths: [src/auth/**]
    require: []
`),
      /require must contain at least one requirement/,
    );
  });

  it('rejects ambiguous or unknown requirement fields', () => {
    assert.throws(
      () => parsePolicy(`
version: 1
rules:
  - name: auth changes
    when:
      paths: [src/auth/**]
    require:
      - changed-path: tests/auth/**
        codeowners-covered: true
`),
      /exactly one supported field/,
    );
    assert.throws(
      () => parsePolicy(`
version: 1
rules:
  - name: auth changes
    when:
      paths: [src/auth/**]
    require:
      - reviewer: security
`),
      /exactly one supported field/,
    );
  });

  it('rejects unsupported path syntax', () => {
    assert.throws(
      () => parsePolicy(`
version: 1
rules:
  - name: invalid glob
    when:
      paths: ['src/[ab].ts']
    require:
      - changed-path: tests/**
`),
      /unsupported glob syntax/,
    );
  });
});
