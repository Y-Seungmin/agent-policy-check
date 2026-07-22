import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

const policy = `version: 1
rules:
  - name: auth changes require tests
    when:
      paths: [src/auth/**]
    require:
      - changed-path: tests/auth/**`;

describe('bundled GitHub Action', () => {
  let fixtureDirectory: string;

  before(async () => {
    assert.equal(
      process.versions.node.split('.')[0],
      '24',
      'bundle E2E must run on the same Node 24 runtime declared by action.yml',
    );
    fixtureDirectory = await mkdtemp(path.join(tmpdir(), 'policy-check-e2e-'));
  });

  after(async () => {
    await rm(fixtureDirectory, { recursive: true, force: true });
  });

  it('runs the bundle against GitHub-compatible HTTP endpoints and fails a violation', async () => {
    const result = await runBundle(fixtureDirectory, [
      { filename: 'src/auth/session.ts', status: 'modified' },
    ]);

    assert.equal(result.code, 1);
    assert.match(result.stdout, /policy-check started: pull_request/);
    assert.match(result.stdout, /auth changes require tests: missing tests\/auth\/\*\*/);
    assert.equal(result.stderr, '');
    assert.deepEqual(result.requests.map((request) => request.path), [
      '/repos/org/repo/contents/.policy-check.yml?ref=base-sha',
      '/repos/org/repo/pulls/7/files?per_page=100',
      '/repos/org/repo/pulls/7',
    ]);
    assert.ok(result.requests.every((request) => request.authorization === 'token test-token'));
    assert.deepEqual(parseOutputs(result.output), {
      result: 'failed',
      'violation-count': '1',
    });
    assert.match(result.summary, /❌ Failed/);
    assert.match(result.summary, /src\/auth\/session\.ts/);
  });

  it('exits successfully and publishes outputs when policy requirements pass', async () => {
    const result = await runBundle(fixtureDirectory, [
      { filename: 'src/auth/session.ts', status: 'modified' },
      { filename: 'tests/auth/session.test.ts', status: 'added' },
    ]);

    assert.equal(result.code, 0);
    assert.match(result.stdout, /All policy checks passed/);
    assert.equal(result.stderr, '');
    assert.deepEqual(parseOutputs(result.output), {
      result: 'passed',
      'violation-count': '0',
    });
    assert.match(result.summary, /✅ Passed — 2 changed files evaluated/);
  });

  it('publishes a failed result and summary when execution cannot complete', async () => {
    const result = await runBundle(
      fixtureDirectory,
      [{ filename: 'src/auth/session.ts', status: 'modified' }],
      'version: 1\nrules: invalid',
    );

    assert.equal(result.code, 1);
    assert.match(result.stdout, /Policy must contain version: 1 and a rules array/);
    assert.deepEqual(parseOutputs(result.output), {
      result: 'failed',
      'violation-count': '0',
    });
    assert.match(result.summary, /policy-check could not complete/);
    assert.match(result.summary, /rules array/);
  });
});

interface ApiRequest {
  authorization?: string;
  path: string;
}

interface BundleResult {
  code: number | null;
  output: string;
  requests: ApiRequest[];
  stderr: string;
  stdout: string;
  summary: string;
}

async function runBundle(
  fixtureDirectory: string,
  changedFiles: Array<{ filename: string; status: string }>,
  policyText = policy,
): Promise<BundleResult> {
  const fixtureId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const eventPath = path.join(fixtureDirectory, `${fixtureId}-event.json`);
  const outputPath = path.join(fixtureDirectory, `${fixtureId}-output.txt`);
  const summaryPath = path.join(fixtureDirectory, `${fixtureId}-summary.md`);
  await Promise.all([
    writeFile(eventPath, JSON.stringify({
      pull_request: {
        number: 7,
        base: { sha: 'base-sha' },
        head: { sha: 'head-sha' },
      },
      repository: {
        name: 'repo',
        owner: { login: 'org' },
      },
    }), 'utf8'),
    writeFile(outputPath, '', 'utf8'),
    writeFile(summaryPath, '', 'utf8'),
  ]);

  const requests: ApiRequest[] = [];
  const server = createServer((request, response) => {
    requests.push({
      path: request.url ?? '',
      authorization: request.headers.authorization,
    });
    handleApiRequest(request, response, changedFiles, policyText);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    const address = server.address();
    assert.ok(address !== null && typeof address === 'object');
    const child = await spawnBundle({
      ...process.env,
      GITHUB_API_URL: `http://127.0.0.1:${address.port}`,
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_OUTPUT: outputPath,
      GITHUB_REPOSITORY: 'org/repo',
      GITHUB_STEP_SUMMARY: summaryPath,
      'INPUT_GITHUB-TOKEN': 'test-token',
    });
    const [output, summary] = await Promise.all([
      readFile(outputPath, 'utf8'),
      readFile(summaryPath, 'utf8'),
    ]);
    return { ...child, output, requests, summary };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

function handleApiRequest(
  request: IncomingMessage,
  response: ServerResponse,
  changedFiles: Array<{ filename: string; status: string }>,
  policyText: string,
): void {
  const requestPath = request.url ?? '';
  if (requestPath === '/repos/org/repo/contents/.policy-check.yml?ref=base-sha') {
    sendJson(response, {
      type: 'file',
      encoding: 'base64',
      content: Buffer.from(policyText, 'utf8').toString('base64'),
    });
    return;
  }
  if (requestPath === '/repos/org/repo/pulls/7/files?per_page=100') {
    sendJson(response, changedFiles);
    return;
  }
  if (requestPath === '/repos/org/repo/pulls/7') {
    sendJson(response, {
      changed_files: changedFiles.length,
      head: { sha: 'head-sha' },
    });
    return;
  }
  response.writeHead(404, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ message: `Unexpected request: ${requestPath}` }));
}

function sendJson(response: ServerResponse, value: unknown): void {
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify(value));
}

function spawnBundle(env: NodeJS.ProcessEnv): Promise<{
  code: number | null;
  stderr: string;
  stdout: string;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['dist/index.js'], {
      cwd: path.resolve('.'),
      env,
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, stderr, stdout }));
  });
}

function parseOutputs(text: string): Record<string, string> {
  const outputs: Record<string, string> = {};
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^([^<]+)<<(.+)$/.exec(lines[index] ?? '');
    if (!match) continue;
    const [, name, delimiter] = match;
    const value: string[] = [];
    index += 1;
    while (index < lines.length && lines[index] !== delimiter) {
      value.push(lines[index] ?? '');
      index += 1;
    }
    outputs[name] = value.join('\n');
  }
  return outputs;
}
