import type { ChangedFile } from './github.js';
import { hasMatchingPath } from './paths.js';
import type { Policy, PolicyRule, Requirement } from './policy.js';

export interface PolicyViolation {
  rule: string;
  matchedPaths: string[];
  missing: string[];
}

export function evaluatePolicy(
  policy: Policy,
  changedFiles: ChangedFile[],
  codeownersCovered: boolean | ((paths: string[]) => boolean),
): PolicyViolation[] {
  const triggerCandidates = unique(changedFiles.flatMap((file) =>
    file.previousPath === undefined ? [file.path] : [file.path, file.previousPath],
  ));
  const livePaths = changedFiles
    .filter((file) => file.status !== 'removed')
    .map((file) => file.path);
  return policy.rules.flatMap((rule) =>
    evaluateRule(rule, triggerCandidates, livePaths, codeownersCovered),
  );
}

function evaluateRule(
  rule: PolicyRule,
  triggerCandidates: string[],
  livePaths: string[],
  codeownersCovered: boolean | ((paths: string[]) => boolean),
): PolicyViolation[] {
  if (!hasMatchingPath(triggerCandidates, rule.when.paths)) return [];

  const requirements = rule.require;
  const requiredPaths = requirements.flatMap((requirement) =>
    'changed-path' in requirement ? [requirement['changed-path']] : [],
  );
  const missing = requiredPaths.filter((requiredPath) =>
    !hasMatchingPath(livePaths, [requiredPath]),
  );

  const matchingPaths = triggerCandidates.filter((path) =>
    hasMatchingPath([path], rule.when.paths),
  );
  if (requirements.some(isCodeownersRequirement)) {
    const hasCoverage = typeof codeownersCovered === 'function'
      ? codeownersCovered(matchingPaths)
      : codeownersCovered;
    if (!hasCoverage) missing.push('CODEOWNERS coverage');
  }

  return missing.length > 0
    ? [{ rule: rule.name, matchedPaths: matchingPaths, missing }]
    : [];
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function isCodeownersRequirement(
  requirement: Requirement,
): requirement is { 'codeowners-covered': true } {
  return 'codeowners-covered' in requirement;
}
