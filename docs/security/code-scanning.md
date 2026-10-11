# CodeQL code scanning

CodeQL analyzes JavaScript/TypeScript data flow in addition to TABBIN's existing
dependency, secret, manifest, CSP, and runtime trust-boundary checks. GitHub's
repository-level **Default setup** owns the configuration. The absence of a
CodeQL workflow in `.github/workflows/` does not mean scanning is disabled.

## Configuration and execution

The configuration for `haruto-yamada1/TABBIN` is:

| Setting        | Value                                               |
| -------------- | --------------------------------------------------- |
| Setup          | Default setup; one CodeQL configuration             |
| Language       | `javascript-typescript` (JavaScript and TypeScript) |
| Query suite    | `default`                                           |
| Threat model   | `remote`                                            |
| Runner         | GitHub-hosted standard runner                       |
| Default branch | `develop`                                           |

GitHub manages the analysis workflow and CodeQL version. No dependency install,
extension build, repository secret, or new extension permission is required.
Do not add an Advanced setup workflow or upload a second CodeQL SARIF analysis
while Default setup is enabled.

Default setup runs on initial enablement, pushes to the default/protected
branches, and creation or updates of PRs targeting those branches from the same
repository. **Fork PRs are excluded by Default setup.** Maintainers must account
for that gap when accepting external contributions; do not treat a missing scan
as a pass. If scanning fork PRs becomes required, deliberately migrate the single
configuration to Advanced setup and verify its event/permission policy.

