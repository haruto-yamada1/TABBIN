# Production Outbound Network Policy

## Policy

TABBIN is local-first. Production code may send network requests only to the
user's local Ollama service at these origins:

- `http://localhost:11434`
- `http://127.0.0.1:11434`

The corresponding manifest host permissions are derived from the same typed
policy in `src/constants/productionNetworkPolicy.ts`. IPv6 loopback, LAN hosts,
custom Ollama endpoints, cloud AI endpoints, HTTPS, WebSocket, and EventSource
origins are not currently allowed. Adding one is a privacy-design change, not a
routine allowlist update.

## Production network inventory

The automated AST inventory in
`tools/scripts/production-network-policy.ts` recognizes `fetch`,
`XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator.sendBeacon`, and known
explicit network-client imports. It follows local aliases, destructured globals,
computed global properties, and dynamic imports. Test files and stories are
excluded.

Current production call sites are:

- `src/lib/background/ai-chat.ts` imports `ai-sdk-ollama`. It sends the user's
  prompt, chat history, attachments, system instructions, and locally derived
  saved-tab context to the configured local Ollama origin. The base URL comes
  from the shared production policy.
- `src/components/ai-elements/prompt-input.tsx` calls `fetch` only for a
  `blob:` URL created from a user-selected local file. This converts local Blob
  data to a data URL and is not outbound traffic.

There are no production `XMLHttpRequest`, WebSocket, EventSource, or
`sendBeacon` call sites. Ollama download and FAQ URLs are user navigation links;
the extension does not fetch them.

## Automated enforcement

- `bun run test:node` checks the AST inventory and policy URL behavior. A new
  detected call site fails until it is explicitly reviewed and inventoried.
- `bun run build && bun run build:firefox && bun run
verify:production-network-policy` checks both generated manifests. Required
  host permissions must exactly match the allowlist, optional host permissions
  must be absent or empty, and `connect-src` must contain only the extension
  itself, local `blob:` data, and the two Ollama origins.
- The generated extension CSP is the runtime enforcement boundary. It also sets
  a self-only `default-src`, explicit local data rules, `frame-src 'none'`,
  `form-action 'none'`, `object-src 'none'`, and `base-uri 'none'`. This prevents
  dependency or alias tricks from bypassing the call-site inventory through
  fetch-like APIs, subresources, forms, frames, or base URL rewriting.
- `.github/workflows/ci.yml` runs the generated-manifest verifier in the Verify
  Build job. `bun run release:check` runs the same gate for releases.
- The shared Playwright context fixture attaches its listener immediately after
  browser launch and before the context is exposed to page or service-worker
  fixtures. It observes requests initiated by extension pages and extension
  service workers, including document requests, and fails when an HTTP(S)/WS(S)
  origin is outside the allowlist. The CSP covers extension startup before the
  Playwright context becomes observable. Existing E2E major flows inherit this
  guard automatically.

The AST inventory intentionally analyzes syntax instead of URL text. A docs
link or browser navigation therefore does not become a false positive, while a
new request API or explicit network client becomes reviewable.

## Security review checklist for endpoint changes

Any PR that adds an endpoint, network client, or request call site must explain
and verify all of the following before changing the policy:

- What exact data is transmitted, including derived metadata, attachments,
  identifiers, URL parameters, headers, and logs.
- Why transmission is required and why a local-only design cannot satisfy the
  use case.
- How the user gives informed consent and can disable or revoke the behavior.
- Required privacy-policy, browser-store disclosure, and data-collection
  declaration changes.
- Whether host or optional permissions change and whether they remain as narrow
  as possible.
- Redaction, retention, telemetry, error-reporting, and diagnostic-log policy.
- Authentication, secret storage, transport security, and failure behavior.
- Updates to the typed allowlist, AST inventory, generated-manifest tests, E2E
  interception coverage, and user-facing documentation.

Do not silently expand the allowlist to make a new feature or dependency work.
