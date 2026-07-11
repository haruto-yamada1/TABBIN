# AI Chat Stream Abort Design

## Goal

Stop the request owned by an AI chat streaming port when that port disconnects,
and prevent every late stream message from being posted after disconnection.

## Root cause

The UI already disconnects its active runtime port when a conversation is reset,
switched, or unmounted. The background handler does not connect that port
lifecycle to the request lifecycle: `runAiChatRequest` has no cancellation input,
and its `step`, `complete`, and `error` paths always call `port.postMessage`.

AI SDK 7 accepts `abortSignal` in `generateText`, and the installed Ollama
provider forwards that signal to its request. The missing boundary is therefore
inside TABBIN, between the runtime port handler and `generateText`.

## Design

Each accepted `run` message creates its own `AbortController`. The handler
registers a disconnect listener that aborts that controller. It passes the
controller signal through `RunAiChatRequestOptions` to `generateText` as
`abortSignal`.

The handler also treats the signal as the authoritative lifecycle state before
every `postMessage`. This guard is required even though the provider supports
aborting because a provider can finish concurrently with the disconnect event
or may not honor cancellation perfectly.

An abort caused by disconnect is a normal user action. Its rejection must not be
converted into an error message or shown as an error toast.

No global request registry is introduced. A request-local controller gives
concurrent streams independent cancellation and avoids shared mutable state.

## UI lifecycle

The existing controller disconnects the active port on reset, conversation
switch, and unmount, and it rejects late responses with a conversation
generation check. Production UI code will remain unchanged unless a regression
test demonstrates a missing lifecycle transition.

## Tests

- Background: disconnect aborts the exact signal passed to `runAiChatRequest`.
- Background: no `step`, `complete`, or `error` message is posted after abort.
- AI request: `runAiChatRequest` passes its signal to `generateText` as
  `abortSignal`.
- UI: retain or strengthen reset, conversation-switch, and unmount tests proving
  that the active or late-resolving port is disconnected and stale responses do
  not mutate the new conversation.

## Validation

Run the focused node and DOM tests first, then compile, full tests, coverage,
React Doctor for changed React scope, and the repository quality gate.
