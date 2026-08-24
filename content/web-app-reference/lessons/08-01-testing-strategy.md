---
id: testing-strategy
title: "Testing Strategy"
summary: Why a suite can be green, thorough and widely quoted while the feature it covers does nothing, and what decides where the next piece of evidence should go.
objectives:
  - Read a testing strategy as a choice about where evidence is useful rather than as a count of tests
  - Reach for the narrowest test that can disprove the behavior, and know what the broader ones are for
  - Weigh fidelity, speed and diagnosis against the evidence each kind of test actually produces
estimatedMinutes: 12
difficulty: intermediate
prerequisites: [scaling-and-resilience, third-party-integrations]
tags: [quality-and-observability]
---

## The suite that was green while cancellation was broken

A customer reports that canceling an order does nothing. The suite is green,
every module has tests, and the coverage number is what this team quotes when
anyone asks about quality.

Neither half of that is a broken test. Tests pass when the feature is broken,
and coverage percentages are treated as correctness — two failure modes named
here, inside a suite reporting exactly what it measured. Nobody asked what that
was.

## The narrowest test that can disprove it

A testing strategy chooses where automated and human checks provide useful
evidence about behavior. It favors stable public boundaries and risk over
maximizing test counts or one test shape. A count is precisely what that
sentence declines to optimize.

The working rule is to use the narrowest test that can disprove the important
behavior, then add broader tests for boundary wiring and a small number of
critical journeys. Production monitoring covers conditions pre-release tests
cannot reproduce fully.

Read those three as a division of labor rather than a ranking. The first says
where to start. The second says what breadth is for — wiring, and a few
journeys, not a second copy of everything underneath. The third concedes that
some conditions never reach a test at all.

Tests are meant to make change safer, localize defects, and document
expectations without freezing implementation details. That last clause
constrains how you write a test, not how many you write.

## What each kind of test is allowed to prove

Unit tests exercise deterministic behavior through a module's public interface.
Integration tests use real boundary implementations such as a database or HTTP
adapter. Contract tests verify assumptions shared by independently changing
parties. End-to-end tests observe a user journey through deployed components,
and accessibility conformance applies to complete processes and full pages,
which is the level at which that claim can be made at all. Property tests
explore invariants across generated inputs.

Together they span domain functions, component boundaries, persistence
adapters, API contracts, browser journeys, security controls, accessibility,
performance, and recovery.

::activity{id="testing-strategy-mc1"}

## One cancellation rule, five lines of evidence

An order cancellation rule has focused domain tests. A database integration
test verifies concurrency. An API contract test checks conflict semantics. One
browser test confirms a user can cancel and sees an accessible result.
Production metrics track cancellation errors by reason.

Five lines, and four of them are kinds of test named above. The focused domain
tests are unit tests through the rule's public interface. The database test is
an integration test using a real boundary implementation. The API check is a
contract test over assumptions shared by independently changing parties. The
browser test is the end-to-end journey, and the accessible result belongs in
that sentence because conformance applies to complete processes and full pages.

The fifth line is not a test. Metrics tracking cancellation errors by reason
are production monitoring, covering what pre-release tests cannot reproduce
fully.

Property tests never appear here. Nothing in this example generates inputs; the
rule is exercised with cases somebody chose.

::activity{id="testing-strategy-mat1"}

## Fidelity, speed, and a green run you can believe

Fakes offer speed and control but can diverge from reality. Real dependencies
improve fidelity but cost setup and diagnosis. Browser tests catch integration
and accessibility failures while being slower. Each is a price somebody decided
to pay for a particular kind of evidence.

Two more arrive with conditions. Snapshot tests are useful for deliberate
serialized structures, not as a substitute for semantic assertions. Test data
builders improve intent if they do not hide required fields.

The failure modes are a separate list, and none of them is a price. Tests
assert private calls, share mutable fixtures, depend on timing, or pass when
the feature is broken. Excessive mocking verifies an imagined collaboration.
Only happy paths are tested. Flaky tests become ignored signals. Coverage
percentages are treated as correctness.

Asserting private calls is where the earlier constraint returns: a test that
names a private call has documented an implementation detail and frozen it.

::activity{id="testing-strategy-ms1"}

## What the next piece of evidence costs, wherever you put it

The decision the opening suite leaves is not whether to test more. It is where
the next piece of evidence goes, and each place bills differently.

A narrow test exercises deterministic behavior through a public interface. That
is what lets it disprove one thing sharply, and why it will never tell you two
components were wired together wrongly.

A broader test buys exactly that, at a stated price. An integration test
against a real database improves fidelity and charges setup and diagnosis. A
browser journey catches integration and accessibility failures and charges time
on every run. Both are for boundary wiring and a small number of critical
journeys.

Production monitoring is the third place and substitutes for neither. It covers
conditions pre-release tests cannot reproduce fully, and reports after a
release rather than before one. The example's cancellation metrics are already
that.

The opening team bought none of the three. They bought a number and read it as
correctness.

## Sources

- W3C, [WCAG 2.2 Conformance](https://www.w3.org/TR/WCAG22/#conformance) (accessed 2026-07-18) — accessibility conformance applying to complete processes and full pages
