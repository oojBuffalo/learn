---
id: identity-across-system-boundaries
title: "Identity Across System Boundaries"
summary: Why an audit log can name something that certainly did the work and nobody who wanted it done, and what a receiver still owes even after a signature verifies.
objectives:
  - Track the end actor, the calling workload and the authority being exercised as three separate subjects
  - Read each identity mechanism for what it establishes and what it leaves open
  - Order the checks at a boundary by what each one costs to run
estimatedMinutes: 12
difficulty: intermediate
prerequisites: [backend-request-lifecycle, transactions-and-consistency]
tags: [apis-and-integration]
---

## The audit that could only name a service

An auditor asks who exported a customer report. The log has an answer: the name
of a service account. Every background job and every export in the system runs
under that account, so the answer is both true and useless. It names something
that certainly did it and nobody who wanted it done.

Shared service accounts make audits ambiguous, and explicit identity design is
what prevents audit records that lose the original actor. Nothing failed to write
here. The record wrote down the wrong subject.

## Three subjects, and no substituting one for another

Identity propagation communicates who or what initiated work across a boundary.
Each receiver must establish trust in the credential, constrain its audience and
lifetime, and make its own authorization decision. Those three obligations stay
with the receiver; whoever called does not discharge them.

Track three subjects: the end actor, the calling workload, and the authority
being exercised. A service may authenticate another service while acting on
behalf of a user with narrower delegated permission — the case the opening log
collapsed, because it had somewhere to put the workload and nowhere to put the
other two.

Human identity, workload identity, and delegated authority are related but not
interchangeable. Identity crosses browser-to-backend, service-to-service, worker,
webhook, and administrator boundaries, and designing it explicitly prevents
confused-deputy problems, ambient privilege, credential replay, and the audit
failure already on display.

## What each credential establishes

Session credentials associate a browser with server state. Signed access tokens
can carry issuer, subject, audience, expiry, and scopes. Mutual TLS or platform
workload identity authenticates service instances. Token exchange can replace a
broad credential with one intended for a downstream audience.

One more mechanism is deliberately not a credential. Trace and audit context
carries actor and delegation metadata separately from security credentials. The opening
scene needed exactly that — a record of an actor, kept apart from the thing that
authorizes.

::activity{id="identity-across-system-boundaries-mat1"}

## A report request, narrowed to five minutes

A reporting API receives a user session, authorizes report access, and exchanges
it for a five-minute token valid only for the document service. The document
service records both the reporting workload and delegated user, then applies its
own resource permission.

The exchange is worth slowing down on. Token exchange can replace a
broad credential with one intended for a downstream audience, and this one
narrows the credential twice over: five minutes is the lifetime, and “valid only
for the document service” is the audience.

What the document service does next is two separate acts. It records both
subjects, so the audit keeps the workload and the delegated user rather than one
standing in for the other. Then it applies its own resource permission, because
each receiver makes its own authorization decision and the reporting API's yes
was a yes about reports.

::activity{id="identity-across-system-boundaries-mc1"}

## Forward it, or issue a new one; decide centrally, or locally

Propagating the original user token is simple but broadens its exposure and
audience. Service credentials clearly identify the caller but can erase user
context. Those two fail in opposite directions — the first carries too much
across the boundary, the second too little.

Short-lived, audience-specific tokens limit replay at the cost of issuance
infrastructure. That is the third option, and the cost is real: something has to
mint them, whenever a call is made.

Central authorization ensures consistency; local checks improve availability and
domain context. This one is not about the credential at all, but about where the
decision lives once it arrives.

::activity{id="identity-across-system-boundaries-ms1"}

## The cheapest thing to check when identity crosses a boundary

This lesson orders these by what the check costs to run, not by how bad the
failure would be.

Start at the receiver, because the answer is in code you already own. Receivers
validate signatures but not issuer or audience. A verified signature is not the
same check as reading the issuer and audience the token carries, and a receiver
that stops at the signature has skipped two fields already in its hands.

Next, ask where identity arrives from. A service trusts caller-supplied identity
headers from outside the trusted proxy — one question about where a caller sits
relative to that proxy, and the whole answer turns on it.

Then look for credentials that outlived the request that created them. Background
jobs retain expired user credentials, and a queued job is rarely where anyone
thinks to look for one.

Then read the logs, which costs only attention. Logging full tokens creates a
secondary credential store — somewhere credentials live that nobody decided to
build.

The opening audit sits at the far end of that order. Nothing there is checkable
in an afternoon: a shared account is not a bug in a check, it is a subject that
was never tracked. Which is why the four cheap questions come first, and why the
expensive answer is about which of the three subjects a record can actually name.

## Sources

- IETF, [RFC 9700: Best Current Practice for OAuth 2.0 Security](https://www.rfc-editor.org/rfc/rfc9700.html) (accessed 2026-07-18) — signed access tokens carrying issuer, subject, audience, expiry, and scopes
