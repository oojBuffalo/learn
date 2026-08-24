---
id: containers-and-orchestration
title: "Containers and Orchestration"
summary: Why a healthy service can be replaced by the very machinery meant to keep it alive whenever it gets busy, and what each container symptom rules out about where to look.
objectives:
  - Hold desired state, observed state and continuous reconciliation as the loop an orchestrator runs
  - Separate what readiness, liveness and graceful termination each control in an instance's life
  - Read container and fleet symptoms as eliminations rather than as evidence against the platform
estimatedMinutes: 12
difficulty: intermediate
prerequisites: [reliability-and-performance]
tags: [delivery-and-operations]
---

## The service that replaced itself every time it got busy

Traffic rises. The service slows down but keeps answering. Then an instance
disappears and a fresh one takes its place, and the work the old one was
partway through goes with it. Traffic rises again, and it happens again.

Liveness checks restart overloaded but recoverable processes — a failure mode
named here, and the machinery is doing exactly what it was told. It was told to
replace anything that stops answering a check, and a process that is merely
slow answers late.

## Desired state, observed state, and the loop between them

A container image packages an application filesystem and launch metadata; a
container is an isolated process created from it. Orchestration schedules,
connects, replaces, and scales many such workloads.

Containers make artifact and runtime boundaries explicit. Orchestration
automates repeated fleet operations but adds a distributed control plane and a
resource model, so the machinery is itself something to run.

The loop is the whole idea. Desired state declares what should run; controllers
compare it with observed state and continuously reconcile differences.
Kubernetes, for example, provides declarative management of containerized
workloads and services. Nothing in that sentence is an instruction to act.
Actions are what a difference produces.

Orchestrators connect deployments, identity, networking, configuration, health,
storage, and autoscaling, and containers sit between built artifacts and the
hosts that run them.

::activity{id="containers-and-orchestration-mc1"}

## Layers, placement, and three checks on one instance

Images are layered, immutable inputs. Runtime isolation uses operating-system
mechanisms; it is not a complete security boundary by itself. Schedulers place
workloads according to resources and constraints. Services provide stable
discovery over changing instances.

Three more govern a single instance's life, and they are easy to confuse
because all three watch the same process. Readiness controls traffic: it
decides whether requests arrive. Liveness can trigger replacement: it decides
whether the instance continues to exist. Graceful termination supports
draining: it decides what happens to work already in flight when the instance
is going away.

::activity{id="containers-and-orchestration-sa1"}

## One API image, and what each line of it declares

An API image runs with a read-only filesystem and non-root identity. The
deployment declares CPU and memory, readiness checks a bounded service path,
shutdown drains traffic, and autoscaling respects downstream connection
capacity. Persistent data remains in managed storage.

The non-root identity answers a named failure directly: images run as
privileged users. The declared CPU and memory are resource requests, which is
what a scheduler places against — without them, missing requests cause
noisy-neighbor failure. A bounded readiness path is readiness doing its own job
rather than a deep check standing in for one, and draining on shutdown is
graceful termination.

The last line is the interesting one. Persistent data remains in managed
storage, which is the example declining to assume the orchestrator supplies
what it does not. Teams assume the orchestrator supplies application-level
retries, transactions, or backups; this deployment keeps persistent data
somewhere whose business that is.

::activity{id="containers-and-orchestration-ms1"}

## Density, fleet size, requests, and sidecars

Containers improve consistency and density while requiring image maintenance.
Orchestration is valuable for many services or specialized placement; a managed
application platform may be simpler for a small estate. Resource requests
improve scheduling but need tuning. Sidecars package cross-cutting behavior
while consuming capacity and coupling lifecycle.

Only the second of those four is a decision about whether to adopt the
machinery at all, and it is answered by the size and shape of the estate rather
than by the technology. The other three are decisions taken after adoption:
what to maintain, what to tune, and what to attach.

Sidecars are the one that charges twice. Packaging cross-cutting behavior
beside the application consumes capacity, which is a resource-request question,
and couples lifecycle, which means the attached thing is started, drained, and
replaced with its host.

## What each container symptom rules out

Take each as an elimination rather than a diagnosis.

**An instance replaced whenever load rises** rules out a crashed process.
Liveness checks restart overloaded but recoverable processes, and the opening
service is this line: it was answering, only late.

**One workload starving another on the same host** rules out placement as the
failure. Schedulers place workloads according to resources and constraints, so
where no request was declared there was nothing to place against, and missing
requests cause noisy-neighbor failure.

**A running version nobody can name** rules out the image as evidence. Mutable
tags hide version identity, and a layered immutable input is only identifiable
if its name is too.

**A retry that never happened** rules out the platform as the owner. Teams
assume the orchestrator supplies application-level retries, transactions, or
backups, and this lesson names that assumption as a failure rather than as a
feature.

**A security argument resting on the container boundary** rules out isolation
as the whole answer.
Runtime isolation uses operating-system mechanisms and is not a complete
security boundary by itself.

**A control plane nobody on the team can operate** rules out more orchestration
as the repair. Control-plane complexity exceeds team capability, and a managed
application platform may be simpler for a small estate.

## Sources

- Kubernetes, [Concepts](https://kubernetes.io/docs/concepts/) (accessed 2026-07-18) — declarative management of containerized workloads and services
