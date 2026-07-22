import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadChangedFiles,
  loadCodeownersText,
  loadRepositoryText,
} from '../src/github.js';

describe('GitHub pull request files', () => {
  it('loads file status and the previous path for renames', async () => {
    const client = {
      paginate: async () => [
        { filename: 'src/auth/session.ts', status: 'modified' },
        {
          filename: 'src/public/legacy-session.ts',
          previous_filename: 'src/auth/legacy-session.ts',
          status: 'renamed',
        },
      ],
      rest: {
        pulls: {
          listFiles: () => Promise.resolve({ data: [] }),
          get: () => Promise.resolve({
            data: { changed_files: 2, head: { sha: 'head-sha' } },
          }),
        },
        repos: { getContent: () => Promise.resolve({ data: {} }) },
      },
    };

    assert.deepEqual(await loadChangedFiles(client, 'org', 'repo', 7, 'head-sha'), [
      { path: 'src/auth/session.ts', status: 'modified' },
      {
        path: 'src/public/legacy-session.ts',
        previousPath: 'src/auth/legacy-session.ts',
        status: 'renamed',
      },
    ]);
  });

  it('fails closed when GitHub cannot return the complete file list', async () => {
    const client = {
      paginate: async () => Array.from({ length: 3_000 }, (_, index) => ({
        filename: `file-${index}.ts`,
        status: 'modified',
      })),
      rest: {
        pulls: {
          listFiles: () => Promise.resolve({ data: [] }),
          get: () => Promise.resolve({
            data: { changed_files: 3_001, head: { sha: 'head-sha' } },
          }),
        },
        repos: { getContent: () => Promise.resolve({ data: {} }) },
      },
    };

    await assert.rejects(
      loadChangedFiles(client, 'org', 'repo', 7, 'head-sha'),
      /3,000-file API limit/,
    );
  });

  it('accepts exactly 3,000 files when metadata confirms the list is complete', async () => {
    const client = {
      paginate: async () => Array.from({ length: 3_000 }, (_, index) => ({
        filename: `file-${index}.ts`,
        status: 'modified',
      })),
      rest: {
        pulls: {
          listFiles: () => Promise.resolve({ data: [] }),
          get: () => Promise.resolve({
            data: { changed_files: 3_000, head: { sha: 'head-sha' } },
          }),
        },
        repos: { getContent: () => Promise.resolve({ data: {} }) },
      },
    };

    const files = await loadChangedFiles(client, 'org', 'repo', 7, 'head-sha');
    assert.equal(files.length, 3_000);
    assert.deepEqual(files.at(-1), { path: 'file-2999.ts', status: 'modified' });
  });

  it('rejects an incomplete file list below the API limit', async () => {
    const client = {
      paginate: async () => [{ filename: 'one.ts', status: 'modified' }],
      rest: {
        pulls: {
          listFiles: () => Promise.resolve({ data: [] }),
          get: () => Promise.resolve({
            data: { changed_files: 2, head: { sha: 'head-sha' } },
          }),
        },
        repos: { getContent: () => Promise.resolve({ data: {} }) },
      },
    };

    await assert.rejects(
      loadChangedFiles(client, 'org', 'repo', 7, 'head-sha'),
      /incomplete pull request file list/,
    );
  });

  it('fails closed when the pull request advanced beyond the triggering event', async () => {
    const client = {
      paginate: async () => [],
      rest: {
        pulls: {
          listFiles: () => Promise.resolve({ data: [] }),
          get: () => Promise.resolve({
            data: { changed_files: 0, head: { sha: 'new-head-sha' } },
          }),
        },
        repos: { getContent: () => Promise.resolve({ data: {} }) },
      },
    };

    await assert.rejects(
      loadChangedFiles(client, 'org', 'repo', 7, 'event-head-sha'),
      /head changed while policy-check was running/,
    );
  });

  it('rejects a renamed file without its previous path', async () => {
    const client = {
      paginate: async () => [{ filename: 'src/public/session.ts', status: 'renamed' }],
      rest: {
        pulls: {
          listFiles: () => Promise.resolve({ data: [] }),
          get: () => Promise.resolve({
            data: { changed_files: 1, head: { sha: 'head-sha' } },
          }),
        },
        repos: { getContent: () => Promise.resolve({ data: {} }) },
      },
    };

    await assert.rejects(
      loadChangedFiles(client, 'org', 'repo', 7, 'head-sha'),
      /previous_filename/,
    );
  });
});

describe('trusted repository files', () => {
  it('loads a repository file from the exact base commit', async () => {
    const requests: unknown[] = [];
    const client = githubClient(async (input) => {
      requests.push(input);
      return encodedFile('version: 1\nrules: []');
    });

    assert.equal(
      await loadRepositoryText(client, 'org', 'repo', '.policy-check.yml', 'base-sha'),
      'version: 1\nrules: []',
    );
    assert.deepEqual(requests, [{
      owner: 'org',
      repo: 'repo',
      path: '.policy-check.yml',
      ref: 'base-sha',
    }]);
  });

  it('treats only a GitHub 404 as an absent file', async () => {
    const missingClient = githubClient(async () => {
      throw Object.assign(new Error('not found'), { status: 404 });
    });
    const brokenClient = githubClient(async () => {
      throw Object.assign(new Error('forbidden'), { status: 403 });
    });

    assert.equal(
      await loadRepositoryText(missingClient, 'org', 'repo', '.policy-check.yml', 'base-sha'),
      undefined,
    );
    await assert.rejects(
      loadRepositoryText(brokenClient, 'org', 'repo', '.policy-check.yml', 'base-sha'),
      /forbidden/,
    );
  });

  it('uses GitHub CODEOWNERS location precedence at the base commit', async () => {
    const requestedPaths: string[] = [];
    const client = githubClient(async (input) => {
      requestedPaths.push(input.path);
      if (input.path === '.github/CODEOWNERS') {
        throw Object.assign(new Error('not found'), { status: 404 });
      }
      if (input.path === 'CODEOWNERS') return encodedFile('* @org/maintainers');
      throw new Error(`unexpected path: ${input.path}`);
    });

    assert.equal(
      await loadCodeownersText(client, 'org', 'repo', 'base-sha'),
      '* @org/maintainers',
    );
    assert.deepEqual(requestedPaths, ['.github/CODEOWNERS', 'CODEOWNERS']);
  });
});

function githubClient(
  getContent: (input: { owner: string; repo: string; path: string; ref: string }) => Promise<unknown>,
) {
  return {
    paginate: async () => [],
    rest: {
      pulls: {
        listFiles: () => Promise.resolve({ data: [] }),
        get: () => Promise.resolve({ data: { changed_files: 0, head: { sha: 'head-sha' } } }),
      },
      repos: { getContent },
    },
  };
}

function encodedFile(text: string) {
  return {
    data: {
      type: 'file',
      encoding: 'base64',
      content: Buffer.from(text, 'utf8').toString('base64'),
    },
  };
}
