---
id: server-runtimes
title: "Server Runtimes"
summary: Why a health endpoint can stay green while the requests behind it stall, and the five questions a runtime answers before your code runs.
objectives:
  - Read a runtime as a set of scheduling answers rather than as a language choice
  - Match a concurrency model to the shape of the work it has to carry
  - Trace a runtime symptom back to the scheduling decision that produced it
estimatedMinutes: 12
difficulty: intermediate
prerequisites: [clients-servers-and-resources, data-fetching]
tags: [backend]
---

## The health endpoint is green and nothing is moving

A service is paged. Its health endpoint answers straight away and reports that
the process is up. Every other path is slow, and some requests never come back
at all.

Both facts are true, and they are about different things. A health endpoint can
remain green while worker pools are saturated: answering one trivial request
shows that the process is alive and scheduling something, not that there is room
left to schedule anything useful. The gap between “the process is running” and
“work is getting done” is the runtime — and the runtime is the part of a backend
most often mistaken for a language.

## A runtime is five answers, not a syntax

A server runtime loads application code, accepts work, schedules execution,
manages memory and I/O, and integrates with the operating system. Language
syntax is only one part of its operational behavior: the part you read, and
rarely the part that decides how a service behaves under load.

Every runtime has to answer the same five questions. How does work enter? How
many requests run concurrently? What blocks progress? Where is mutable state?
How is a process stopped without abandoning work?

Those answers are what runtime models explain — concurrency, capacity, startup,
failure isolation, and why blocking or CPU-heavy work behaves differently across
stacks.

## Where it sits, and how it schedules

The runtime sits between network-facing server software and application code. It
may directly accept HTTP, run behind a dedicated proxy, or execute functions in
a managed platform — three placements that change what else you have to operate
without changing any of the five questions.

Thread-per-request runtimes rely on operating-system threads and pools. Work
enters on a thread, blocking is contained by the thread that blocks, and the
pool is the bound. Event-driven runtimes instead multiplex many I/O operations
through loops and callbacks, so a single loop can hold a great many waits at
once. Actor or lightweight-task models schedule isolated units above threads,
keeping the isolation without paying a thread for each unit.

Memory is the second axis. Garbage-collected runtimes trade automatic
reclamation for pause and memory behavior; manual-memory runtimes trade control
for safety obligations. Around all of it, process supervisors restart failed
instances and coordinate signals.

::activity{id="server-runtimes-mc1"}

## An image endpoint that refuses work

An image endpoint accepts a request on an I/O-oriented server but delegates
resizing to a bounded CPU worker pool. Read that as two decisions rather than
one. Accepting on an I/O-oriented server answers the first question cheaply.
Sending the resizing elsewhere answers the third one honestly: resizing is CPU
work, and CPU work is what an event loop cannot absorb.

“Bounded” is the load-bearing word. When the pool is full, the endpoint rejects
or queues within a fixed limit rather than accepting unlimited work. Something
has to say no, because unbounded concurrency exhausts memory or downstream
connections — accepted work does not wait politely outside the process, it
occupies it.

Shutdown answers the fifth question: it stops admission, waits within a
deadline, then exits. Three steps in that order, because stopping admission
first is what makes the wait finite, and the deadline is what makes the exit
certain.

::activity{id="server-runtimes-ms1"}

## Concurrency should match the workload you actually have

Concurrency should match workload, and the models fail in opposite directions.
Event loops efficiently wait on I/O but CPU work can stall all requests on a
loop. Thread pools isolate blocking work until the pool is exhausted. Neither is
wrong; each carries one shape of work well and is ruined by another.

More processes improve isolation and CPU use while increasing memory and
coordination. Lifecycle is a separate decision again: long-lived processes reuse
pools and caches, while function platforms simplify lifecycle but can add
startup and connection churn.

::activity{id="server-runtimes-mat1"}

## What each runtime symptom rules out

Runtime faults surface a long way from their cause, so what makes a symptom
useful is less what it proves than what it eliminates.

**Memory or downstream connections running out under load** points at admission
rather than at the work. Unbounded concurrency exhausts memory or downstream
connections, and making each unit of work faster does not fix accepting too many
of them.

**One request seeing another's data** rules out the handler and points at the
fourth question. Leaked thread-local or global state crosses requests, and no
amount of correct handler code survives state that outlives the request it
belonged to.

**Work disappearing when an instance restarts** rules out any single request
having failed. Abrupt shutdown drops in-flight work — which is why the image
endpoint stops admission and waits before exiting.

And the green health endpoint that opened this lesson rules out very little. It
establishes that the process accepted a request and answered it. A health
endpoint can remain green while worker pools are saturated, which is that same
sentence read from the other side: the check exercises admission, and nothing
that admission leads to.

## Sources

- The Open Group, [POSIX Threads](https://pubs.opengroup.org/onlinepubs/9799919799/basedefs/pthread.h.html) (accessed 2026-07-18) — thread-per-request runtimes rely on operating-system threads and pools
