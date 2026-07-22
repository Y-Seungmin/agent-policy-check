# Security policy

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability.

Report it through the repository's **Security** tab by selecting **Report a vulnerability**. Include the affected version or commit, impact, reproduction steps, and any suggested mitigation. If private vulnerability reporting is temporarily unavailable, open a minimal public issue asking the maintainer to enable a private reporting channel; do not include exploit details.

You should receive an initial response within seven days. Confirmed issues will be coordinated through a GitHub Security Advisory before public disclosure.

## Supported versions

Until the first stable release, only the latest `v0` release is supported. Security fixes are not backported to older `v0` revisions.

## Security model

`policy-check` reads pull request metadata, `.policy-check.yml`, and CODEOWNERS through the GitHub API. It does not execute pull request code, check out the pull request head, send repository content to an external service, or request write permissions.
