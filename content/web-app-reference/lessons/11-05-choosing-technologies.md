---
id: choosing-technologies
title: "Choosing Technologies"
summary: Why a comparison table can produce a winner without anything having been decided, and what has to be true of a constraint before it can remove a single candidate from the list.
objectives:
  - Run a selection as a pipeline that ends in consequences and exit conditions rather than in a winner
  - Set constraints measurable enough that a candidate can fail one
  - Size the analysis to how reversible the choice is
estimatedMinutes: 12
difficulty: intermediate
tags: [technology-landscape]
---

## The comparison table that had a winner before anything was measured

A team compares three candidates in a table. The rows are capabilities, the
cells are ticks, and one column has more ticks than the others. The table is
accurate. Nobody has yet said what the system must do, how fast, at what
availability, or what happens to the chosen thing under overload.

This lesson has a name for the shape: feature matrices count irrelevant
capabilities. The table did not choose wrongly. It counted, and counting is not
deciding, because nothing in it could have removed anything.

## A selection is a pipeline, and it does not end at the choice

Technology selection is a constrained decision about product needs, system
qualities, team capability, operations, risk, and cost. The best choice is one
whose tradeoffs the team can explain and operate.

```text
required capabilities + quality objectives + constraints
  -> viable options
  -> smallest useful experiment
  -> evidence
  -> decision with consequences and exit conditions
```

Read it downward and the table's problem is structural. It starts at viable
options, with nothing upstream that could have made anything unviable, and
stops at a winner, with nothing downstream to say what the winner costs or when
it stops being the answer.

Selection follows conceptual architecture and precedes irreversible dependency,
data, and delivery commitments, and should be revisited when evidence or
constraints change. The instruction under the pipeline is the shortest sentence
here: record why, not just what.

## What a constraint has to be before it removes anything

Define workload and critical journeys. Set measurable constraints for latency,
availability, consistency, security, compliance, scale, budget, and delivery.
Assess team familiarity, ecosystem health, support horizon, operability,
migration path, and lock-in against an explicit quality framework. Prototype
the riskiest assumption with representative data and failure. Capture the
decision and review trigger in an architecture record.

Measurable is the load-bearing word in the second sentence. A constraint that
cannot be checked cannot remove a candidate, and a selection with nothing
removable in it ends wherever the ticks are densest.

The third sentence is where a feature comparison stops being enough. Six things
to assess are not capabilities at all: what the team already knows, how healthy
the ecosystem is, how long it will be supported, how it is operated, how you
would migrate off it, and how much it locks you in. A product can satisfy every
row of a table and fail on any of the six.

::activity{id="choosing-technologies-ms1"}

## A job system chosen by overload rather than by feature count

A team choosing a job system lists required throughput, maximum delay, retry
semantics, retention, ordering, and operator capacity. It tests overload and
recovery with production-shaped payloads, estimates cost, documents why the
chosen service wins, and names volume or compliance changes that trigger
review.

Those six requirements are constraints rather than features: each is a number
or a rule a candidate either meets or does not, which is what lets the list
shorten itself.

Then the test does what a demonstration would not. Overload and recovery are
two states a happy path never reaches, and production-shaped payloads are what
stop the test from proving something about a smaller problem.

The last clause is the one a selection can finish without. Naming the volume or
compliance changes that trigger review is what an architecture record is there
to capture.

::activity{id="choosing-technologies-ord1"}

## What familiarity buys and what it cannot fit

Familiar technology lowers delivery risk but may not fit a hard requirement.
Managed products exchange control and portability for reduced operations. Open
source gives inspectability but not free support. A standard stack reduces
cognitive load; exceptional tools need exceptional justification. Reversible
choices deserve less analysis than durable data formats and public contracts.

The last one prices all the others. Analysis is not free, and spread evenly it
gives a choice that can be undone the same scrutiny as one that cannot. Durable
data formats and public contracts are the ones that cannot.

::activity{id="choosing-technologies-mc1"}

## The verdict on the comparison table

Was the winning column the wrong choice? Unknown, and that is the finding. The
table cannot say, and neither can this lesson.

What the table established is that one candidate has more of the capabilities
somebody listed. What it did not establish is whether any of them is required,
whether the candidate meets a checkable constraint, or what it does under
overload.

The failure list says what tends to happen next. Benchmarks omit the real
workload. Teams ignore upgrade or incident work. Selection assumes future
headcount or scale that never arrives. And a prototype proves a happy path but
not recovery, quotas, or data export — the table's own absence arriving later
and costing more.

So the repair is upstream of the table rather than inside it. Say what the
system must do, set constraints that can be checked, and most of the rows stop
mattering. The best choice is the one whose tradeoffs the team can explain and
operate, and a tick cannot be explained or operated.

## Sources

- Google Cloud, [Well-Architected Framework](https://cloud.google.com/architecture/framework) (accessed 2026-07-18) — an explicit quality framework to assess familiarity, ecosystem health, support horizon, operability, migration path, and lock-in against
