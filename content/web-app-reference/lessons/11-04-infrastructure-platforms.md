---
id: infrastructure-platforms
title: "Infrastructure Platforms"
summary: Why a workload packaged as a container can still be held in place by the identity, network, and data services around it, and which of five questions a container does not answer.
objectives:
  - Put five questions to any platform, ending with the one about leaving
  - Separate the operational responsibilities a platform assumes from the ones that stay with the team
  - Locate the dependencies a portability claim leaves out
estimatedMinutes: 12
difficulty: advanced
prerequisites: [evolving-an-architecture]
tags: [technology-landscape]
---

## The container that was supposed to be portable

A team packages its service as a container so that changing providers will be a
deployment change rather than a rewrite. When the move is finally priced, the
container turns out to be the easy part: it authenticates with the provider's
identity service, reaches its database over the provider's network, and keeps
files in the provider's object storage.

Nothing was misrepresented. This lesson names it exactly: a nominally portable
container depends on provider identity, network, and data services that are not
portable. The artifact moves. What it talks to does not.

## Five questions, and the last one is about leaving

Infrastructure platforms provide compute, networking, storage, identity,
deployment, and observability at different abstraction levels. Categories
include infrastructure clouds, container orchestrators, application platforms,
edge platforms, and integrated backend services.

For each platform, ask: What artifact do we supply? What lifecycle does it
manage? Which limits are fixed? How are identity, networks, data, telemetry,
backup, and support handled? How do we leave?

Between them the five do one job: they clarify which operational
responsibilities a platform assumes and which remain with the application team.
Read that against the failures named here and the shortest one lines up: teams
assume managed means unowned.

A platform hosts every deployed component and becomes part of its availability,
security, cost, portability, and incident model — becoming part of something,
not taking it away.

## What each category takes over

AWS, Azure, and Google Cloud expose broad infrastructure and managed services.
Kubernetes orchestrates containerized workloads through declarative desired
state. Platforms such as Cloud Foundry and Heroku accept higher-level
application artifacts. Edge platforms run code and caches near users.
Backend-as-a-service products bundle identity, data, storage, and functions
behind an application-facing SDK.

Read that list by the first question rather than by name. What differs is the
artifact you hand over: infrastructure, a containerized workload with a desired
state, an application, code that runs near users, or nothing but calls to an
SDK.

::activity{id="infrastructure-platforms-ms1"}

## A small team that documents six things instead of running an orchestrator

A small team chooses a managed container platform, managed PostgreSQL, object
storage, and hosted telemetry. It documents quotas, regional dependencies,
backup restore, identity permissions, cost alerts, and an artifact and data
export path rather than operating an orchestrator prematurely.

Five of the six answer a question from the list. Quotas answer which limits are
fixed. Regional dependencies, identity permissions, and backup restore answer
how networks, identity, and backup are handled. The export path answers how we
leave, written while leaving is still hypothetical.

The sixth answers none of them. Cost alerts are not on the list of questions;
cost is on the list of things the platform became part of. The team was writing
down what it had just made itself responsible for.

::activity{id="infrastructure-platforms-mc1"}

## What a higher abstraction narrows

Higher abstractions reduce undifferentiated operations and narrow
configuration, but impose limits and proprietary integration. Kubernetes
standardizes many workload concepts while requiring significant platform
ownership unless managed well. Multi-cloud can reduce one provider dependency
but commonly increases complexity and prevents using distinctive managed
capabilities.

Narrow is the word to keep. A higher abstraction does not only take away
operations nobody wanted; it takes away configuration somebody might have
wanted, and what is left is the shape the platform allows.

Three more sit among the same named failures. Platform quotas appear only under
peak load. Teams omit data export and restore plans, or grant broad platform
roles for convenience.

::activity{id="infrastructure-platforms-sa1"}

## The abstraction level you are choosing, and what it fixes in place

The decision is not which provider. It is how far up the abstraction levels to
go, and every step charges the same two things: limits you did not set, and
proprietary integration you did not write.

Going higher buys fewer undifferentiated operations. It costs configuration you
can no longer reach and quotas you will meet under peak load rather than at
review time. Running an orchestrator yourself buys standardized workload
concepts and costs significant platform ownership unless it is managed well. If
that management is bought rather than built, a platform is managing your
platform, and the five questions apply there too.

Multi-cloud looks like an exit from both bills and is priced accordingly: it
can reduce one provider dependency, commonly increases complexity, and prevents
using the distinctive managed capabilities that were a reason to be on a
provider at all.

None of this makes a level wrong. It makes the last question expensive to
defer, because the answer to how we leave is not the artifact but identity,
networks, and data. The opening scene is what deferring it costs: a portable
container and a non-portable everything else.

## Sources

- Amazon Web Services, [Overview of Amazon Web Services](https://docs.aws.amazon.com/whitepapers/latest/aws-overview/introduction.html) (accessed 2026-07-18) — broad infrastructure and managed services
- Microsoft, [Azure documentation](https://learn.microsoft.com/en-us/azure/) (accessed 2026-07-18) — broad infrastructure and managed services
- Google Cloud, [Documentation](https://cloud.google.com/docs) (accessed 2026-07-18) — broad infrastructure and managed services
- Kubernetes, [Concepts](https://kubernetes.io/docs/concepts/) (accessed 2026-07-18) — containerized workloads orchestrated through declarative desired state
- Cloud Foundry, [Documentation](https://docs.cloudfoundry.org/) (accessed 2026-07-18) — platforms accepting higher-level application artifacts
- Heroku, [Platform documentation](https://devcenter.heroku.com/categories/heroku-architecture) (accessed 2026-07-18) — platforms accepting higher-level application artifacts
