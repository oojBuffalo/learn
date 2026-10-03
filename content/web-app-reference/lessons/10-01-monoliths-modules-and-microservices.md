---
id: monoliths-modules-and-microservices
title: "Monoliths, Modules, and Microservices"
summary: Why cutting a tangled codebase into separately deployed services can do everything it was asked to do and leave the original problem exactly where it was, and which of two decisions was actually on the table.
objectives:
  - Hold modularity and distribution apart as two decisions that can be taken one at a time
  - Apply the five conditions that justify paying the network and operational cost of a process boundary
  - Place each named failure mode on the side of the choice it belongs to — after a split, or inside one unit
estimatedMinutes: 12
difficulty: advanced
prerequisites: [monitoring-and-incident-response]
tags: [architecture]
---

## The split that was asked to fix ownership

A catalog codebase has grown until any part of it reaches any table and any
function. A change in one place breaks another, and nobody can say who owns
what. The team proposes to cut it into independently deployed services and
expects ownership to become clear.

The distinction this lesson draws exists to stop that move: it prevents teams
from using services to compensate for unclear code ownership. Nothing says the
split will fail — only that it is the second of two decisions, and the first
has not been made.

## One word separates the second definition from the third

A monolith deploys much of an application as one unit. Modules create internal
boundaries within a unit. Microservices create independently deployable network
boundaries around capabilities.

Put the second and third side by side. Both create boundaries. One is inside a
unit, the other across a network, and that difference is the whole lesson:
modularity and distribution are separate decisions. Boundaries without
distribution is the modular monolith. Distribution without boundaries is the
expensive trade — the network bought and the tangle kept.

The rule names a starting point and a condition for leaving it. Start with
cohesive capabilities and explicit dependencies. Choose a process boundary only
when independent deployment, scaling, isolation, technology, or ownership
justifies network and operational cost.

::activity{id="monoliths-modules-and-microservices-mc1"}

## What one process enforces, and what a network makes essential

A modular monolith enforces dependency directions in one process and can use
local transactions — a direction enforced without a network, and a transaction
that lasts as long as the shared process.

Services communicate through APIs or events and own deployment and usually data
behavior. As distribution grows, gateways, discovery, telemetry, automation,
and resilience become essential — five pieces of platform work one unit never
needed, and essential is not the same word as useful.

Under all of it sits one list of eight: deployment boundaries shape
transactions, latency, failure, data ownership, testing, release coordination,
team autonomy, and observability.

::activity{id="monoliths-modules-and-microservices-ms1"}

## Catalog, orders, payments, identity, and the one that leaves

A commerce app begins as modules for catalog, orders, payments, and identity
with enforced dependencies. Payments later becomes a service because
compliance, scaling, and release ownership differ. Orders call a stable payment
contract and represent pending outcomes explicitly.

Read it as two steps rather than one destination: four capabilities get
boundaries inside one unit, and only afterward does one of them cross.

Three reasons are given, and they do not all land the same way. Scaling is on
the list of five conditions verbatim. Release ownership is
ownership, also on the list. Compliance is on no part of that list, and this
lesson will not stretch a listed word to cover it.

The last sentence is the bill: a contract replaces a function call, and orders
must represent pending outcomes explicitly, because the transaction that used
to settle the question is across a network.

## Where the tangle survives the cut

A distributed monolith has many services that must deploy together. Shared
databases undermine ownership. Tiny services create chatty calls and unclear
responsibilities. A monolith becomes unchangeable when modules can reach every
table and function. Team boundaries are copied mechanically into runtime
boundaries.

Four go wrong after a split: services that must deploy together, services
sharing a database, services too small to have clear responsibilities, and
runtime boundaries copied from team boundaries. The fifth goes wrong inside one
unit — the opening scene almost word for word.

::activity{id="monoliths-modules-and-microservices-mat1"}

## The premium, and what it is charged for

Monoliths simplify local development, consistency, and operations but can
suffer broad releases and hidden coupling. Microservices enable independent
lifecycle and scale while adding partial failure, compatibility, duplicated
platform work, and cross-service consistency. Fowler argues that microservices
carry a premium and are unsuitable for many simpler systems.

The trade is not benefit against benefit. Consistency and operational
simplicity go out, independent lifecycle and scale come in, and four
obligations arrive. Two exist because the network exists: partial failure, and
compatibility between versions that no longer ship together. Two exist because
there is more than one of everything now: platform work repeated per service,
and consistency no single transaction covers.

## The process boundary you are deciding to buy

The question in front of the catalog team is not whether services are good, but
which of the two decisions they are taking.

The first carries no network cost: cohesive capabilities, explicit
dependencies, directions enforced in one process. It answers what they actually
complained about.

The second has a price and a condition. The price is network and operational
cost, plus the premium and the four obligations. The condition is that
independent deployment, scaling, isolation, technology, or ownership justifies
the boundary — and unclear ownership of code inside one unit is not one of the
five, however often the word turns up on both sides.

Take the second decision first and one of the named failures already describes
the result: many services that must deploy together. The boundaries were never
drawn, so the network went around the tangle instead.

## Sources

- Martin Fowler, [Monolith First](https://martinfowler.com/bliki/MonolithFirst.html) (2015; accessed 2026-07-18) — microservices carrying a premium and being unsuitable for many simpler systems
