# Codex Issue evaluation cases

`manifest.json` pins each case to the parent commit of a previously published
production fix. Resource paths are relative to this directory. The runner
archives that commit, so these tests and reference patches are absent from the
agent workspace. Hidden tests are stored as `.txt` files to avoid collection by
the current repository's Vitest run, and copied to their unique test targets only
after the agent finishes.

| Case               | Live contract                                                     | Reference fix                              | Hidden assertions                                                                                                                                                        |
| ------------------ | ----------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `default-language` | [Issue #675](https://github.com/haruto-yamada1/TABBIN/issues/675) | `89e08000c587af7521550e361aca2f01a68f1b68` | Chrome/Firefox manifest defaults, app locale fallback and explicit overrides, English Firefox artifact requirement                                                       |
| `ollama-host`      | [Issue #671](https://github.com/haruto-yamada1/TABBIN/issues/671) | `4d432fc8be3e559cb63a54ceed00bf66ec1c3027` | Settings save/read, tags and inference transport, disallowed writes, legacy fallback, request-consistent diagnostics, actual options selector and remount/reset behavior |
| `render-recovery`  | [Issue #717](https://github.com/haruto-yamada1/TABBIN/issues/717) | `34df20c069b179a6fbf2537a7fab78ee9c51a404` | Root and mount recovery, explicit retry, payload redaction, crash-to-healthy-route navigation, validated Backup V2 export wiring and failure containment                 |

The reference patches contain only allowlisted production changes, including the
package imports alias needed to share the language policy. They do not contain
the original implementation tests. Hidden tests use new scenarios and the
existing public call paths. They verify the behavior listed above. The Ollama
case has an additional DOM hidden test that uses the existing OptionsRoute, the
actual settings hook, writer/readback, and Select. It verifies that only the two
allowed hosts are offered, that a selected host persists across unmount/remount,
and that missing, invalid, or externally removed settings show the safe default.
Only Chrome storage/events and unrelated options sections are replaced at the
test boundary.

Each case records exact `expectedHiddenTests` and `expectedRegressionTests`
counts, with no skipped tests permitted. This catches missing test collection or
selective execution. The render-recovery hidden tests also reject a mutation that
removes pathname-based route recovery, and observe mountToElement and the
existing Backup V2 export/download composition.

Each case also pins `regressionTests` to existing tests that protect preserved
behavior and remain compatible with the requested change. Grading the full
historical suite would conflict with the new contract: the original Firefox
artifact tests require Japanese as the default, and the original root-render
mock expects a node without an Error Boundary wrapper. Those historical tests
remain intact. The independent hidden tests verify the changed contract, and the
curated existing tests, TypeScript compilation, and architecture checks guard
the preserved contracts.

All cases require Node 24.x and Bun 1.3.14 and install their historical lockfile
with `bun install --frozen-lockfile`. The first two snapshots use Vitest 5.0.3 /
TypeScript 7.0.2; the render-recovery snapshot uses Vitest 4.1.11 / TypeScript
6.0.3. The runner must use each snapshot's installed toolchain rather than the
current checkout's dependencies. On restricted macOS hosts, a writable
`SWC_NATIVE_BINDING_CACHE` directory can be needed by architecture checks.

The default-language tests also preserve the real configuration's Chrome and
Firefox permissions, allowed hosts, and CSP using the unchanged baseline policy.
They exercise non-locale Firefox manifest and artifact rejection, so a locale
change cannot be made by weakening those checks. The render-recovery tests also
exercise a failure from the existing Backup V2 exporter through the actual
recovery composition: no fallback data may be downloaded and recovery remains
usable without exposing the private error.

When adding a case, confirm that its untouched snapshot fails the hidden tests
for the expected behavior, its production-only reference patch passes them, and
the curated regression tests, compile, and architecture checks pass. Keep the
test target unique and ensure every reference-patch path is in `allowedPaths`.
