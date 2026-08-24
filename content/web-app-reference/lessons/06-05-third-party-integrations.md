---
id: third-party-integrations
title: "Third-Party Integrations"
summary: Why a payment call that never came back leaves a question with no subject, and what has to exist locally before an unknown outcome can be anything other than an incident.
objectives:
  - Read an integration as a workflow placed behind somebody else's operating decisions
  - Use an adapter and local state to keep provider behavior from leaking into the domain
  - Weigh immediate feedback against a pending state the whole product has to explain
estimatedMinutes: 12
difficulty: intermediate
prerequisites: [backend-request-lifecycle, transactions-and-consistency]
tags: [apis-and-integration]
---

## The charge that may or may not have happened

A checkout call to the payment provider does not come back. The deadline passes,
the adapter gives up, and a question arrives that nobody in the room can answer:
was the customer charged?

Timeouts leave unknown outcomes. That is not a gap in the logging, and nothing on
this side closes it. The call crossed an organizational boundary, and the answer
stayed on the other side of it.

## Somebody else's schedule, inside your workflow

A third-party integration places part of an application workflow behind an
independently operated contract. The provider has its own availability, limits,
security posture, release schedule, and data lifecycle — five things the
application now depends on and sets none of.

Integration design contains that external uncertainty so provider behavior does
not leak throughout the domain or take down unrelated features. Containment is
the whole job, and it has two halves. Wrap the provider with an adapter that
translates stable application intent into provider calls and provider results
into application outcomes. Then persist enough local state to reconcile after
timeouts or delayed callbacks.

The second half is what the opening scene lacks.

External APIs, webhooks, hosted widgets, identity providers, payment processors,
and analytics scripts all cross organizational and trust boundaries — the same
containment problem in six shapes.

::activity{id="third-party-integrations-mc1"}

## What the adapter does on the way out, and on the way back

Outbound calls use scoped credentials, deadlines, rate limits, idempotency, and
structured error mapping. Read the last of those as the adapter's real
translation work: provider results become application outcomes, which is the
difference between a domain that knows what happened and a domain carrying
somebody else's error text around.

Webhooks verify origin or signatures, acknowledge quickly, deduplicate event IDs,
and process asynchronously. Four duties, easy to do one at a time and easy to get
wrong as a set. A handler that verifies the signature, then does all of its work
inline before answering, and never checks whether it has seen the event before,
has satisfied the first duty and dropped the other three.

Two more mechanisms sit outside the call itself. Reconciliation jobs compare
local and provider state. Contract fixtures and sandbox environments detect
drift before production, though sandboxes may differ from production.

::activity{id="third-party-integrations-ms1"}

## One payment attempt, from timeout to reconciliation

A payment adapter creates a local payment attempt and sends its ID as the
provider idempotency key. The UI shows pending after an ambiguous timeout. Signed
webhooks update state idempotently; a scheduled reconciliation queries attempts
still pending after a threshold.

The local attempt exists before the provider is called, so there is something to
reconcile against however the call ends. Reusing its ID as the idempotency key
makes a retry after the ambiguous timeout a question about the same attempt
rather than a second one, which is the answer to provider retries duplicating
work.

Showing pending is a decision, not a placeholder: the system does not know, and
the interface says so rather than guessing.

Then two independent paths close the attempt. Signed webhooks update state
idempotently, for the case where the provider tells you. Scheduled reconciliation
queries attempts still pending after a threshold, for the case where it never
does.

::activity{id="third-party-integrations-sa1"}

## Immediate feedback, or a pending state the product has to explain

Synchronous calls give immediate feedback but couple user latency and
availability to the provider. Asynchronous workflows remain responsive but expose
pending states, and a pending state is not free: every screen and every support
conversation needs an answer for it.

Provider-specific features accelerate delivery while raising switching cost. A
generic abstraction is valuable only around capabilities the application actually
needs, which cuts against the instinct to wrap everything — an abstraction over a
capability nobody uses is switching cost paid in advance and never collected.

One more cost belongs to whatever runs in the user's browser: loading third-party
browser scripts grants powerful access and can harm performance or privacy.

## The verdict on the charge that may or may not have happened

Back to the call that never came back.

Was the adapter wrong to give up? No. Deadlines are one of the things outbound
calls use, and waiting indefinitely couples user latency to the provider.

Was the provider at fault? Unanswerable from here, which is itself the finding. A
timeout does not distinguish a request that never arrived from a response that
never came back.

What the scene is missing is the local payment attempt. Without it, “was the
customer charged” has no subject: no row to mark pending, nothing to send as an
idempotency key, nothing for a webhook to update, and nothing for reconciliation
to query. Persist enough local state to reconcile after timeouts or delayed
callbacks is not a storage tip. It is the sentence that turns an unknown outcome
from an incident into a pending row with two independent ways of resolving itself.

The charge either happened or it did not. The system's job was never to know at
that instant. It was to still be able to find out.

## Sources

- OWASP, [Third Party JavaScript Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Third_Party_Javascript_Management_Cheat_Sheet.html) (accessed 2026-07-18) — third-party browser scripts granting powerful access
