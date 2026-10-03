---
id: backend-technologies
title: "Backend Technologies"
summary: Why a stack chosen because its handler won a benchmark can leave the page that mattered exactly as slow as it was, and which of two adjacent concurrency failures an idle processor rules out.
objectives:
  - Evaluate the runtime before the framework, using the five questions this lesson puts to it
  - Tell work that will not yield because it is computing from work that will not yield because it is waiting
  - Place runtime performance behind the four things this lesson says must clear first
estimatedMinutes: 12
difficulty: advanced
prerequisites: [evolving-an-architecture]
tags: [technology-landscape]
---

## The handler that got faster and the page that did not

A team compares two backend stacks by timing a small handler that returns a
fixed response. One is clearly faster, so they build on it. In production the
page that mattered is no quicker: its time goes to a database query, a network
call, and a latency tail the benchmark never sampled.

Nothing was measured wrong. It was measured where the work does not happen.
This lesson names the move — teams benchmark toy handlers and ignore database,
network, and tail latency. The benchmark established that one runtime returns a
constant faster than the other.

## The differences that turn out to be consequential

Backend technologies combine language runtimes, web servers, frameworks,
libraries, job processors, and integration clients. Their consequential
differences are concurrency, type model, ecosystem, deployment, observability,
and team fluency.

Read that list for what is missing. Syntax is not on it. This survey frames
technology choice around workload and ownership rather than syntax preference
alone.

Backend stacks implement standardized HTTP request-response semantics and event
adapters, application behavior, data access, workers, and operational hooks.
Whichever stack wins, that list still has to be built.

## Runtime first, then framework

Evaluate runtime first, framework second: how work is scheduled, how blocking
behaves, how dependencies are managed, how processes start and stop, and how
production failures are diagnosed.

Node.js centers event-driven JavaScript and its package ecosystem. JVM stacks
such as Spring combine a managed runtime with an integrated application
framework. .NET provides a managed runtime and integrated web platform. Go
supplies compiled binaries and language-level concurrency primitives. Rust
emphasizes memory safety without garbage collection. Python frameworks span
synchronous and asynchronous styles, and Ruby on Rails emphasizes convention
and integrated application development.

Those five questions have a negative space, and the failures this lesson names
sit mostly inside it. CPU work blocks an event loop. Blocking libraries exhaust
async worker pools. Framework globals leak request state. Dependency ecosystems
introduce unreviewed supply-chain risk.

The first two are not one failure. One is work that will not yield because it
is computing; the other because it is waiting. Under load, what separates them
is whether anything is busy.

::activity{id="backend-technologies-mc1"}

## A transactional product and a high-concurrency gateway

A small experienced team may use a conventional integrated framework for a
transactional product. A high-concurrency gateway may favor a runtime with
cheap tasks and explicit deadlines. Both still require authorization, bounded
dependencies, transactions, telemetry, and safe delivery.

Different questions choose the two halves. The first names the team before it
names the product, and an integrated framework is a bet on what that team
already knows. The second names the workload: cheap tasks with explicit
deadlines answer how work is scheduled.

The last sentence is the part that does not move: five obligations survive
either choice, and no stack discharges them by winning.

::activity{id="backend-technologies-sa1"}

## What an integrated framework accelerates and what it hides

Integrated frameworks accelerate common CRUD, validation, and security
conventions but can obscure cost and lifecycle. Minimal frameworks expose
decisions while requiring teams to assemble policy. Static types improve
tooling and compatibility evidence but do not guarantee domain correctness.

The first two are one trade read from either end. What an integrated framework
does for you it also does out of sight; what a minimal framework makes you do
it also lets you see.

The third is narrower than it looks: a type system can show that a caller and a
callee agree, not that the rule they agree on is the one the business meant.

Then the ordering. Runtime performance matters after development throughput,
library quality, hiring, and operational familiarity meet requirements. Not
instead of those, after them.

::activity{id="backend-technologies-ms1"}

## What each of these backend symptoms rules out

Read the failures as evidence and each narrows where to look.

Throughput collapses while the processors sit idle. That rules out work that is
computing, and the event loop with it, because a blocked loop is a busy one.
What is left is work that is waiting.

One request occasionally answers with another request's data. That rules out
capacity, and points at state held somewhere that outlives a request.

Then the opening scene. The handler got faster and the page did not, which
rules out the handler as the constraint. Database, network, and tail latency
were never in the measurement, so the choice may still turn out right, and
nothing will have decided it.

## Sources

- IETF, [RFC 9110: HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html) (accessed 2026-07-18) — standardized HTTP request-response semantics that backend stacks implement
- Node.js, [The Event Loop](https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick) (accessed 2026-07-18) — event-driven JavaScript and its package ecosystem
- Spring, [Spring Boot](https://spring.io/projects/spring-boot) (accessed 2026-07-18) — a managed runtime combined with an integrated application framework
- Microsoft, [ASP.NET Core documentation](https://learn.microsoft.com/en-us/aspnet/core/) (accessed 2026-07-18) — a managed runtime and integrated web platform
- The Go Project, [Documentation](https://go.dev/doc/) (accessed 2026-07-18) — compiled binaries and language-level concurrency primitives
- The Rust Project, [The Rust Programming Language](https://doc.rust-lang.org/book/) (accessed 2026-07-18) — memory safety without garbage collection
- Python, [asyncio](https://docs.python.org/3/library/asyncio.html) (accessed 2026-07-18) — frameworks spanning synchronous and asynchronous styles
- Ruby on Rails, [Guides](https://guides.rubyonrails.org/) (accessed 2026-07-18) — convention and integrated application development
