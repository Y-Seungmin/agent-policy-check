import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/main.js';

describe('policy-check action', () => {
  it('starts and reports the configured event name', async () => {
    const messages: string[] = [];
    await run({
      eventName: 'pull_request',
      policyText: 'version: 1\nrules: []',
      changedFiles: [],
      log: (message) => messages.push(message),
    });

    assert.deepEqual(messages, [
      'agent-policy-check started: pull_request',
      'All policy checks passed',
    ]);
  });

  it('loads policy and CODEOWNERS from the pull request base commit', async () => {
    const requests: Array<{ owner: string; repo: string; path: string; ref: string }> = [];
    const failures: string[] = [];
    const client = {
      paginate: async () => [],
      rest: {
        pulls: {
          listFiles: () => Promise.resolve({ data: [] }),
          get: () => Promise.resolve({
            data: { changed_files: 0, head: { sha: 'head-sha' } },
          }),
        },
        repos: {
          getContent: async (input: { owner: string; repo: string; path: string; ref: string }) => {
            requests.push(input);
            const text = input.path === '.policy-check.yml'
              ? `version: 1
rules:
  - name: auth ownership
    when:
      paths: [src/auth/**]
    require:
      - codeowners-covered: true`
              : 'src/auth/** @org/security';
            return {
              data: {
                type: 'file',
                encoding: 'base64',
                content: Buffer.from(text, 'utf8').toString('base64'),
              },
            };
          },
        },
      },
    };

    await run({
      eventName: 'pull_request',
      changedFiles: [{ path: 'src/auth/session.ts', status: 'modified' }],
      runtime: {
        client,
        owner: 'org',
        repo: 'repo',
        pullNumber: 7,
        baseSha: 'trusted-base-sha',
        headSha: 'head-sha',
      },
      fail: (message) => failures.push(message),
      log: () => undefined,
    });

    assert.deepEqual(failures, []);
    assert.deepEqual(requests, [
      { owner: 'org', repo: 'repo', path: '.policy-check.yml', ref: 'trusted-base-sha' },
      { owner: 'org', repo: 'repo', path: '.github/CODEOWNERS', ref: 'trusted-base-sha' },
    ]);
  });

  it('skips only when the base commit has no policy file', async () => {
    const messages: string[] = [];
    const client = {
      paginate: async () => { throw new Error('changed files should not be loaded'); },
      rest: {
        pulls: {
          listFiles: () => Promise.resolve({ data: [] }),
          get: () => Promise.resolve({
            data: { changed_files: 0, head: { sha: 'head-sha' } },
          }),
        },
        repos: {
          getContent: async () => {
            throw Object.assign(new Error('not found'), { status: 404 });
          },
        },
      },
    };

    assert.deepEqual(await run({
      eventName: 'pull_request',
      runtime: {
        client,
        owner: 'org',
        repo: 'repo',
        pullNumber: 7,
        baseSha: 'trusted-base-sha',
        headSha: 'head-sha',
      },
      log: (message) => messages.push(message),
    }), []);
    assert.deepEqual(messages, [
      'agent-policy-check started: pull_request',
      'No .policy-check.yml found on the pull request base commit; skipping policy checks',
    ]);
  });

  it('reports deterministic policy violations through the Action failure callback', async () => {
    const failures: string[] = [];
    const outputs: Array<[string, string | number]> = [];
    const summaries: string[] = [];

    const violations = await run({
      eventName: 'pull_request',
      policyText: `version: 1
rules:
  - name: auth tests
    when:
      paths: [src/auth/**]
    require:
      - changed-path: tests/auth/**`,
      changedFiles: [{ path: 'src/auth/session.ts', status: 'modified' }],
      fail: (message) => failures.push(message),
      log: () => undefined,
      setOutput: (name, value) => outputs.push([name, value]),
      writeSummary: (summary) => { summaries.push(summary); },
    });

    assert.deepEqual(violations, [{
      rule: 'auth tests',
      matchedPaths: ['src/auth/session.ts'],
      missing: ['tests/auth/**'],
    }]);
    assert.deepEqual(failures, ['auth tests: missing tests/auth/**']);
    assert.deepEqual(outputs, [
      ['result', 'failed'],
      ['violation-count', 1],
    ]);
    assert.match(summaries[0] ?? '', /src\/auth\/session\.ts/);
  });

  it('publishes passed and skipped outcomes', async () => {
    const passedOutputs: Array<[string, string | number]> = [];
    await run({
      eventName: 'pull_request',
      policyText: 'version: 1\nrules: []',
      changedFiles: [],
      setOutput: (name, value) => passedOutputs.push([name, value]),
      writeSummary: () => undefined,
      log: () => undefined,
    });
    assert.deepEqual(passedOutputs, [
      ['result', 'passed'],
      ['violation-count', 0],
    ]);

    const skippedOutputs: Array<[string, string | number]> = [];
    const messages: string[] = [];
    const client = {
      paginate: async () => [],
      rest: {
        pulls: {
          listFiles: () => Promise.resolve({ data: [] }),
          get: () => Promise.resolve({
            data: { changed_files: 0, head: { sha: 'head-sha' } },
          }),
        },
        repos: {
          getContent: async () => {
            throw Object.assign(new Error('not found'), { status: 404 });
          },
        },
      },
    };
    await run({
      eventName: 'pull_request',
      runtime: {
        client,
        owner: 'org',
        repo: 'repo',
        pullNumber: 7,
        baseSha: 'base-sha',
        headSha: 'head-sha',
      },
      setOutput: (name, value) => skippedOutputs.push([name, value]),
      writeSummary: (summary) => { messages.push(summary); },
      log: () => undefined,
    });
    assert.deepEqual(skippedOutputs, [
      ['result', 'skipped'],
      ['violation-count', 0],
    ]);
    assert.match(messages[0] ?? '', /No policy file/);
  });

  it('rejects malformed base policy instead of silently passing', async () => {
    await assert.rejects(
      run({
        eventName: 'pull_request',
        policyText: 'version: 1\nrules: invalid',
        changedFiles: [],
        log: () => undefined,
      }),
      /rules array/,
    );
  });
});
