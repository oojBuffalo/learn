---
id: scalability-tradeoffs
title: "Scalability Tradeoffs"
summary: Why doubling the instances behind an API can leave throughput exactly where it was, and which single measurement is worth taking before any of the five moves this lesson offers.
objectives:
  - Ask the four questions of the model before choosing among its five moves
  - Separate mechanisms that act on the work, on the resources, and on the demand
  - Name the currency each scaling choice is paid in, and where the constraint reappears afterward
estimatedMinutes: 12
difficulty: advanced
prerequisites: [monoliths-modules-and-microservices]
tags: [architecture]
---

## The instances that doubled and the page that did not

Traffic is climbing, so a team doubles the number of application instances
behind its API. Throughput barely moves. The instances are not busy; they are
waiting.

What happens next is already named. Scaling one resource often moves the
bottleneck rather than removing it. Nothing about the change was wrong. It
answered a question nobody had asked yet.

## Four questions before any of five moves

Scalability is a system's ability to handle growth in traffic, data, users, or
teams while meeting objectives. The fourth is worth pausing on: teams is a
growth dimension beside traffic, and scaling crosses frontend delivery,
compute, databases, caches, queues, third parties, organizations, and cost.

The model is two lists. Identify the growth dimension, current limiting
resource, objective at risk, and acceptable tradeoff. Then reduce work, reuse
results, increase one resource, distribute work, or change the product
behavior.

Four questions, then five moves, and the order is the point. Each question
narrows what a move would even mean: which growth, which resource runs out
first, which objective that threatens, what you will give up. Take a move
without the four and you have chosen a direction without knowing where the
constraint lies.

::activity{id="scalability-tradeoffs-sa1"}

## Seven mechanisms, and the three things they act on

Caching reduces repeated computation. Batching amortizes overhead. Vertical
scaling enlarges a resource. Horizontal scaling distributes work across
instances and requires routable or partitioned state. Replication increases
read capacity or availability. Sharding assigns subsets by key. Backpressure
keeps demand from exceeding bounded capacity.

Seven mechanisms, and this lesson sorts them by what each one touches. Two act
on the work: caching removes repetition, batching spreads overhead across a
group. Four act on the resources: enlarging one, spreading across many,
replicating for reads, splitting by key. The seventh acts on the demand, and
backpressure adds no capacity at all — it keeps demand inside the capacity that
exists.

One of the seven carries a precondition. Horizontal scaling requires routable
or partitioned state, a demand on the application before it is an option at
all, and Google Cloud recommends stateless design and modularity to support
it.

## A timeline that partitions last

Six ways this goes wrong are named here. Teams optimize average load but not
bursts, choose a hot partition key, scale application instances beyond database
connections, or add caches without miss capacity. Distributed coordination
becomes the new bottleneck. Cost scales faster than user value.

A timeline first limits and indexes queries, then caches common first pages,
then builds per-user projections asynchronously. Only after measured write and
storage pressure does it partition by user, with explicit handling for
celebrity hot keys.

Four steps, and none is the largest available. Limiting and indexing reduces
work. Caching first pages reuses results. Per-user projections are
precomputation, trading freshness and storage for query latency. Partitioning
by user is sharding, and it arrives last.

The load-bearing word is measured. Sharding is not held back because it is bad,
but because nothing had shown it was the constraint. And when it arrives, the
hot key is already named: assigning subsets by key is the mechanism that lets
one key be far busier than the rest.

::activity{id="scalability-tradeoffs-mc1"}

## Ceilings, lag, and the queries that cross a shard

Horizontal scaling offers a larger ceiling but adds coordination. Replication
creates lag and failover complexity. Sharding improves throughput while making
cross-shard queries and rebalancing expensive. Precomputation trades freshness
and storage for query latency.

Each names a currency. Horizontal scaling is paid in coordination. Replication
is paid in lag and in failover complexity. Sharding is paid at query time,
whenever a question does not fit inside one key's subset, and again whenever
the subsets have to be redrawn. Precomputation is paid in freshness and in
storage.

::activity{id="scalability-tradeoffs-ms1"}

## The cheapest thing to establish before you scale anything

The cheapest thing to establish is which resource is running out first and
which objective that threatens. Those are two of the four questions and they
cost a measurement. Everything else costs a change to the system: a cache to
keep, coordination to add, or subsets to redraw.

Three of the six are what a skipped or badly aimed measurement looks like:
average load without bursts takes the wrong statistic, instances scaled past
database connections read one resource and not the one behind it, and caches
without miss capacity measure only what the cache absorbs. A fourth, the hot
partition key, is a design choice rather than a measurement failure.

Now the opening scene reads in one line. The team distributed work — the fourth
of the five moves — without establishing which resource was limiting.
Distributing work is right when the instances are the constraint. Theirs were
waiting.

The last two describe what happens if this continues. Distributed coordination
becomes the new bottleneck — the bottleneck moving once more into the thing
meant to remove it. And cost scales faster than user value, the only failure on
the list no latency graph will ever show.

## Sources

- Google Cloud, [Take advantage of horizontal scalability](https://cloud.google.com/architecture/framework/reliability/horizontal-scalability) (source last reviewed 2024-12-30; accessed 2026-07-18) — stateless design and modularity recommended to support horizontal scaling
