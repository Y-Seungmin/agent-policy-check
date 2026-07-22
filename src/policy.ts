import { parse as parseYaml } from 'yaml';
import { isSupportedGlob } from './glob.js';

export interface Policy {
  version: 1;
  rules: PolicyRule[];
}

export interface PolicyRule {
  name: string;
  when: { paths: string[] };
  require: Requirement[];
}

export type Requirement = { 'changed-path': string } | { 'codeowners-covered': true };

export function parsePolicy(text: string): Policy {
  const value: unknown = parseYaml(text);
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.rules)) {
    throw new Error('Policy must contain version: 1 and a rules array');
  }
  assertOnlyKeys(value, ['version', 'rules'], 'Policy');

  const rules = value.rules.map(parseRule);
  const names = new Set<string>();
  for (const rule of rules) {
    if (names.has(rule.name)) throw new Error(`Policy rule names must be unique: ${rule.name}`);
    names.add(rule.name);
  }

  return {
    version: 1,
    rules,
  };
}

function parseRule(value: unknown): PolicyRule {
  if (!isRecord(value) || typeof value.name !== 'string' || !isRecord(value.when) || !Array.isArray(value.when.paths) || !Array.isArray(value.require)) {
    throw new Error('Each policy rule needs name, when.paths, and require');
  }
  assertOnlyKeys(value, ['name', 'when', 'require'], 'Policy rule');
  assertOnlyKeys(value.when, ['paths'], 'Policy rule when');
  if (value.name.trim().length === 0) throw new Error('Policy rule name must not be empty');
  if (value.when.paths.length === 0) throw new Error('when.paths must contain at least one path');
  if (value.require.length === 0) throw new Error('require must contain at least one requirement');

  return {
    name: value.name.trim(),
    when: { paths: value.when.paths.map((path) => requireGlob(path, 'when.paths')) },
    require: value.require.map(parseRequirement),
  };
}

function parseRequirement(value: unknown): Requirement {
  if (!isRecord(value)) throw new Error('Policy requirements must be objects');
  const keys = Object.keys(value);
  if (keys.length !== 1) {
    throw new Error('Policy requirements must contain exactly one supported field');
  }
  if (keys[0] === 'changed-path') {
    return { 'changed-path': requireGlob(value['changed-path'], 'changed-path') };
  }
  if (keys[0] === 'codeowners-covered' && value['codeowners-covered'] === true) {
    return { 'codeowners-covered': true };
  }
  throw new Error('Policy requirements must contain exactly one supported field');
}

function requireGlob(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} must contain non-empty path strings`);
  }
  const pattern = value.trim();
  if (!isSupportedGlob(pattern)) throw new Error(`${field} contains unsupported glob syntax: ${pattern}`);
  return pattern;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertOnlyKeys(value: Record<string, unknown>, allowed: string[], field: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) throw new Error(`${field} contains unknown fields: ${unknown.join(', ')}`);
}
