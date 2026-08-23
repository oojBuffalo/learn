---
id: clients-servers-and-resources
title: "Clients, Servers, and Resources"
summary: Why one URL can return three different things without anything being broken, and what does break a client.
objectives:
  - Use client and server as roles in one interaction rather than names for machines
  - Separate a resource from the representation a response happens to carry
  - Tell a change of representation apart from a change that breaks clients
estimatedMinutes: 12
difficulty: beginner
prerequisites: [anatomy-of-a-web-app]
tags: [web-foundations]
---

## The same URL, three different answers

A client team files a bug. `GET /reports/monthly` returned a cached PDF last
week. Yesterday it answered with a redirect to object storage. This morning it
streamed a document that had plainly been generated on the spot. Three different
things from one URL — surely two of them are wrong.

None of them is. The resource remains “the monthly report”. Which representation
it currently has, and how that representation reaches the client, are separate
design decisions, and keeping them separate is most of what the arrangement is
for. What the client team has discovered is not a defect. It is that they were
depending on something the server never promised.

## Client and server are roles in one interaction

Client and server describe roles, not two kinds of machine. A client initiates a
request; a server accepts it and produces a response. The same backend process
is a server to a browser, a client to a payment provider, and perhaps both to
peer services — sometimes inside a single request.

Role-based language keeps designs accurate because the interesting questions
attach to roles rather than to hosts. Which side chose the format? Which side
enforces the policy? “The backend” answers neither question. “The server in this
exchange” answers both.

::activity{id="clients-servers-and-resources-mc1"}

## A resource is not a row

A resource is the conceptual target identified by a URI. A representation is
transferable information about that resource. They are not the same thing, and
the gap between them is where most of the usefulness lives.

So do not equate a resource with a database row or a file. `/accounts/42` can
represent an account assembled from several stores, calculated at request time,
and formatted as HTML or JSON, all without the identifier changing meaning.
HTTP deliberately hides resource implementation behind messages and
representations, which is what lets independently implemented components share a
boundary at all. Inside a message the division is just as clean: the method
communicates the requested action, and the target names what the action
concerns.

::activity{id="clients-servers-and-resources-mc2"}

## Who decides what

Clients select methods, targets, fields and acceptable formats. Servers
interpret those semantics, enforce policy, and choose a status and a
representation. Neither side does the other's job, which is why a client asking
for JSON is stating a preference rather than issuing an instruction.

Four mechanisms sit across that split and let one resource model serve many
clients efficiently: content negotiation, conditional requests, redirects and
caching. The monthly report from the opening leaned on two of them — caching,
then a redirect — and stayed one resource throughout.

One complication follows. Intermediaries can act as a server on one connection
and a client on another, so “the server” may in fact be a chain of proxies and
services with different policy — and calling it one process hides precisely the
hops where the policy differs.

::activity{id="clients-servers-and-resources-sa1"}

## Choosing the shape of your nouns

Resource-oriented designs offer stable nouns and generic HTTP behaviour, while
action-oriented endpoints may express commands more directly. Coarse
representations reduce round trips but can transfer unused data; fine-grained
resources improve reuse but may create chatty clients. Server authority
simplifies invariants, and optimistic client state can improve responsiveness at
the cost of reconciliation.

None of these has a default answer. What they share is a structure: each buys
something at a stated price, and the price is usually paid by somebody who was
not in the room — the client author, or whoever ends up debugging the
reconciliation.

::activity{id="clients-servers-and-resources-mat1"}

## What actually breaks a client

What breaks a client is not a change of representation. It is a change to
something the client was entitled to rely on, or something it was not entitled
to rely on and relied on anyway.

Problems arise when a URL encodes an implementation detail that later changes,
when clients infer undocumented server behaviour, when status codes do not match
outcomes, or when a representation silently omits information needed to
interpret it. Read as eliminations, these are informative. A URL that survives a
storage migration tells you the identifier never named the storage. A client
that breaks when the format changes tells you it inferred something, because
acceptable formats are the client's to declare and it did not declare them.

Which settles the monthly report. Neither the PDF, nor the redirect, nor the
stream broke a promise. The bug report was a client meeting its own assumptions.

::activity{id="clients-servers-and-resources-ms1"}

## Sources

- IETF, [RFC 9110 §3: Terminology and Core Concepts](https://www.rfc-editor.org/rfc/rfc9110.html#name-terminology-and-core-concep) (accessed 2026-07-18) — HTTP hides resource implementation behind messages and representations
