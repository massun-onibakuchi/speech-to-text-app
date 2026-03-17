# GOLDEN PRINCIPLES

Use these principles to evaluate architecture, code, tests, and design.
For each relevant principle: confirm it applies and run the check.

## Principles

1. Clear responsibilities: organize modules around business capabilities with one main purpose and owner.
   Check: can the unit's purpose be explained in one sentence?
2. Separate core logic: keep business rules independent from UI, transport, storage, and integrations.
   Check: can the core rule be tested without UI or external systems?
3. Control coupling: depend on stable contracts, avoid global state, limit exposed internals, and reduce call-order fragility.
   Check: can internals change without forcing consumer edits?
4. Optimize for changeability: prefer architectures and abstractions that reduce future change cost over trends.
   Check: does this make a realistic future change easier?
5. Design for failure: validate external input early and handle outages, retries, and partial failure deliberately.
   Check: are failure modes named and handled?
6. Use synchronous boundaries only when needed: require immediate responses only for correctness-critical or user-visible work.
   Check: does the caller need the answer now?
7. Build observability in: provide enough logs, metrics, traces, and correlation data to debug production failures.
   Check: will operators know what failed, where, and for whom?
8. Reuse proven mechanisms: prefer established utilities over local reinvention and avoid duplicating knowledge.
   Check: does a shared mechanism already solve this?
9. Test clear contracts: make each test verify one clear behavior or boundary, keep data explicit, and treat flakiness as a defect.
   Check: does each test make one claim and exercise at least one real boundary beyond mocks, with both required?
10. Make contracts and state explicit: keep invariants, allowed transitions, and state ownership visible and enforced by the owner.
    Check: are misuse and invalid state changes hard to perform?

## Review Lens

P1 Responsibility, P2 Separation, P3 Coupling, P4 Changeability, P5 Failure handling, P6 Synchrony, P7 Observability, P8 Reuse, P9 Testing, P10 Contracts and state.
