---
id: reliability-and-performance
title: "Reliability and Performance"
summary: Why a dashboard can report that the latency objective is met while the application is unusable for real people, and what it costs to decide how much reliability you are actually buying.
objectives:
  - Define reliability and performance from user-visible outcomes and read them as distributions
  - Follow an indicator into a target and a target into an error budget you can spend
  - Price the reliability decision in money, complexity and delivery speed rather than in intent
estimatedMinutes: 12
difficulty: intermediate
prerequisites: [scaling-and-resilience, third-party-integrations]
tags: [quality-and-observability]
---

## The dashboard that was green for whoever succeeded

A dashboard reports the latency objective is met. Support reports the
application is unusable for some people. Both describe the same system.

The number on the dashboard is an average, computed only over requests that
returned successfully. Teams exclude failed requests from latency, and averages
are compact but hide slow cohorts — a failure mode and a tradeoff stacked on
each other. The failing requests and the slow cohort are both outside that
number.

## An indicator, a target, and a budget for missing it

Reliability is the ability to deliver intended behavior under stated
conditions. Performance is the time and resources required. Both should be
defined from user-visible outcomes and managed as distributions, not isolated
averages.

An SLI is a measurement, an SLO is its target, and an SLA is an agreement with
consequences. Google SRE recommends selecting indicators from what users care
about rather than what is easiest to measure.

```text
indicator   -> measures an outcome
  objective -> sets the target
    budget  -> tolerated misses
               over a window
```

Read it downward. Service-level indicators measure outcomes, objectives set
targets, and error budgets express tolerated misses over a window. Each line
needs the one above it: no target without a measurement, and no budget without
a target to miss.

Objectives turn vague “fast and available” goals into engineering constraints,
monitoring, capacity decisions, and acceptable risk. Every layer contributes
latency and failure.

## Ratios, histograms, budgets and drills

Availability ratios count successful eligible events. Latency histograms
preserve tail behavior. Load tests discover capacity and bottlenecks. Timeouts
bound waiting; retries consume an explicit budget. Redundancy, failover,
degradation, and recovery drills address failure. Performance budgets limit
frontend and backend regressions.

This lesson reads two words in the first sentence as load-bearing. Successful
is the word that keeps a fast error out of the count. Eligible is what decides
which events the objective was ever about.

## One document viewer, defined from what a reader sees

A document viewer defines successful view availability and time-to-usable-content
by device class. It tracks p50, p95, and p99, budgets edge and backend time,
and degrades optional recommendations when the remaining error budget is low.

Successful view availability is an availability ratio, with successful doing
the job above. Time to usable content, split by device class, is an
indicator taken from what a reader notices rather than what a server finds easy
to emit. The three percentiles are the distribution asked for instead of an
isolated average. Budgeting edge and backend time is a performance budget
applied in two places.

The last clause is the only action rather than a definition. Degrading optional
recommendations when the remaining error budget is low is degradation, one of
the mechanisms this lesson lists against failure, and it fires on a number the
viewer already computes.

::activity{id="reliability-and-performance-ms1"}

## Averages, percentiles, and where you stand to measure

Higher reliability costs money, complexity, and delivery speed. That is the
first decision, priced in three currencies, none of which is reliability.

Averages are compact but hide slow cohorts; percentiles reveal tails while
requiring careful aggregation. Client measurements include network and
rendering; server measurements isolate backend behavior. Synthetic probes are
controlled; real-user signals represent actual diversity.

Three pairs, none with a winner. Read each as a question about what the
measurement may include: a slow cohort, the network and the rendering, or the
diversity of real circumstances.

The failure modes are a separate list, and none of them is one of those three
pairs decided the wrong way. Teams target 100%, alert on every error, exclude
failed requests from latency, or optimize a component that is not on the
critical path. Load tests omit downstream limits. Redundancy shares the same
failure domain. A fast error is counted as good latency.

::activity{id="reliability-and-performance-mat1"}

## How much reliability you are buying, and in what currency

The decision left is not whether to be reliable but how much, and the price is
already stated: money, complexity, and delivery speed.

The error budget is what makes it a decision rather than a preference.
Objectives set targets and budgets express tolerated misses over a window, so
“how much” becomes a quantity you either have left or do not. The viewer reads
what it has left and drops the optional recommendations rather than the content
itself.

Two things the budget does not buy. Targeting 100% is on the mistakes list,
and a target that tolerates nothing leaves nothing to spend. And a budget
says nothing about where the time went: budgeting edge and backend time is a
separate instrument.

Alerting on every error is the same misunderstanding pointed the other way. An
objective with a budget expects some misses; alerting on each treats the budget
as though it were zero.

The opening dashboard never made any of these decisions. Its number was easy to
produce and was not selected from what users care about — the first thing you
have to buy here, and it costs the number you already had.

::activity{id="reliability-and-performance-mc1"}

## Sources

- Google, [Site Reliability Engineering: Service Level Objectives](https://sre.google/sre-book/service-level-objectives/) (accessed 2026-07-18) — selecting indicators from what users care about rather than from what is easiest to measure
