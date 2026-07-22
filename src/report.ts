import type { PolicyViolation } from './check.js';

export type CheckResult = 'passed' | 'failed' | 'skipped';

export interface SummaryInput {
  result: CheckResult;
  violations: PolicyViolation[];
  changedFileCount?: number;
}

const SUMMARY_VIOLATION_LIMIT = 25;
const FAILURE_VIOLATION_LIMIT = 10;
const FAILURE_REQUIREMENT_LIMIT = 10;
const CELL_ITEM_LIMIT = 10;
const TEXT_LIMIT = 120;

export function renderSummary(input: SummaryInput): string {
  if (input.result === 'skipped') {
    return '# policy-check\n\n'
      + '⏭️ Skipped — No policy file was found at `.policy-check.yml` on the pull request base commit.\n';
  }

  const changedFileCount = input.changedFileCount ?? 0;
  if (input.result === 'passed') {
    return '# policy-check\n\n'
      + `✅ Passed — ${changedFileCount} changed ${plural(changedFileCount, 'file')} evaluated.\n`;
  }

  const visible = input.violations.slice(0, SUMMARY_VIOLATION_LIMIT);
  const rows = visible.map((violation) => [
    escapeMarkdown(shorten(violation.rule)),
    formatItems(violation.matchedPaths),
    formatItems(violation.missing),
  ].join(' | '));
  const hiddenCount = input.violations.length - visible.length;
  const hiddenNotice = hiddenCount > 0
    ? `\n_${hiddenCount === 1 ? '1 more violation' : `and ${hiddenCount} more violations`} not shown._\n`
    : '';

  return '# policy-check\n\n'
    + `❌ Failed — ${input.violations.length} policy ${plural(input.violations.length, 'violation')} across ${changedFileCount} changed ${plural(changedFileCount, 'file')}.\n\n`
    + '| Rule | Matched path(s) | Missing requirement(s) |\n'
    + '| --- | --- | --- |\n'
    + rows.map((row) => `| ${row} |`).join('\n')
    + '\n'
    + hiddenNotice;
}

export function formatFailure(violations: PolicyViolation[]): string {
  const visible = violations.slice(0, FAILURE_VIOLATION_LIMIT);
  const lines = visible.map((violation) =>
    `${sanitizeLog(violation.rule)}: missing ${formatLogRequirements(violation.missing)}`,
  );
  const hiddenCount = violations.length - visible.length;
  if (hiddenCount > 0) lines.push(`and ${hiddenCount} more violations; see the job summary`);
  return lines.join('\n');
}

function formatLogRequirements(requirements: string[]): string {
  const visible = requirements.slice(0, FAILURE_REQUIREMENT_LIMIT).map(sanitizeLog);
  const hiddenCount = requirements.length - visible.length;
  if (hiddenCount > 0) visible.push(`and ${hiddenCount} more requirements`);
  return visible.join(', ');
}

export function renderErrorSummary(message: string): string {
  const safeMessage = escapeMarkdown(shorten(message.replace(/[\r\n]+/g, ' ')));
  return '# policy-check\n\n'
    + '❌ Failed — policy-check could not complete.\n\n'
    + `**Error:** ${safeMessage}\n`;
}

function formatItems(values: string[]): string {
  const visible = values.slice(0, CELL_ITEM_LIMIT).map((value) =>
    escapeMarkdown(shorten(value)),
  );
  const hiddenCount = values.length - visible.length;
  if (hiddenCount > 0) visible.push(`… +${hiddenCount} more`);
  return visible.join('<br>');
}

function sanitizeLog(value: string): string {
  return shorten(value.replace(/[\r\n]+/g, ' '));
}

function shorten(value: string): string {
  return value.length <= TEXT_LIMIT ? value : `${value.slice(0, TEXT_LIMIT - 1)}…`;
}

function escapeMarkdown(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\|/g, '&#124;')
    .replace(/[\r\n]+/g, ' ');
}

function plural(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`;
}
