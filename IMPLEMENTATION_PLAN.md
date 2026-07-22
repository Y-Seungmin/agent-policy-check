# policy-check implementation plan

Reference: [`PROJECT.md`](./PROJECT.md)

## Completed implementation

### Policy engine

- Strict v1 YAML schema validation
- Deterministic `*`, `?`, and `**` path matching
- `changed-path` and `codeowners-covered` requirements
- Rename source/destination and deletion-aware evaluation
- Pure rule evaluation with bounded, escaped reporting

### GitHub integration

- Paginated pull request file loading with status and previous rename path
- Pull request file-count completeness and 3,000-file limit checks
- Concurrent pull request head update detection
- Policy and CODEOWNERS loading from the trusted base SHA
- GitHub CODEOWNERS location precedence
- Fail-closed API and malformed-response handling

### Action interface

- Node 24 runtime and bundled `dist/index.js` entrypoint
- `passed`, `failed`, and `skipped` results
- `result` and `violation-count` outputs
- GitHub job summaries for success, violations, skips, and operational errors
- Marketplace branding metadata

### Verification and maintenance

- Unit tests with enforced line, branch, and function coverage thresholds
- Node 24 bundle E2E tests using a local GitHub-compatible HTTP server
- Strict TypeScript build and deterministic bundle check
- Production dependency audit
- Full-SHA-pinned CI Actions and pinned actionlint version
- Dependabot configuration, repository CODEOWNERS, and security policy
- English public README with policy semantics and trust boundaries

## Module boundaries

```text
src/index.ts       GitHub Action entrypoint and operational error boundary
src/main.ts        Runtime orchestration, outputs, and summaries
src/github.ts      Pull request metadata/files and trusted repository files
src/policy.ts      Policy YAML parsing and schema validation
src/glob.ts        Deterministic glob validation and matching
src/paths.ts       Pure path requirement helpers
src/codeowners.ts  CODEOWNERS parsing and coverage evaluation
src/check.ts       Pure policy evaluation
src/report.ts      Bounded and escaped human/machine-readable results
```

## Remaining release validation

No additional v0 product features are planned before release. The remaining work requires a GitHub remote:

1. Push the uncommitted source and generated bundle to `AS1HK/policy-check`.
2. Confirm the hosted CI workflow on `ubuntu-24.04`.
3. Run sample pull requests for pass, violation, rename-out, deleted companion, missing policy, malformed policy, and CODEOWNERS coverage.
4. Enable branch protection or a ruleset with the CI check and, where desired, **Require review from Code Owners**.
5. Create an immutable release and move the `v0` major tag only after the hosted checks pass.

## Local completion command

Run under Node 24:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm run verify
```

The first public release remains blocked until the GitHub-hosted validation above is complete. This is an external release gate, not an unimplemented code path.
