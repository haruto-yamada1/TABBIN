# Meaningful Tests

TABBIN treats coverage as a completion gate, not as the design source for test
cases. A meaningful test must make the protected behavior readable and must fail
when that behavior regresses.

## Definition

A test is meaningful when it satisfies both conditions:

- The behavior under test can be understood as product or domain specification.
- The assertion observes a result that matters to users, domain invariants, or
  an integration boundary.

Avoid designing tests from uncovered lines first. Start from a behavior that
would matter if it broke, then choose the smallest test layer that protects it.

## Priority

Representative flows are selected in this order:

1. Saved tabs are not lost, wrongly deleted, or misclassified.
2. Import, export, and restore preserve data, including legacy payloads and
   placeholder URL generation.
3. ParentCategory and CustomProject creation, deletion, movement, and reload
   persistence keep expected data relationships.
4. Browser extension boundaries behave correctly: browser APIs, background
   messages, and chrome.storage change events.
5. AI chat failures and recovery states remain understandable to the user.

## Test Layers

Use one representative E2E test for a critical flow, then cover the detailed
branches with integration and unit tests.

- E2E tests protect only the highest-risk user flows.
- Feature/application integration tests are the main layer for representative
  behavior.
- Infrastructure integration tests protect storage, background message, browser
  API, and adapter contracts.
- Domain tests protect invariants, value object validation, classification
  rules, and schema behavior.
- Mock-heavy tests are limited to external boundary contracts such as browser
  APIs, runtime messages, and notifications.

## Assertion Style

Test setup, fixtures, and helpers may be reused, but expectations should remain
explicit enough to read as specification.

- Name fixtures by scenario, such as a TabGroup categorized for work or a legacy
  import payload.
- Keep expected values close to the test case when they describe behavior.
- Do not generate expected values with the same production function being
  tested.
- Prefer saved state, visible UI, restored snapshots, emitted domain events, or
  adapter payloads over only checking that a mock was called.
- In UI tests, prefer userEvent with role and accessible name queries.
- Treat querySelector, class assertions, and DOM structure checks as exceptions.
- Write test names as behavior statements, not generic success statements.

## Audit Categories

Existing tests should be audited by risk, not by blaming every weak-looking
pattern. Classify each candidate into one of these categories and decide whether
to replace, reinforce, or keep it.

- Coverage filler: a test reaches a branch but does not describe behavior.
- Mock-only: a test only checks calls and misses observable results.
- Implementation-detail UI: a test depends on DOM structure, classes, or
  selectors instead of user-facing semantics.
- Weak title: a test name does not say what behavior would regress.
- Oversized scenario: a file or case is too large to see which specification it
  protects.
- Missing representative flow: unit coverage exists, but the end-to-end behavior
  from action to persistence or recovery is not covered.

## Review Checklist

When adding or changing tests:

- Does the test start from a product behavior, domain invariant, or boundary
  contract?
- Would the test fail for a real regression users or maintainers care about?
- Is the expected result explicit enough to read without re-running production
  logic mentally?
- Is this the smallest reliable layer for the behavior?
- Are mocks limited to true external boundaries?
- For UI, does the test interact the way a user or assistive technology would?
- If the test is issue-driven, does the test name or surrounding context preserve
  the regression reason?
