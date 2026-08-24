---
id: anatomy-of-a-web-app
title: "Anatomy of a Web App"
summary: Why a purchase can succeed in one place and be missing everywhere else, and how a whole-system map turns that into a question with an owner.
objectives:
  - Read a web app as a distributed system whose visible page is only its edge
  - Name what each part of the arrangement is responsible for, and what the arrows between them are
  - Turn a failed action into a question about which boundary did not preserve what
estimatedMinutes: 12
difficulty: beginner
tags: [start-here]
---

## The order that succeeded in one place

A customer submits a purchase and the response says it worked. Support hears
otherwise the next morning: the card was charged, and there is no order to ship.

Nobody disputes the response: it arrived, and it described one process's
handling of one message. What it did not describe is the rest of what the
purchase depended on — whether the order was written down durably, whether the
charge happened exactly once, and what the screen told the customer next. For
`POST /orders`, the HTTP success response is not the whole outcome.

## The page is the edge of a distributed system

A web app is a distributed system with a human-facing browser interface. A
typical interaction crosses presentation code, network infrastructure,
server-side application logic, and one or more data systems, and the visible
page is only the edge of that arrangement.

Reading it that way buys two things. Every later concept — a cache, a queue, a
migration, a deploy — arrives with somewhere to live. And debugging becomes
more disciplined: when an action fails, the question is which boundary did not
preserve the intended request, identity, data, or response. That question has
an owner attached; “the app is broken” does not.

::activity{id="anatomy-of-a-web-app-mc1"}

## What each part is responsible for

Take them in the order a request meets them. The browser presents documents and
controls, runs frontend code, and sends protocol messages. Edge
infrastructure terminates secure connections and routes traffic. Backend code
validates requests and coordinates business behaviour. Data services preserve
facts. Alongside all of them, delivery and observability systems keep the whole
arrangement operable.

```text
User
   |   submits the purchase
   v
Browser and frontend
   |   HTTPS request
   v
DNS, CDN, load balancer
   |   routed request
   v
Backend application
   |
   +--> Database
   +--> Cache or search
   +--> Queue and workers
=== turn: the response retraces the hops ===
Backend application
   |   HTTPS response
   v
Browser and frontend
   |   updated screen
   v
User
```

Read straight down: out to the data systems, then back to the person who started
it. Each arrow is a contract and a possible failure boundary — the half of the
map the boxes hide. The boxes are not fixed roles either: a component may play
several at once, and a backend is a server to the browser and a client to a
database or a payment API.

::activity{id="anatomy-of-a-web-app-mat1"}

## One purchase, from hostname to screen

One purchase might proceed like this. The browser resolves a hostname,
establishes a TLS-protected connection, sends an HTTP request with session
credentials, and waits. The backend authenticates the caller, authorizes the
action, validates input, executes a transaction, publishes follow-up work, and
returns a representation. The frontend reconciles that response with local state
and updates accessible browser content.

The order is not decorative: authentication precedes authorization, which
precedes validation, which precedes the transaction. And the exchange is not
finished when the response arrives: publishing follow-up work lands in a system
the response need not mention, and the frontend still has to reconcile what
came back with what the screen said. That exchange runs on HTTP, which supplies
the uniform semantics shared across its versions.

::activity{id="anatomy-of-a-web-app-ord1"}

## The failures sit on the arrows

Common failures include stale frontend state, lost identity, timeouts, duplicate
submissions, partial writes, overloaded dependencies, expired certificates,
unsafe input, and deployments that change one side of a contract before the
other.

As a list it is intimidating. Read against the map, entries turn into named
boundaries: stale frontend state is local state never reconciled with what the
response said; a deployment that changes one side of a contract first is an
arrow whose two ends stopped agreeing.

Retries earn their own line, because the repair is also a failure mode: a retry
can repair transient failure, or amplify overload and duplicate effects.

::activity{id="anatomy-of-a-web-app-mc2"}

## Every boundary you add is bought

Important choices concern boundaries: server-rendered or client-rendered UI, a
synchronous request or a background job, a relational database or another model,
one deployable unit or several services, a managed platform or self-operated
infrastructure.

The terms are the same every time. An added boundary enables independent change
or scale, and it adds latency, failure modes, security policy, and operational
work. Both halves arrive together.

Which reframes an argument teams keep having: “Should this be its own service?”
asks whether the change or scale you gain is worth those four costs.

::activity{id="anatomy-of-a-web-app-ms1"}

## What the successful order actually settled

Back to the customer who was charged and has no order.

The response was true about what it described. Everything else the purchase
needed sat elsewhere on the map. Correctness for `POST /orders` may require a
durable order, exactly one charge effect, inventory policy, a traceable audit
record, and a UI state that distinguishes “pending” from “failed” — obligations
sitting in data services, at a payment boundary, and in the frontend.

So the verdict is not that the response lied. A web app is the coordinated
behaviour of the whole arrangement, not any single process, and one process's
reply could not settle a question about all of it. Which is why this map comes
first: the rest of the library enlarges it, one region at a time.

## Sources

- IETF, [RFC 9110: HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html) (accessed 2026-07-18) — HTTP defines the uniform semantics shared across its versions