GitHub schedules weekly scans after a push or PR triggers analysis. The initial
setup scan alone does not activate that schedule. Weekly runs stop after 180
days without a triggering push/PR. The exact schedule is GitHub-managed; there
is no repository cron to maintain. See
[GitHub's setup types](https://docs.github.com/en/code-security/concepts/code-scanning/setup-types).

To inspect current state, use Settings → Advanced Security → CodeQL analysis,
[Security → Code scanning](https://github.com/haruto-yamada1/TABBIN/security/code-scanning),
and the Actions run linked from the analysis. API checks are also available:

```sh
gh api repos/haruto-yamada1/TABBIN/code-scanning/default-setup
gh api --paginate 'repos/haruto-yamada1/TABBIN/code-scanning/analyses?ref=refs/heads/develop&tool_name=CodeQL&per_page=100'
gh api --paginate 'repos/haruto-yamada1/TABBIN/code-scanning/alerts?ref=refs/heads/develop&tool_name=CodeQL&state=open&per_page=100'
```

Match an analysis's `commit_sha` to the current `develop` SHA, and check
`error`, `warning`, `results_count`, and the successful JS/TS analysis job. For a
PR, inspect its checks and query analyses with `ref=refs/pull/<number>/merge`.
Configuration being `configured`, an old successful run, or an empty alert list
alone does not prove that the requested revision was scanned. API errors such
as `no analysis found`, `403`, or `404` are not zero-alert results.

## Initial verification

On 2026-10-11, live intake found `state: not-configured`, no analysis, and no
existing CodeQL workflow. Default setup was enabled for JS/TS with the settings
above. The initial validation run is
[38115718305](https://github.com/haruto-yamada1/TABBIN/actions/runs/38115718305),
for `develop` commit `2f326bcda49c177f78e7bd19da47b0c3fdde486c`.

The run and its `Analyze (javascript-typescript)` job completed successfully.
Analysis `1930711892` used CodeQL `2.27.2`, evaluated 87 rules, and reported one
result with empty `error` and `warning`. The settled setup reports JS/TS and
`schedule: weekly`; its language list includes the aliases `javascript` and
`typescript` alongside `javascript-typescript`.

| Alert                                                                                               | Severity | Impact and decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [#1: `js/insufficient-key-size`](https://github.com/haruto-yamada1/TABBIN/security/code-scanning/1) | High     | `tools/scripts/verify-node-forge-backport.ts` generated a real 1024-bit RSA key. This is an ephemeral CI/local regression probe, with a fixed message and no externally supplied input; it does not protect user data or ship as extension code. The weak key report is accurate, so the probe now uses 2048 bits and asserts the generated modulus length. Keep the alert open until the fix reaches `develop` and CodeQL marks it fixed. No dismissal or rule suppression is used. |

The probe retains exponent `3` and its valid-signature, modified-message,
extra-DigestAlgorithm-element and non-empty-NULL-parameter assertions. The new
key-strength assertion failed against the 1024-bit baseline and the full probe
passed with 2048 bits. The initial scan reported no external-input-to-DOM/URL/
dangerous-API finding and no critical alert; that is a snapshot, not proof of
their absence beyond CodeQL's coverage.

The implementation PR must also have a successful JS/TS analysis before the
Issue's PR acceptance criterion is considered verified. Its scan outcome is
recorded in the PR checks and description; the `develop` alert remains open
until a post-merge scan confirms the fix.

## Alert triage and dismissal

The repository maintainer reviews new alerts in Security → Code scanning and
new PR annotations. Review each finding by security severity, actual impact,
and whether the reported flow is reachable. Prioritize externally controlled
tab titles/URLs, imported JSON, AI/markdown output, and runtime messages flowing
to DOM/HTML, navigation or URL APIs, dynamic code execution, shell commands, or
privileged browser/storage operations.

| Classification                             | Response                                                                                                                                                         |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Critical/high with a reachable unsafe sink | Prioritize remediation; record the source → validation → sink path, exploit conditions, owner and fix/rollback plan. Do not dismiss solely to make checks green. |
| Medium/low with real impact                | Record impact and a concrete remediation plan; account for extension privileges and user data even when the numeric severity is low.                             |
| Potential false positive                   | Inspect the complete path, validators/sanitizers, callers and tests. Keep open until evidence establishes why the path is safe.                                  |
| Test/tool-only or unreachable path         | Verify execution context and input control before deciding relevance. A file under `tools/` is not automatically harmless.                                       |

For a confirmed false positive, record the alert URL, rule ID, revision,
source/sink locations, why exploitation is prevented, and the validating test
or code evidence in the alert's dismissal comment. Choose the matching reason
(`false positive` or `used in tests` only when supported). A `won't fix` decision
must explicitly record residual risk, rationale, responsible maintainer and
revisit condition. Never bulk-dismiss high/critical findings or suppress rules
without that review. When a fix lands, let a subsequent analysis mark it fixed
and verify that result rather than manually dismissing it as a fix.

CodeQL's default suite and library models do not prove all browser-extension
boundaries safe. Continue manual source-to-sink review under
[`messaging-trust-boundary.md`](messaging-trust-boundary.md),
[`permissions.md`](permissions.md), and
[`production-network-policy.md`](production-network-policy.md).

## Separation from other security checks

| Check                                                           | Responsibility                                                                                   |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| CodeQL Default setup                                            | JS/TS source data flow and unsafe API use; results and triage live in GitHub Code scanning.      |
| `bun run security:audit`                                        | Known dependency advisories plus the node-forge backport probe; CI retains `--audit-level=high`. |
| `bun run secretlint` and GitHub secret scanning/push protection | Detect accidental secret exposure. CodeQL does not replace these.                                |
| `bun run verify:production-network-policy`                      | Generated Chrome/Firefox manifest permissions, CSP and allowed outbound origins.                 |
| Trust-boundary tests, `quality:check`, coverage, build and E2E  | Runtime contracts, architecture and regressions that static analysis alone cannot verify.        |

## Permissions, cost and configuration changes

Default setup uses GitHub's managed permissions. Existing CI workflows keep
`contents: read`; no repository-wide `security-events: write`, PAT in Actions,
write permission for PR code, or additional extension host/API permission is
needed. The initial JS/TS job log reports `Actions`, `Contents`, `Metadata` and
`Packages` read, with `SecurityEvents` write for uploading results; these are
scoped to the managed analysis job. Configuring Default setup requires
repository administration authority.
For API access, prefer a fine-grained credential limited to this repository:
Administration read for inspecting setup, Administration write for changing it,
and Code scanning alerts read/write only for the corresponding inspection or
triage operation. Do not broaden a token solely in response to a misleading
scope hint on a `no analysis found` response. See the
[REST permissions](https://docs.github.com/en/rest/code-scanning/code-scanning).

Code scanning is available without a Code Security license charge for this
public GitHub.com repository. Runner billing is a separate concern; this setup
uses standard GitHub-hosted runners, not larger or self-hosted runners.
Before making the repository private, check current plan eligibility and
GitHub Code Security licensing with the account owner. Private repositories
require paid eligibility; without it, Advanced Security features are disabled.
Licenses are based on unique active committers, so do not assume the public
repository's free access continues after a visibility change. Consult the
[current licensing rules](https://docs.github.com/en/billing/concepts/product-billing/github-advanced-security)
instead of hard-coding a price in this document.

To change languages or suite, edit Default setup in GitHub and record the new
settings and validation run here. If Advanced setup becomes necessary, disable
Default setup as part of that explicit migration, then use a reviewed workflow
with job-scoped minimum permissions and verify branch/PR/schedule results. Do
not use `pull_request_target` to execute untrusted PR code with write authority.
Disabling scanning is a security coverage regression and requires a recorded
reason and replacement/recovery plan. Reverting this documentation PR alone
does not revert the GitHub-side setting.

## References

- [Configuring Default setup](https://docs.github.com/en/code-security/how-tos/find-and-fix-code-vulnerabilities/configure-code-scanning/configure-code-scanning)
- [github/codeql-action](https://github.com/github/codeql-action)
- [Issue #935](https://github.com/haruto-yamada1/TABBIN/issues/935)
