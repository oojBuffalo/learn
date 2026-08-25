---
id: evolving-an-architecture
title: "Evolving an Architecture"
summary: Why a migration that shipped, worked and was celebrated can still be leaking cost years later through the one step nobody scheduled, and what a target diagram is missing until a path exists.
objectives:
  - Read an architecture change as a sequence of operable states rather than a before and an after
  - Attach each mechanism to what it makes safe — survival of the old shape, control of the switch, or evidence
  - Price parallel paths, dual writes, rewrites and incremental extraction as four different bills
estimatedMinutes: 12
difficulty: intermediate
tags: [architecture]
---

## The adapter that was going to be temporary

A compatibility adapter was added to keep an old concept out of the new code
while the new path was built. The new path works. The adapter is still in every
request, and nobody has a date for removing it.

This lesson names it first among its failure modes: temporary adapters become
permanent. Nothing is down and nothing is broken. It is the shape a
migration takes when its last step was never scheduled.

## A destination is worth what the path to it is worth

Architecture evolves through small, observable changes that preserve current
behavior while moving boundaries, data, and traffic toward a better structure.
A target diagram is useful only with a safe path from today.

Read the second sentence as a constraint on ambition: a destination with no
path of operable states is not a plan but a picture.

The path has a shape. Establish a seam, add the new path, run both or route a
small cohort, compare outcomes, move authority, remove old use, and finally
delete the old path. Every intermediate state must be operable.

Seven steps, and that last sentence makes them steps rather than a schedule:
any can be where you stop. Evolutionary change limits blast radius,
keeps rollback possible, and lets evidence revise the destination — the third
only while you can still look.

::activity{id="evolving-an-architecture-sa1"}

## What holds the old shape still while the new one arrives

Compatibility adapters isolate old concepts. Expand–contract migrations support
overlapping versions. Branch by abstraction switches implementations behind a
stable interface. Shadow traffic compares results without serving them. Feature
flags and canaries limit exposure. Architecture decision records preserve
context and reversal conditions.

Sort them by what each makes safe. Two keep an old shape survivable: an adapter
for concepts, an expand–contract migration for versions. Two control the
switch: branch by abstraction chooses which implementation runs, flags and
canaries who sees it. Shadow traffic produces
evidence rather than control, running the new path and discarding the answer.

The sixth makes nothing safe at the time: a decision record preserves context
and reversal conditions for whoever inherits the path.

## Extracting search without turning search off

Seven ways this goes wrong are named here. Temporary adapters become permanent,
old code keeps receiving writes, success lacks measurable criteria, and
migrations cannot stop safely. Teams copy data without reconciliation or
decommission a dependency before all consumers are known. A new architecture is
optimized for hypothetical scale.

To extract search, define a search port, implement the old database query
behind it, build an index from committed events, shadow queries and compare,
route a cohort, make the index authoritative for discovery, then remove the old
query and backfill tooling.

Lay it against the shape. The search port is the seam, and putting the old
query behind it is branch by abstraction with one branch. Building the index
adds the new path. Shadowing compares outcomes without serving them. Routing a
cohort is exposure. Making the index authoritative moves authority. Removing
the old query is the deletion.

The order refuses two of those failures: comparing gives success a measurable
criterion, and removing the old query last stops old code receiving writes.

Notice what is already true when authority moves: the comparison has happened
on real queries, and a cohort has been served. Nobody has to trust the index
because it was built carefully.

::activity{id="evolving-an-architecture-ms1"}

## Parallel paths, dual writes, and the rewrite that promises purity

Parallel paths reduce migration risk while increasing temporary complexity and
cost. Dual writes accelerate cutover but need reconciliation and clear
authority. Rewrites offer conceptual purity but delay feedback and recreate
hidden behavior. Incremental extraction follows capability and operational
readiness; the decomposition guidance cited here emphasizes atomic evolutionary
steps and retiring old paths.

Four choices, four different bills. Parallel paths are paid while they run:
two of everything, for as long as it takes. Dual writes are paid in
reconciliation and in having to say which store is authoritative — a decision
rather than a job. Rewrites are paid in feedback you do not get and behavior
you rediscover. Incremental extraction is paid in patience, at the speed of
readiness rather than the plan.

::activity{id="evolving-an-architecture-mc1"}

## The path you are choosing, and what it charges

The decision is not which mechanism to use but which path, and each charges
before it finishes.

Parallel paths let you stop anywhere and charge for two systems throughout.
Dual writes charge sooner, in reconciliation and in a decision about authority
that has to be made rather than discovered. The rewrite charges up front, in
feedback deferred to the end — the one payment nothing refunds, since evidence
revising the destination is what was given up.

Three of the seven belong to the end rather than the beginning: adapters that
become permanent, old code still receiving writes, and a
dependency decommissioned before its consumers are known. The opening scene is
the first.

So two questions price any path. Is every state along the way operable, and is
there a measurable criterion for success? The failure list names both absences,
and a target diagram shows neither.

## Sources

- Zhamak Dehghani, [How to break a Monolith into Microservices](https://martinfowler.com/articles/break-monolith-into-microservices.html) (2018; accessed 2026-07-18) — atomic evolutionary steps and retiring old paths
