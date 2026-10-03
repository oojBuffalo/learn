---
id: authentication-and-authorization
title: "Authentication and Authorization"
summary: Why an internal tool can behave perfectly right up until somebody sends the request another way, and how long an authorization decision is allowed to stand before something asks again.
objectives:
  - Keep establishing an identity and deciding an action apart as two separate decisions
  - Place authorization at the point of effect, where only server-side enforcement counts
  - Weigh central against local policy, roles against relationships, and long sessions against short ones
estimatedMinutes: 12
difficulty: intermediate
prerequisites: [anatomy-of-a-web-app, api-design]
tags: [security]
---

## The button that was only hidden

An internal tool has an action most staff should not have. The interface knows
that: for those accounts the control is not rendered, and the screen looks
exactly as intended.

The request behind the control is a different story. It arrives with a valid
session, the handler reads the record ID out of the request, and it answers.
Nobody lied and nobody skipped a step — there was never a step. Checking
permission only when rendering buttons is one of this lesson's named causes of
broken access control, and the tell is that the product behaves correctly right
up until somebody sends the request another way.

## Two decisions, and the one a login does not make

Authentication establishes confidence in an identity. Authorization decides
whether a principal may perform an action on a resource in the current context.
A valid login never implies universal permission.

Keeping the two separate is what prevents role checks from becoming identity
checks, and what ensures permission is evaluated at the point of effect. The
opening tool had one decision and needed two.

```text
credential -> authenticated principal

principal + action + resource + context
   + policy -> allow or deny
```

Read it downward. The first line ends at a principal and stops; nothing about
authority has been decided yet. The second line takes that principal and adds
four more inputs before anything is allowed or denied. Deny by default, and
give each credential only the authority it needs.

## Only the server side is authoritative

Authentication begins at login or workload credential issuance. Authorization
occurs throughout frontend affordances, APIs, domain operations, data access,
jobs, and administration — six places, and only server-side enforcement is
authoritative. A frontend affordance is on that list because affordances are
where authorization gets expressed to a person, not because hiding one enforces
anything.

The mechanisms fall on either side of the same line. On the identity side,
passwords require salted, adaptive hashing and rate-limited verification,
multi-factor methods add independent evidence, and sessions bind authenticated
state to a browser credential while supporting rotation and revocation. On the
permission side, authorization models include roles, attributes, relationships,
ownership, and explicit policy, and reauthorization protects sensitive actions
after risk changes.

::activity{id="authentication-and-authorization-mc1"}

## Invoice 42, and the four things the handler does

An authenticated employee requests invoice `42`. The handler loads the
invoice's tenant and classification, verifies the employee's current membership
and `invoice.read` permission, records the decision context, and returns only
permitted fields.

Four acts, and each supplies something the login did not. Loading the tenant
and classification supplies the resource half of the decision — the ID alone
says which row, not which context it sits in. Verifying current membership and
`invoice.read` is the decision itself, made where the effect happens rather
than where a screen is drawn. Recording the decision context leaves something
to read afterward. Returning only permitted fields keeps the response inside
what was actually allowed.

Then the sentence that answers the opening scene. A guessed ID from another
tenant receives no data, because the ID was never what granted anything.

## Central or local, roles or relationships

Central identity providers reduce duplicated login logic but become critical
dependencies. That is the shape of every choice here: the thing that makes a
decision consistent is also the thing that has to keep working.

Role-based policy is understandable until role combinations explode. Attribute
or relationship rules express context more precisely but require consistent
data and explainability — precision bought with two standing obligations rather
than none.

Long sessions improve convenience; short lifetimes and step-up checks reduce
exposure. That last pair looks like a preference and is really a schedule: it
decides how often the system stops to ask a question it has already answered
once.

::activity{id="authentication-and-authorization-mat1"}

## How long a yes stays a yes

The decision left on the table is not whether to authorize. It is how long an
authorization decision may stand before something asks again.

Broken access control remains a leading web risk in OWASP Top 10:2025, and the
common causes are worth reading in one breath. Trusting object IDs. Checking
permission only when rendering buttons. Stale authorization in long-lived
tokens. User enumeration. Weak recovery flows. Sessions that survive password
reset unexpectedly.

Two of those six are about time. Stale authorization in long-lived tokens is a
decision still being honored after the facts behind it moved. A session that
survives a password reset is a decision that outlived the credential it was
made about.

So the cost is real on both sides. A long session buys convenience and pays for
it in the window between checks — and stale authorization inside that window is
not a bug that appeared, it is a correct decision that stopped being current. A
short lifetime with step-up checks buys a smaller window and pays in
interruption.

There is also an option that is not a lifetime at all. Reauthorization protects
sensitive actions after risk changes — not a shorter yes for everything, but a
second question asked where the effect is worth asking about.

::activity{id="authentication-and-authorization-ms1"}

## Sources

- OWASP, [Top 10:2025](https://owasp.org/Top10/2025/0x00_2025-Introduction/) (accessed 2026-07-18) — broken access control remaining a leading web risk
