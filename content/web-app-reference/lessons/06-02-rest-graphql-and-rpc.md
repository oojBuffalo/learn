---
id: rest-graphql-and-rpc
title: "REST, GraphQL, and RPC"
summary: Why an hour-long argument about which style a company “is” cannot be settled, and what changes once you notice the question belongs to a boundary rather than to an organization.
objectives:
  - Separate an interface style from a serialization format
  - Read each style by what it puts in the contract and what it invites you to get wrong
  - Choose a style per boundary and account for what each additional boundary costs
estimatedMinutes: 12
difficulty: intermediate
prerequisites: [backend-request-lifecycle, transactions-and-consistency]
tags: [apis-and-integration]
---

## The design review that argued about the wrong noun

A design review has spent an hour on whether the company “is REST” or “is
GraphQL.” Nobody has said which boundary they mean. The same service already
talks to a public audience, to its own rendering layer, and to a
latency-sensitive neighboring service, and those three have almost nothing in
common except the team that owns them.

Somebody eventually asks whether JSON counts as a fourth option, and the room
splits again. Two confusions are loose here, and neither is about which style is
better.

## Three centers of gravity, not three formats

REST, GraphQL, and RPC are interface styles with different centers of gravity:
standardized resource transfer, client-selected graph queries, and explicit
remote operations. None removes distributed-system failure. Whichever you pick,
the network is still there.

Comparing styles by contracts and workloads is more useful than treating them as
competing serialization formats — which settles the fourth-option question.
JSON is a language-independent text interchange format, not an API style. Put it
in the same list as the other three and the list stops meaning anything.

The choice is worth arguing about, though, because the style shapes client
composition, caching, observability, authorization, schema evolution, and how
transport semantics map to application behavior. Six things, and not one of them
is the serialization format.

| Style | Interface center | Typical strength |
| --- | --- | --- |
| REST-oriented HTTP | resources and representations | web semantics and intermediaries |
| GraphQL | typed graph and selection set | frontend-shaped composition |
| RPC | procedures and messages | explicit service operations |

## What each style writes down

REST-oriented APIs use HTTP methods, targets, status codes, fields, and cache
semantics around resources. GraphQL exposes a schema whose resolvers assemble a
caller-selected result, so the shape of an answer is selected by the caller
rather than fixed in advance. RPC defines procedures and
typed request and response messages, often with generated clients.

::activity{id="rest-graphql-and-rpc-mat1"}

## One content service, three boundaries

A public content service exposes cacheable article resources over HTTP. Its
internal rendering gateway uses GraphQL to compose page-specific fields. A
latency-sensitive service-to-service boundary uses typed RPC.

Take them in that order. The public boundary faces intermediaries it does not
own, and REST-oriented HTTP gains from standard HTTP behavior, cache semantics
included — the article is a resource, and resources are what that style is
centered on. The rendering gateway serves one page at a time, and GraphQL
reduces client over-fetching and under-fetching, which is the whole problem a
page-composition layer has. The neighboring service wants a named operation to
finish quickly, and RPC offers strong operation names and efficient schemas.

One more sentence completes the example, and it is the one teams skip: each
boundary has separate timeouts, identity, compatibility, and telemetry. Three
styles bought three good fits, and the same sentence hands back the bill.

::activity{id="rest-graphql-and-rpc-ms1"}

## What each style is good at, and what it lets you do wrong

REST gains from standard HTTP behavior but can require multiple resources for
one screen. Its named failure mode sits right beside that: endpoints become verb
tunnels with inconsistent status behavior. This lesson reads the two as
connected — the tunnel is what gets built once the screen wins the argument.

GraphQL reduces over-fetching and under-fetching but requires query-cost
controls, resolver batching, and field-level policy. Separately, this lesson
names two GraphQL failures: N+1 dependency calls, and unbounded nested queries.
Two of the three requirements read as answers to those two — resolver batching
to the first, query-cost controls to the second — and that reading is this
lesson's, not the source's. Field-level policy answers neither, and is required
anyway.

RPC offers strong operation names and efficient schemas but can make network
calls look deceptively local, and clients retry non-idempotent procedures
automatically. Read those two together: deceptive locality is what makes an
automatic retry look harmless. Generated types can create false confidence here
too: the types line up while semantic compatibility still changes.

::activity{id="rest-graphql-and-rpc-mc1"}

## The style decision, and the four things each boundary repeats

Teams may use more than one style at distinct boundaries. That single sentence
dissolves the design review, and it replaces one comfortable decision with
several uncomfortable ones.

The comfortable version picks a style once and applies it everywhere. It is
cheap to decide, and it leaves at least one boundary served by
a style centered somewhere other than where that boundary lives — a public
audience under a style built for typed internal calls, say, or a
latency-sensitive neighbor paying for intermediaries nobody asked for.

The honest version chooses per boundary, and the price is itemized in the
example: each boundary has separate timeouts, identity, compatibility, and
telemetry. Not one set of four, but one set per boundary. Another boundary is
therefore never only another endpoint; it is another compatibility contract to
maintain and another stream of telemetry somebody has to read.

That is the decision now on the table. Not which style the company is, but how
many boundaries it is willing to operate deliberately — and whether the fit each
style buys is worth another set of four.

## Sources

- IETF, [RFC 8259: The JSON Data Interchange Format](https://www.rfc-editor.org/rfc/rfc8259.html) (accessed 2026-07-18) — JSON is an interchange format rather than an API style
