---
id: indexes-and-query-planning
title: "Indexes and Query Planning"
summary: Why a query that was fast all the way through review collapses on real data, and what a plan tells you that adding an index never will.
objectives:
  - Read an index as one access path rather than as a general speed-up
  - Name the reasons a planner declines to use an index that exists
  - Weigh read gains against the write work more indexes create
estimatedMinutes: 12
difficulty: intermediate
prerequisites: [domain-and-application-logic]
tags: [data]
---

## The query that was fast on a laptop

The query is fine in development. It is fine in review. It reaches production and
the page that runs it becomes slow enough that people stop opening it. Nothing
about the query changed on the way.

Fast development datasets hide plans that collapse at production cardinality. The
query did not get worse. The data got bigger, and the strategy a database picks
for a small table is not the one it picks for a large table. Nobody had ever
looked at either.

## An index is an access path; a planner is an estimator

An index is an auxiliary structure that accelerates selected access paths.
“Selected” is the load-bearing word: an index is not a general speed-up, it is a
faster route to some rows and no help at all for the rest.

A query planner estimates alternative execution strategies and chooses one based
on statistics, available indexes, joins, ordering, and expected cost. Five inputs
— and only one of them is the index you added.

Between them they replace “add an index” with deliberate analysis of query shape,
selectivity, data distribution, write cost, and measured plans.

Placement follows from that. Indexes sit beside stored data. Application query
design determines whether the database can use them, while production data
distribution determines whether use is beneficial. Two separate conditions, and
the opening scene met the first and failed the second.

## A sorted map, and the reasons a planner ignores it

An index is similar to a sorted lookup map from key values to row locations. It
saves scanning when the predicate narrows data enough, but it consumes storage
and must be updated on writes. Both halves are the deal.

B-tree indexes support equality, range, and ordered access for compatible leading
keys. Hash, inverted, spatial, and other indexes serve different operators.
Composite index order matters: read alongside those leading keys, the order the
columns appear in is part of what the index can answer.

Planners use table and column statistics to estimate row counts, choose join
algorithms, and decide between index and sequential scans. Two failure modes live
right there. Functions or implicit casts can prevent intended index use, so the
index exists and the query as written cannot reach it. Stale statistics produce
bad estimates, so the planner chooses confidently and wrongly.

`EXPLAIN` exposes the chosen plan, and execution-aware variants compare estimates
with actual work.

::activity{id="indexes-and-query-planning-sa1"}

## A tenant, a creation time, and fifty rows

Take `WHERE tenant_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT 50`.
An index beginning with tenant and then creation time supports filtering, order,
and cursor pagination.

Three jobs out of one structure. Filtering is the tenant predicate. Order is the
descending sort on creation time, served rather than computed. Cursor pagination
is the `created_at < ?` bound, which asks for rows past a position instead of
a count of rows to skip and discard.

The instruction attached to the example matters as much. Validate
with realistic tenant distributions and an execution plan rather than relying on
the index name. An index's name asserts nothing about whether a planner will
reach for it, and production data distribution determines whether that helps.

::activity{id="indexes-and-query-planning-mc1"}

## More indexes, wider indexes, or no join at all

Covering indexes avoid extra lookups but grow larger. Partial indexes target a
frequently queried subset. Indexing every column wastes resources, which is this
section attempted without reading it.

The cost people forget is on the write side. More indexes speed some reads while
slowing inserts, updates, migrations, and vacuum or compaction — four kinds of
work, none of them the query you set out to improve.

Denormalized read models can outperform complex joins but require reliable
refresh. That is a different bargain: not a faster route to the rows, but rows
already arranged the way the query wants them, kept correct by something you now
have to operate.

::activity{id="indexes-and-query-planning-ms1"}

## The cheapest thing to check before you add an index

The cheapest thing to check is the plan. `EXPLAIN` exposes the chosen plan, and
execution-aware variants compare estimates with actual work. Before that, an
index is a hypothesis about a route the planner might take.

Three things a plan tells you that a hunch does not. Whether the index is used at
all — functions or implicit casts can prevent intended index use, and nothing in
the query text says so. Whether the estimate resembles reality — stale statistics
produce bad estimates, and an execution-aware plan is where estimate and actual sit
side by side. And which strategy was passed over, since planners decide between
index and sequential scans, and a deliberate sequential scan is not automatically
the problem.

Then check the data: plans are chosen against statistics, not against
intentions. Validate with realistic tenant distributions rather than
relying on the index name.

Only after both is adding an index the obvious next move. The query in the
opening scene never needed one. What it needed was the plan a fast development
dataset had given nobody a reason to look at.

## Sources

- PostgreSQL Global Development Group, [Using EXPLAIN](https://www.postgresql.org/docs/current/using-explain.html) (accessed 2026-07-18) — `EXPLAIN` exposes the chosen plan, and execution-aware variants compare estimates with actual work
