---
id: contract-and-end-to-end-testing
title: "Contract and End-to-End Testing"
summary: Why a release can satisfy every schema check on both sides and still break the component downstream, and what each late, slow symptom rules out about where the evidence should have come from.
objectives:
  - Separate what one component promises from the subset another actually relies upon
  - Place schema checks, provider tests, published expectations and journeys against the confidence each buys
  - Read a late or unreproducible failure as an elimination rather than a mystery
estimatedMinutes: 12
difficulty: intermediate
prerequisites: [scaling-and-resilience, third-party-integrations]
tags: [quality-and-observability]
---

## The field that kept its type and changed its meaning

A provider ships a change. Every field has the same name, the same type, and
the same presence as before, so the schema checks on both sides pass. The
consumer is wrong about something the next day.

Nothing structural moved. Schema compatibility hides changed semantics — the
first failure mode named here, and the evidence that would have caught it was
never going to be a shape. A shape is what the two sides had agreed to compare.

## A promise, the part of it you use, and a user goal

Contract tests verify what one component promises another. End-to-end tests
verify selected outcomes across the assembled system. They solve different
confidence problems and should not duplicate every lower-level case — a rule
aimed at the second kind, whose cases are chosen rather than inherited from the
layers below.

Three roles carry that split. A provider contract states supported inputs and
observable outputs. A consumer assumption states the subset actually relied
upon. End-to-end evidence asks whether a real user goal survives the integrated
path.

The first two describe a boundary and the third describes a path. Together
these tests catch boundary drift and wiring failures while preserving
independent implementation and fast local feedback.

Contracts exist at HTTP APIs, whose method and status semantics are
standardized, as well as event schemas, database adapters, browser-server
interactions, and third-party integrations. End-to-end tests traverse several
such contracts at once.

## Five checks, and what each one is aimed at

Schema checks catch structural incompatibility. Provider tests execute examples
against the real boundary. Consumer-driven contracts publish expectations for
provider verification. Compatibility matrices cover versions that coexist
during rollout. End-to-end suites create isolated data, act through public
interfaces, and assert user-visible outcomes.

::activity{id="contract-and-end-to-end-testing-mc1"}

## One profile change, from published expectation to deployed journey

A profile consumer publishes that `displayName` remains a string and missing
avatars are permitted. The provider verifies this on every change. One deployed
journey signs in, updates the name, reloads the page, and confirms both visible
text and accessible status.

Read the first sentence as a consumer assumption rather than as the contract.
It is the subset actually relied upon: one type that must hold, and one case
that must stay permitted. Publishing it for the provider to verify is what
makes it a consumer-driven contract, and verifying on every change is a
provider test executing examples against the real boundary.

The journey is the other half, and two of the three end-to-end requirements are
visible in it. Signing in, updating, and reloading are acts through public
interfaces. Visible text and accessible status are user-visible outcomes. The
third requirement, isolated data, is not shown here at all; the example makes
no claim either way about it.

## Who owns the contract, and what a real third party costs

Provider-owned contracts centralize truth; consumer-driven contracts reveal
actual dependencies but require governance. One arrangement puts the statement
in a single place. The other finds out what is really being relied upon, and
asks for governance in exchange.

Testing real third parties improves fidelity while adding rate, cost, and
instability, so most cases use recorded or simulated boundaries plus a small
live probe. This lesson reads the probe as the part that keeps the recording
honest, and the recorded boundary as the part that keeps the suite runnable.

End-to-end tests justify their expense for critical flows and boundary
combinations. That is a decision about which flows are worth the expense,
not a technique for making them cheaper.

::activity{id="contract-and-end-to-end-testing-mc2"}

## What each of these symptoms rules out

Take each of them as an elimination rather than a diagnosis.

**A change that passes every schema check and breaks a consumer** rules out
structure. Schema checks catch structural incompatibility, so the shape is the
one thing already compared. Schema compatibility hides changed semantics.

**A failing test nobody can reproduce as a user** rules out the run as evidence
about users. Tests call internal setup endpoints unavailable to users, and a
path no user can walk is not a path the suite can speak for.

**A failure that appears only when two runs overlap** rules out the code under
test. Shared environments leak state between runs, and the second run is
reading what the first left behind.

**A consumer that is correct in test and wrong on replay** rules out the ideal
order as a description of production. Event consumers are tested against that
order, but production reorders or duplicates messages.

**A regression caught late and diagnosed slowly** rules out the lower layers,
because there are none. A large browser suite becomes the only regression layer
and diagnoses slowly.

The opening change belongs to the first line, and the list above says where to
look next. This lesson reads a provider test as a different kind of comparison
from a schema check: one runs examples against the real boundary, the other
compares shapes. The schema check will keep passing on that change for as long
as the shape holds.

::activity{id="contract-and-end-to-end-testing-ms1"}

## Sources

- IETF, [RFC 9110: HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html) (accessed 2026-07-18) — HTTP method and status semantics being standardized
