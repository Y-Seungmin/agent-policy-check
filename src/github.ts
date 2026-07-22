export interface GithubClient {
  paginate: (
    request: unknown,
    parameters: unknown,
  ) => Promise<unknown[]>;
  rest: {
    pulls: {
      listFiles: (input: {
        owner: string;
        repo: string;
        pull_number: number;
      }) => unknown;
      get: (input: {
        owner: string;
        repo: string;
        pull_number: number;
      }) => Promise<unknown>;
    };
    repos: {
      getContent: (input: {
        owner: string;
        repo: string;
        path: string;
        ref: string;
      }) => Promise<unknown>;
    };
  };
}

export type ChangedFileStatus =
  | 'added'
  | 'changed'
  | 'copied'
  | 'modified'
  | 'removed'
  | 'renamed'
  | 'unchanged';

export interface ChangedFile {
  path: string;
  status: ChangedFileStatus;
  previousPath?: string;
}

const CHANGED_FILE_STATUSES = new Set<ChangedFileStatus>([
  'added',
  'changed',
  'copied',
  'modified',
  'removed',
  'renamed',
  'unchanged',
]);
const GITHUB_FILE_LIMIT = 3_000;

export const CODEOWNERS_PATHS = [
  '.github/CODEOWNERS',
  'CODEOWNERS',
  'docs/CODEOWNERS',
] as const;

export async function loadChangedFiles(
  client: GithubClient,
  owner: string,
  repo: string,
  pullNumber: number,
  expectedHeadSha: string,
): Promise<ChangedFile[]> {
  const rawFiles = await client.paginate(
    client.rest.pulls.listFiles,
    { owner, repo, pull_number: pullNumber, per_page: 100 },
  );
  const pullResponse = await client.rest.pulls.get({
    owner,
    repo,
    pull_number: pullNumber,
  });
  const metadata = parsePullMetadata(pullResponse);

  if (metadata.headSha !== expectedHeadSha) {
    throw new Error(
      'Pull request head changed while agent-policy-check was running; rerun the check on the latest commit',
    );
  }
  if (metadata.changedFileCount > GITHUB_FILE_LIMIT) {
    throw new Error(
      `Pull request exceeds GitHub's 3,000-file API limit (${metadata.changedFileCount} files); split the pull request so agent-policy-check can evaluate every file`,
    );
  }
  if (rawFiles.length !== metadata.changedFileCount) {
    throw new Error(
      `GitHub returned an incomplete pull request file list: expected ${metadata.changedFileCount}, received ${rawFiles.length}`,
    );
  }

  return rawFiles.map(parseChangedFile);
}

export async function loadRepositoryText(
  client: GithubClient,
  owner: string,
  repo: string,
  path: string,
  ref: string,
): Promise<string | undefined> {
  try {
    const response = await client.rest.repos.getContent({ owner, repo, path, ref });
    if (!isRecord(response) || !isRecord(response.data)) {
      throw new Error(`GitHub returned an invalid response for ${path}`);
    }

    const file = response.data;
    if (file.type !== 'file' || file.encoding !== 'base64' || typeof file.content !== 'string') {
      throw new Error(`GitHub did not return ${path} as a base64-encoded file`);
    }

    return Buffer.from(file.content.replace(/\s/g, ''), 'base64').toString('utf8');
  } catch (error: unknown) {
    if (isGithubNotFound(error)) return undefined;
    throw error;
  }
}

export async function loadCodeownersText(
  client: GithubClient,
  owner: string,
  repo: string,
  ref: string,
): Promise<string | undefined> {
  for (const path of CODEOWNERS_PATHS) {
    const text = await loadRepositoryText(client, owner, repo, path, ref);
    if (text !== undefined) return text;
  }
  return undefined;
}

function parsePullMetadata(value: unknown): { changedFileCount: number; headSha: string } {
  if (!isRecord(value) || !isRecord(value.data)) {
    throw new Error('GitHub returned invalid pull request metadata');
  }
  const changedFileCount = value.data.changed_files;
  const head = value.data.head;
  if (!Number.isSafeInteger(changedFileCount) || (changedFileCount as number) < 0
    || !isRecord(head) || typeof head.sha !== 'string' || head.sha.length === 0) {
    throw new Error('GitHub returned invalid pull request metadata');
  }
  return { changedFileCount: changedFileCount as number, headSha: head.sha };
}

function parseChangedFile(value: unknown): ChangedFile {
  if (!isRecord(value) || typeof value.filename !== 'string' || value.filename.length === 0
    || typeof value.status !== 'string' || !isChangedFileStatus(value.status)) {
    throw new Error('GitHub returned an invalid pull request file');
  }
  if (value.status === 'renamed') {
    if (typeof value.previous_filename !== 'string' || value.previous_filename.length === 0) {
      throw new Error(`GitHub omitted previous_filename for renamed file: ${value.filename}`);
    }
    return {
      path: value.filename,
      previousPath: value.previous_filename,
      status: value.status,
    };
  }
  return { path: value.filename, status: value.status };
}

function isChangedFileStatus(value: string): value is ChangedFileStatus {
  return CHANGED_FILE_STATUSES.has(value as ChangedFileStatus);
}

function isGithubNotFound(error: unknown): boolean {
  return isRecord(error) && error.status === 404;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
