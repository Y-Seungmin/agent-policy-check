import * as core from '@actions/core';
import * as github from '@actions/github';
import { run } from './main.js';
import { renderErrorSummary } from './report.js';

async function main(): Promise<void> {
  try {
    await run({
      eventName: github.context.eventName,
      loadRuntime: () => {
        const token = core.getInput('github-token', { required: true });
        const client = github.getOctokit(token);
        const { owner, repo } = github.context.repo;
        const pullRequest = github.context.payload.pull_request;
        const pullNumber = pullRequest?.number;
        const baseSha = pullRequest?.base?.sha;
        const headSha = pullRequest?.head?.sha;
        if (typeof pullNumber !== 'number' || typeof baseSha !== 'string'
          || typeof headSha !== 'string') {
          throw new Error('policy-check requires a pull_request event with base and head commits');
        }
        return { client, owner, repo, pullNumber, baseSha, headSha };
      },
      log: core.info,
      fail: core.setFailed,
      setOutput: core.setOutput,
      writeSummary: async (markdown) => {
        await core.summary.addRaw(markdown).write();
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    core.setOutput('result', 'failed');
    core.setOutput('violation-count', 0);
    try {
      await core.summary.addRaw(renderErrorSummary(message)).write();
    } catch (summaryError: unknown) {
      core.error(`Could not write the policy-check job summary: ${String(summaryError)}`);
    }
    core.setFailed(message);
  }
}

void main();
