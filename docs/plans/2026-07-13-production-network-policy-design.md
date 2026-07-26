# Production Network Policy Design

## Context

TABBIN is local-first. Production network access is currently intended only for
the user's local Ollama server, while the generated manifests grant access to
`localhost:11434` and `127.0.0.1:11434`. That invariant is duplicated between
runtime code and `wxt.config.ts`, and there is no automated inventory or
runtime request guard.

## Decision

Use one typed production network policy as the source of truth for both the
Ollama transport and generated manifest permissions. Verify that policy at
four distinct boundaries:

1. A TypeScript-AST inventory detects direct browser network APIs and approved
   explicit network-client imports in production source, including aliases,
   computed global access, and dynamic imports.
2. A post-build verifier requires Chrome and Firefox manifests to contain
   exactly the allowed host permissions and a restrictive `connect-src` CSP.
3. The extension CSP blocks non-allowlisted connections at runtime and disables
   form and frame-based transmission.
4. The shared Playwright fixture rejects HTTP(S)/WS(S) requests initiated by an
   extension page or extension service worker unless their origin is allowed.

The existing `fetch(blob:)` call is classified as local data conversion, not
outbound traffic. The inventory records it explicitly so a new call site cannot
appear unnoticed. The AI SDK Ollama transport remains the only production
outbound client and receives its base URL from the shared policy.

## Alternatives

- Manifest-only verification was rejected because host permissions do not
  describe every runtime request or network call site.
- A generic runtime fetch wrapper was rejected because it would not cover the
  AI SDK transport and would add an incomplete compatibility layer.
- Text search for URL literals was rejected because documentation links, blob
  URLs, and navigation URLs are not outbound application requests.

## Failure behavior

Verification fails closed when a generated manifest is missing, a permission
or CSP source is missing or added, a production network call site is not
inventoried, or an extension-initiated E2E request targets an unapproved origin.
Expanding the allowlist therefore requires an explicit policy change and
security review.

## Regression strategy

Unit tests cover URL classification, AST call-site discovery, exact manifest
comparison, and the current repository inventory. Existing Ollama tests prove
the configured base URL remains usable. The E2E fixture applies the request
guard to the existing major extension flows. `bun run quality` and
`bun run release:check` remain the final repository gates.
