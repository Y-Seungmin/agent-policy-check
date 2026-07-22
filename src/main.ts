import { hasCodeownersCoverage, parseCodeowners } from './codeowners.js';
import { evaluatePolicy, type PolicyViolation } from './check.js';
import {
  loadChangedFiles,
  loadCodeownersText,
  loadRepositoryText,
  type ChangedFile,
  type GithubClient,
} from './github.js';
import { parsePolicy } from './policy.js';
import { formatFailure, renderSummary, type CheckResult } from './report.js';

export interface PullRequestRuntime {
  client: GithubClient;
  owner: string;
  repo: string;
  pullNumber: number;
  baseSha: string;
  headSha: string;
}

export interface RunOptions {
  eventName?: string;
  policyText?: string;
  changedFiles?: ChangedFile[];
  codeownersText?: string;
  runtime?: PullRequestRuntime;
  loadRuntime?: () => PullRequestRuntime;
  log?: (message: string) => void;
  fail?: (message: string) => void;
  setOutput?: (name: string, value: string | number) => void;
  writeSummary?: (markdown: string) => void | Promise<void>;
}

export async function run(options: RunOptions = {}): Promise<PolicyViolation[]> {
  const eventName = options.eventName ?? process.env.GITHUB_EVENT_NAME ?? 'unknown';
  const log = options.log ?? (() => undefined);
  const fail = options.fail ?? ((message: string) => { throw new Error(message); });
  const setOutput = options.setOutput ?? (() => undefined);
  const writeSummary = options.writeSummary ?? (() => undefined);
  log(`agent-policy-check started: ${eventName}`);

  const publish = async (
    result: CheckResult,
    violations: PolicyViolation[],
    changedFileCount?: number,
  ): Promise<void> => {
    setOutput('result', result);
    setOutput('violation-count', violations.length);
    await writeSummary(renderSummary({ result, violations, changedFileCount }));
  };

  let runtime = options.runtime;
  const getRuntime = (): PullRequestRuntime => {
    runtime ??= options.loadRuntime?.();
    if (runtime === undefined) throw new Error('GitHub pull request runtime is required');
    return runtime;
  };

  const policyText = options.policyText ?? await loadPolicyText(getRuntime());
  if (policyText === undefined) {
    log('No .policy-check.yml found on the pull request base commit; skipping policy checks');
    await publish('skipped', []);
    return [];
  }

  const policy = parsePolicy(policyText);
  const changedFiles = options.changedFiles ?? await loadRuntimeChangedFiles(getRuntime());
  const requiresCodeowners = policy.rules.some((rule) =>
    rule.require.some((requirement) => 'codeowners-covered' in requirement),
  );
  const codeownersText = requiresCodeowners
    ? options.codeownersText ?? await loadRuntimeCodeowners(getRuntime())
    : undefined;
  const codeownersEntries = codeownersText === undefined
    ? undefined
    : parseCodeowners(codeownersText);
  const codeownersCovered = codeownersEntries === undefined
    ? () => false
    : (paths: string[]) => hasCodeownersCoverage(codeownersEntries, paths);
  const violations = evaluatePolicy(policy, changedFiles, codeownersCovered);

  if (violations.length > 0) {
    await publish('failed', violations, changedFiles.length);
    fail(formatFailure(violations));
  } else {
    await publish('passed', [], changedFiles.length);
    log('All policy checks passed');
  }

  return violations;
}

function loadPolicyText(runtime: PullRequestRuntime): Promise<string | undefined> {
  return loadRepositoryText(
    runtime.client,
    runtime.owner,
    runtime.repo,
    '.policy-check.yml',
    runtime.baseSha,
  );
}

function loadRuntimeChangedFiles(runtime: PullRequestRuntime): Promise<ChangedFile[]> {
  return loadChangedFiles(
    runtime.client,
    runtime.owner,
    runtime.repo,
    runtime.pullNumber,
    runtime.headSha,
  );
}

function loadRuntimeCodeowners(runtime: PullRequestRuntime): Promise<string | undefined> {
  return loadCodeownersText(runtime.client, runtime.owner, runtime.repo, runtime.baseSha);
}
