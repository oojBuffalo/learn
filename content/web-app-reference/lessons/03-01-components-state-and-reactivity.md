---
id: components-state-and-reactivity
title: "Components, State, and Reactivity"
summary: Why a count above a table can disagree with the rows below it, and how deciding what to derive rather than store settles the argument.
objectives:
  - Separate what a component is given, what it owns, and what it computes
  - Decide where a piece of state should live and who may change it
  - Read a component's failure modes as consequences of misplaced ownership
estimatedMinutes: 12
difficulty: intermediate
prerequisites: [rendering-and-the-dom, javascript-runtime]
tags: [frontend]
---

## The filter says twelve and the table shows nine

A caption reading “12 matching orders” sits above nine rows. Both numbers came
off the same data, on the same screen, within the same second, and neither is
obviously the broken one.

Nothing here is a rendering fault. The screen drew what it was told, twice, from
two copies of the same fact. One copy was recomputed when the filter changed;
the other was not.

## A component is a responsibility; state is what can change

Frontend components group presentation and interaction around a responsibility.
State records information that can change. Reactivity keeps rendered output and
derived behavior synchronized with state changes.

Those three sentences are what replaces scattered DOM mutation with predictable
data flow, and they hand you three questions to ask of any fact on a screen:
where should this state live, who may change it, and what can be derived instead
of stored. The caption and the rows disagree because the third question was
never asked.

Components sit above browser primitives and below product screens. They
translate domain-facing data into DOM structure and user events into application
intents. The browser remains the actual rendering platform throughout; a
component system schedules and applies DOM changes.

## Data in, intents out

```text
state + inputs → render description
user event → command → state transition → new render description
```

The first line is what the screen is; the second is the only way it changes — by
a command, not by reaching into the document.

Inputs pass data into a component; events or callbacks communicate outward. Data
descends and intents ascend, and the asymmetry is what makes the flow
predictable.

Three kinds of state sit inside that boundary, sorted by who needs them. Local
state supports transient interaction. Shared state coordinates siblings or
routes. Derived state is computed from authoritative inputs — which makes it
less a place to put things than a decision not to put them anywhere.

Reactive systems detect dependencies through explicit subscriptions, compiler
analysis, signals, or rerender-and-diff strategies. The strategy changes how a
change gets noticed; it does not decide which facts are authoritative, and that
is the decision the caption got wrong.

::activity{id="components-state-and-reactivity-mc1"}

## Loops, lost focus, and state that outlives its route

Duplicated derived state drifts from its source. That is the caption and the
rows, named exactly.

The usual repair for drift is an effect that copies the source into the copy,
which introduces the second failure: effects that copy state back and forth
create loops. Unstable identity loses input or focus, because a component the
system treats as a new one arrives holding none of the transient interaction
state the old one held. A component that fetches, authorizes, formats,
navigates, and renders becomes difficult to test or reuse — five
responsibilities where the model asked for one. And global state can outlive the
user or route it belonged to.

::activity{id="components-state-and-reactivity-sa1"}

## An order table that owns almost nothing

An order table receives orders as input, owns only row-expansion state, derives
filtered rows from query state, and emits `cancelRequested(orderId)`. A higher
application layer performs the mutation and replaces authoritative order data
when the server responds.

Read the four clauses as four refusals. The table does not own the orders, so it
cannot disagree with them. It owns row expansion, which nothing outside it needs
and nothing outside it can contradict. It derives the filtered rows instead of
storing them, so there is no second copy to fall behind — the caption's bug
cannot be written here. And it emits an intent rather than performing the
cancellation, leaving the mutation and the replacement of authoritative data to a
layer that can be exercised without a table.

::activity{id="components-state-and-reactivity-mat1"}

## Reuse, stores, and signals

Three tradeoffs sit behind those refusals.

Colocating state with its smallest owner improves comprehension. Central stores
simplify cross-cutting coordination but can turn unrelated changes into global
coupling — a bill that arrives later than the benefit, which is what makes it
easy to sign.

Immutable updates simplify change detection and history; fine-grained mutable
signals can reduce work but require disciplined ownership. Read that as a swap
rather than an upgrade: the work saved is bought with ownership you then have to
keep straight.

Component reuse is valuable when behavior and semantics repeat, not merely
because markup looks similar.

## Who owns this state, and what the answer costs

Every fact on a screen forces the same decision, and the model offers four
answers: an input from above, local state, shared state, or nothing at all.

Choosing an input costs you the ability to change it here. Choosing local state
costs you the ability to read it anywhere else. Choosing shared state buys
coordination between siblings or routes and can turn unrelated changes into
global coupling. Choosing to derive means computing the answer whenever it is
wanted, and it is the only one of the four with no second copy to keep in step.

The caption above the nine rows was a fact that had been given an owner it did
not need. That is what this decision costs when it goes the other way.

## Sources

- WHATWG, [DOM Standard](https://dom.spec.whatwg.org/) (accessed 2026-07-18) — the browser remains the actual rendering platform, with a component system scheduling and applying DOM changes
