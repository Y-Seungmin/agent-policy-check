# policy-check product specification

## Positioning

`policy-check` is a lightweight GitHub Action that deterministically enforces repository-defined quality policies on pull requests.

It is not an AI reviewer. AI review tools interpret code and offer suggestions; policy-check answers a narrower, verifiable question: **did this pull request satisfy the explicit merge prerequisites defined by the repository owner?**

The product is intentionally serverless, read-only, reproducible, and independent of who or what authored the pull request.

## v0 contract

The policy file is `.policy-check.yml` at the repository root.

```yaml
version: 1
rules:
  - name: auth changes require tests and ownership
    when:
      paths:
        - src/auth/**
    require:
      - changed-path: tests/auth/**
      - codeowners-covered: true
```

v0 supports two requirements:

- `changed-path`: requires a live changed destination matching the configured glob.
- `codeowners-covered: true`: requires every path that triggered the rule to be covered by at least one owner in the trusted CODEOWNERS file.

Actual review approval remains the responsibility of GitHub branch protection or rulesets.

## Change semantics

- Added and modified paths can trigger rules and satisfy `changed-path`.
- Deleted paths can trigger rules but cannot satisfy `changed-path`.
- Both the previous and destination paths of a rename can trigger rules.
- Only the rename destination can satisfy `changed-path`.
- CODEOWNERS coverage is checked for each old or new path that triggered a rule.

These semantics prevent rename-out and deleted-companion bypasses.

## Trust model

- Changed files are loaded through the GitHub Pull Requests API.
- Policy and CODEOWNERS are loaded from the exact pull request `base.sha` through the Contents API.
- Pull request head content is never used as policy input.
- The current pull request head SHA is compared with the triggering event after file loading; a concurrent update fails closed.
- Only a GitHub `404` is treated as an absent optional file. All other API and response errors fail the run.
- A declared file count above GitHub's 3,000-file response limit, or a metadata/list mismatch, fails closed.
- The Action requests only `contents: read` and `pull-requests: read`.
- No checkout, pull request code execution, external service, or write operation is required.

## CODEOWNERS compatibility

Search order:

1. `.github/CODEOWNERS`
2. `CODEOWNERS`
3. `docs/CODEOWNERS`

Supported behavior includes `*`, `?`, `**`, root anchors, directory patterns, inline comments, email owners, last-match precedence, and ownerless exceptions. Negated patterns, character classes, and backslashes are rejected.

## Results

- `passed`: all triggered rules were satisfied.
- `failed`: at least one rule was violated or policy-check could not safely complete.
- `skipped`: the base commit does not contain `.policy-check.yml`.

Every completed evaluation writes `result` and `violation-count` outputs plus a bounded GitHub job summary. Violation summaries include rule names, matched paths, and missing requirements. Operational failures also produce a summary.

## Deliberate non-goals

- AI or semantic code review
- Natural-language policy interpretation
- Automatic fixes, commits, labels, or pull request comments
- Review approval or organization-membership checks
- AST or language-specific analysis
- Hosted dashboards or repository data transmission

## Release quality bar

- Unit tests enforce at least 95% line coverage, 85% branch coverage, and 95% function coverage.
- The TypeScript codebase passes strict type checking.
- The checked-in `dist/index.js` bundle is reproducible from source.
- The bundle runs end-to-end on Node 24 against a local GitHub-compatible HTTP server for pass, policy violation, and operational error paths.
- Production dependencies pass `pnpm audit --prod`.
- CI workflows pass actionlint and pin all external Actions to full commit SHAs.
- README, Action metadata, outputs, permissions, limits, and security reporting are documented.
- A real GitHub-hosted pull request run is required before publishing the first `v0` tag.
