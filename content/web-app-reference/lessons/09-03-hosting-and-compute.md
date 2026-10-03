---
id: hosting-and-compute
title: "Hosting and Compute"
summary: Why a move to a new platform can be accepted by it, scheduled without complaint, and still never start serving, and how much of the operation you are actually buying when you choose where a workload runs.
objectives:
  - Read a compute choice as a split of eight management responsibilities between team and provider
  - Tell virtual machines, containers, application platforms, function platforms and failure domains apart by what each provides
  - Price control, acceleration, autoscaling delay and distance as the costs a hosting decision charges
estimatedMinutes: 12
difficulty: intermediate
prerequisites: [reliability-and-performance]
tags: [delivery-and-operations]
---

## The move that deployed and never came up

A team moves a service to a managed application platform. The platform accepts
the artifact and schedules instances. Nothing reports an error. The instances
never start serving, because the service does a long piece of work before it
can answer anything and startup exceeds health deadlines.

Managed platforms accelerate standard workloads but constrain networking,
runtime, or startup behavior — a tradeoff named here, and this team met the
third item on that list on the first day.

## Who manages what, and the word that changes only that

Hosting provides the environments where web workloads execute. Compute options
range from virtual machines and containers to managed application platforms and
functions, each assigning different responsibilities to the team and the
provider.

The model is a question rather than a ranking. Ask who manages machine
provisioning, operating-system updates, runtime lifecycle, scaling, health,
isolation, networking, and incident response. Eight answers, and a compute
option is one particular set of them.

“Serverless” changes ownership; it does not remove servers or limits. And the
choice is not a language question either: the right abstraction matches
workload lifecycle, state, networking, scaling, compliance, and operational
capability, not merely the language runtime.

::activity{id="hosting-and-compute-mc1"}

## Five things a workload can run on

Virtual machines provide durable operating-system instances. Containers package
a process filesystem and metadata while sharing a host kernel. Application
platforms accept an artifact and manage runtime instances. Function platforms
invoke code for events with platform-defined limits. Regions and zones define
failure and latency domains.

The last of those five is not somewhere a process runs. It is the geometry the
other four sit inside, and it is what makes “two of them” mean something
different from “two copies.”

Two of the other four hand the runtime over: application platforms manage
runtime instances, and function platforms invoke code for events. Read this
lesson's way, the remaining two leave more with you.

::activity{id="hosting-and-compute-mat1"}

## One API, two zones, and a job that reuses the artifact

Six ways this goes wrong are named here. Local disk is treated as durable.
Instance identity is shared. Startup exceeds health deadlines. Scaling floods a
fixed database. A regional architecture still depends on one global control or
secret service. Cost grows from idle capacity or uncontrolled invocation.

A conventional API runs as stateless managed containers in two zones, uses
external session and database storage, scales on concurrency within a database
connection budget, and drains requests during rollout. A scheduled billing job
uses the same artifact with a different command.

External session and database storage is the first of those failures refused:
nothing held locally is being trusted to survive. The connection budget answers
the fourth, allowing scaling to follow concurrency only as far as the database
can answer. Two zones puts the instances in two failure domains. Draining
during rollout lets requests in flight finish instead of being cut.

The billing job is the same artifact with a different command — a scheduled
task rather than a second thing to build.

::activity{id="hosting-and-compute-ms1"}

## Control, constraint, delay, and distance

Lower-level compute offers control and portability at higher operational cost.
Managed platforms accelerate standard workloads but constrain networking,
runtime, or startup behavior. Autoscaling follows metrics with delay and needs
capacity limits. Colocating compute with data reduces latency; multi-region
deployment improves reach or resilience while complicating consistency.

The first two are the same question from opposite ends: how much of the
operation you hold. The third is about time — capacity arrives after the load
that called for it, which is why capacity limits belong to the decision rather
than to tuning. The fourth is about distance, and it splits in two: nearness to
data buys latency, and spread across regions buys reach or resilience and
charges consistency.

## How much of the compute operation you are buying, and what it charges

The decision is not which platform is best. It is how many of the eight
management questions you intend to answer yourself, and every answer has a
price already stated.

Keep provisioning, operating-system updates, and the rest, and you get control
and portability at higher operational cost. Hand them over, and standard
workloads accelerate while networking, runtime, or startup behavior is
constrained. Neither reading is a mistake. They are one purchase described from
two sides.

Two of the four prices are not operational at all. Autoscaling charges a delay that
no configuration removes, so a capacity limit is part of what you bought.
Distance charges consistency the moment a deployment spans regions. And the
bill keeps arriving after the choice: cost grows from idle capacity or
uncontrolled invocation — capacity held for load that is not there, or
invocation without a limit.

What the opening team bought is now readable. They bought acceleration for a
workload that was standard in every dimension except one of the three a managed
platform is named as constraining. The model would have asked the question in advance —
who manages runtime lifecycle and health, and against whose deadline — and the
answer was available before the move rather than after it.

## Sources

- Google Cloud, [Infrastructure reliability guide](https://cloud.google.com/architecture/infra-reliability-guide) (accessed 2026-07-18) — regions and zones defining failure and latency domains
