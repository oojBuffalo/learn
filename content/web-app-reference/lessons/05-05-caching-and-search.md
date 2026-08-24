---
id: caching-and-search
title: "Caching and Search"
summary: Why a database that was comfortable for years falls over the moment its cache restarts, and which path an answer should have taken.
objectives:
  - "Treat caches and search indexes as one category: derived data with a rebuild story"
  - Place a read on the correctness path or the acceleration path deliberately
  - Trade freshness against write latency without leaving the lag undisclosed
estimatedMinutes: 12
difficulty: intermediate
prerequisites: [domain-and-application-logic]
tags: [data]
---

## The cache went down and the database went with it

The cache layer restarts. Within seconds the database is saturated and the service
is not degraded but down. For as long as anyone remembers that database had been
comfortable — and it had been comfortable because it had never been asked.

A cache outage can overload the database it was protecting. Read that slowly. The
protection was real, which is exactly why nobody knew how much of it there was.

## Two derived-data systems with one property in common

A cache stores reusable results closer to demand. A search system builds
specialized indexes for discovery and ranking. Different jobs, and both are
derived-data systems whose value depends on freshness, invalidation, and rebuild
strategy.

The distinction between them prevents two specific mistakes: overloading a
primary database for text discovery, and turning an acceleration layer into an
undocumented source of truth.

Placement is wide. Caches may exist in browsers, CDNs, applications, and data
services. Search indexes typically consume committed changes and serve
query-oriented representations — committed being the first sign that a derived
store sits downstream of a decision rather than inside it.

## One path for correctness, one for acceleration

```text
authority (the committed fact)
  |
  === branch: two ways to reach an answer ===
  |
  +--> read the authority       correctness path
  |
  v
change capture
  |
  v
cache / search projection
  |
  v
query                          acceleration path
```

Read it downward. The branch near the top is the whole lesson: out of one
authority, the upper route answers by reading the fact, and the lower route
answers from a projection built out of captured changes. Derived stores may lag,
so interfaces must tolerate or disclose that lag. Tolerate or disclose — there is
no third option in which the lag is absent.

The mechanisms are the policies along that lower route. Cache-aside loads on miss
and writes to the authority separately. Read-through and write-through move policy
into a cache layer. TTLs bound staleness but do not guarantee freshness.
Invalidation removes known stale entries. Search tokenizes, normalizes, indexes
fields, filters, scores, and returns identifiers or projections. Redis documents
server-assisted invalidation as one approach to client-side cache coherence.

::activity{id="caching-and-search-mat1"}

## A product page, and a checkout that trusts neither projection

A product detail response is cached by product, locale, and price region with
jittered TTLs and single-flight refill. Catalog commits publish changes that evict
detail keys and update the search index.

Start with the key. The response is cached by product, locale, and price region:
three dimensions in one key, and small, stable keys simplify invalidation. Then
the commits: they evict detail keys and update the search
index, which is invalidation removing known stale entries rather than a TTL
waiting for time to pass.

Then the sentence to keep. Checkout rereads authoritative price and inventory
rather than trusting either projection — not because the cache is likely wrong,
but because checkout belongs on the upper path in that diagram and a projection
only ever sits on the lower one.

::activity{id="caching-and-search-mc1"}

## Freshness against write latency, and what a cached miss hides

Synchronous search updates improve freshness while extending write latency;
asynchronous indexing isolates writes but creates lag. One dial with two
directions, and the interface obligation travels with it: choose asynchronous and
something downstream has to tolerate or disclose the lag.

Caching expensive negative results can protect dependencies but hide newly created
data — a miss stored as a miss, which is fine until the thing exists. Returning
full search documents is fast but increases duplicated data.

The failure modes are these dials with nobody's hand on them. Cache stampedes send
many misses to the authority. Hot keys overload one shard. Missing tenant or
permission dimensions leak data, which is the key composition above getting one
dimension wrong. Search results reference deleted records. TTL-only invalidation
creates unpredictable staleness.

::activity{id="caching-and-search-ms1"}

## The verdict on the cache that took the database with it

Was the cache at fault? No. A cache outage can overload the database it was
protecting, and that sentence names the cache's absence rather than its behavior.

Was the database undersized? Tempting, and the wrong question. It was sized
against the traffic it saw, and the traffic it saw had already been filtered by a
layer whose contribution nobody had written down.

What failed is what this lesson has been about throughout. An acceleration layer
had become load-bearing without being documented as such. The distinction between
these systems prevents turning an acceleration layer into an undocumented source
of truth, and this is the operational half of that sentence: the cache was never
the source of truth, but it had quietly become the reason the database coped.

The repair is in the example rather than in a bigger cache. Read the product page
against the failure list and its jittered TTLs and single-flight refill are
answers to load arriving all at once, not to staleness. And checkout still rereads
the authority, because the one number that must not come from a projection is the
one a customer is about to be charged.

## Sources

- Redis, [Client-side caching introduction](https://redis.io/docs/latest/develop/clients/client-side-caching/) (accessed 2026-07-18) — server-assisted invalidation as one approach to client-side cache coherence
