---
id: scaling-and-resilience
title: "Scaling and Resilience"
summary: Why an afternoon of rising latency and steady throughput is already a capacity problem, and which question to ask before adding anything.
objectives:
  - Read latency and throughput as evidence about where a bound is being reached
  - Distinguish mechanisms that serve more work from mechanisms that behave well with less
  - Ask what is actually measured before scaling, replicating or retrying
estimatedMinutes: 12
difficulty: intermediate
prerequisites: [clients-servers-and-resources, data-fetching]
tags: [backend]
---

## Everything is slower and nothing is failing

Traffic climbs through the afternoon. Requests keep completing at very nearly
the rate they always did, and every one of them takes longer than it used to. No
component is down. No error rate has moved. The service is degrading and no
dashboard has anything red on it.

Queueing grows as utilization approaches a limit, so latency often fails before
throughput stops. What that afternoon looks like from outside is a service in
trouble; what it looks like on a throughput graph is a service doing fine, right
up until it is not.

## Capacity is bounded at every resource

Capacity is bounded at every resource: CPU, memory, worker slots, connections,
storage I/O, and dependency quotas. Six bounds, and a service is as fast as the
first one it reaches — which is rarely the one anybody was watching.

That model sits under both halves of this lesson's title. Scaling preserves
acceptable service as demand grows. Resilience preserves useful behavior when
components slow down or fail. The goals differ: one is about more, the other is
about worse. Both begin with measured constraints, not with multiplying
services.

Backend instances depend on databases, caches, queues, and third parties, and
the system is only as resilient as its dependency graph and recovery behavior.
Neither goal, then, is a property of your process. Both are properties of the
graph your process sits inside.

::activity{id="scaling-and-resilience-mc1"}

## Serving more work, and behaving well with less

Horizontal scaling adds instances when work can be distributed — the *when* is
load-bearing, because work that cannot be distributed gains nothing from more
instances. Stateless request handling is usually what makes work distributable:
it lets any healthy instance serve a request.

The rest of the repertoire is about there not being enough. Load shedding
rejects excess work before all requests time out, which is a decision to fail
some requests rather than all of them. Deadlines bound resource use, so work
nobody wants any more stops consuming. Circuit breaking stops repeatedly calling
a failing dependency. Bulkheads reserve capacity between workloads, so one
workload's bad afternoon is not every workload's. Replication and failover
reduce some single points of failure — *some*, which is again the dependency
graph asserting itself.

::activity{id="scaling-and-resilience-mat1"}

## A shop page that renders without recommendations

During recommendation-service failure, a shop page stops calls after a short
deadline and renders products without recommendations. A bounded retry budget
covers rare resets. Core inventory and checkout capacity remain isolated from
optional personalization traffic.

Three mechanisms, in the order they take effect. The deadline is what stops a
failing dependency from spending the page's time. Rendering products without
recommendations is graceful degradation, preserving core tasks by omitting
optional dependencies — which requires having decided in advance which
dependencies were optional. And keeping core inventory and checkout capacity
isolated from optional personalization traffic is a bulkhead: capacity reserved
between workloads, so the optional thing cannot eat what the essential thing
needs.

The retry budget is the fourth element and the easiest to misread. It is
*bounded*, and it covers *rare* resets. Retries improve transient success only
with backoff, jitter, budgets, and idempotency — all four, and a budget on its
own is one of them.

## Adding instances, adding copies, adding retries

Vertical scaling is operationally simple but finite: there is a largest one, and
after that the option is gone. Horizontal scaling adds coordination and
data-distribution challenges in exchange for not having a ceiling of that shape.

Redundancy increases availability but can multiply cost and correlated
misconfiguration. Copies of a component are also copies of the mistake in it.

Retries look like the cheapest change on this page and are not. Retry storms,
unbounded queues, synchronized autoscaling, shared connection-pool exhaustion,
and slow dependencies create cascading failure — five routes by which a local
problem becomes a general one, and the first of them is what an unbudgeted retry
becomes under load.

::activity{id="scaling-and-resilience-mc2"}

## The cheapest thing to measure before you add anything

Both halves begin with measured constraints, not with multiplying services. In
practice that puts one question ahead of every proposal on this page: which
resource is bounded right now?

Start there, because capacity is bounded at every resource — CPU, memory, worker
slots, connections, storage I/O, and dependency quotas — and instances added
against the wrong one buy coordination and data-distribution challenges without
moving the bound. Shared connection-pool exhaustion is the plainest case: more
instances contending for one shared pool is more contenders for the same limit.

Two cheap checks come next, and both ask what your evidence is worth. Ask what
the health check actually tests, because health checks that test only the
process admit instances that cannot serve, and a large fleet that cannot serve
is worse than a small one that can. Then ask where state
lives, because state stored on one instance makes load balancing and failover
inconsistent — and those two are the mechanisms you were about to rely on.

Only after that is the opening afternoon answerable. Latency climbing while
throughput holds is not a mystery to be scaled away. It is queueing growing as
utilization approaches a limit, and the useful next move is finding out which
limit.

## Sources

- Google Cloud, [Well-Architected Framework: Reliability](https://cloud.google.com/architecture/framework/reliability) (accessed 2026-07-18) — graceful degradation preserves core tasks by omitting optional dependencies
