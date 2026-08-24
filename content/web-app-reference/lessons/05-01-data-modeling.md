---
id: data-modeling
title: "Data Modeling"
summary: Why an order placed last spring can quietly start showing this morning's price, and what a schema has to say about a fact before anything can own it.
objectives:
  - Read a schema as a set of answers about facts, identity, ownership and lifecycle
  - Tell a deliberate historical snapshot apart from a copy that will silently disagree
  - Choose between normalized, aggregate and event representations by what each one costs
estimatedMinutes: 12
difficulty: intermediate
prerequisites: [domain-and-application-logic]
tags: [data]
---

## The order that changed its own price

An order was placed last spring. Someone opens it this morning to settle a
billing question, and the line items show today's catalog prices. Nothing was
edited. The order simply points at the product record, and
the product record has moved on.

That is not a query bug. It is a modeling decision nobody made: whether an order
is a reference into the catalog, or a record of what was agreed at the time.

## A model is a contract, not whatever the screen needed

Data modeling identifies facts, identities, relationships, constraints, and
lifecycles, then represents them so required operations remain correct and
understandable.

A model is a contract between domain behavior and storage. Where the contract is
missing, screen layouts or transient payloads become the accidental source of
truth — whatever the last feature happened to need becomes what the database
keeps.

Models connect domain concepts to schemas, indexes, APIs, events, and reports,
and different representations may serve the same underlying concept at different
boundaries. The order on a screen, the order in a report and the order in the
database are allowed to look different. They are not allowed to disagree about
which of them is the fact.

## Start with questions, not with columns

The questions come first. What fact must survive? What identifies it? Which
rules are always true? Who owns changes? Which queries and histories matter?
What can be recomputed?

The mechanisms are what you reach for once those have answers. Entities maintain
identity through change; value objects are defined by their contents.
Relationships express ownership and association. Database constraints reject
impossible states, so the state is refused where the data lives. Normalization
avoids storing the same fact in multiple places; deliberate denormalization
stores a derived copy to improve a known access path. Temporal fields
distinguish occurrence, recording, and update time.

The failure modes are that same list with the answers left blank. Boolean fields
hide multi-step lifecycles. Nullable columns mix several meanings. Money stored
as floating point loses exact decimal intent. Deleting a parent without a
lifecycle policy leaves orphans. Copying display names into many records creates
silent disagreement — unless the copy is explicitly historical, which is the
exception the next section is built on.

::activity{id="data-modeling-ms1"}

## The order that keeps its own copy of the price

Model the order the second way and it stores immutable line descriptions and
prices as the commercial snapshot, even if the product catalog later changes.

That is a copy of a fact that lives elsewhere, which the paragraph above listed
as a failure. Here it is not, and the difference is the word “snapshot”.
Copying into many records creates silent disagreement unless the copy is
explicitly historical, and a commercial snapshot is explicitly historical. The
order is not repeating the catalog badly. It is recording something the catalog
never claimed to hold.

The same order treats identity and address differently. It references the
customer identity, because a customer is an entity that maintains identity
through change and the order wants whoever that is now. It records the delivery
address used for that order, because the address that mattered is the one used
then. One reference, one copy, in the same record, for opposite reasons.

Status is the third decision: a constrained transition model rather than
`is_paid` and `is_shipped` flags. Boolean fields hide multi-step lifecycles —
flags say where an order has been, not which states exist at all.

::activity{id="data-modeling-mc1"}

## What each representation buys, and what it bills you for

Normalized relational models favor integrity and flexible joins. Document
aggregates keep frequently used data together but duplicate shared facts. Event
histories preserve how state changed but require projections and versioned
interpretation — an event recorded under an older understanding of the rules
still has to mean something to the code reading it now.

Identity is a separate choice running alongside those. Surrogate identifiers are
stable internally; natural keys can enforce real-world uniqueness but may change
— uniqueness the outside world already agrees on, against a value you do not
control.

::activity{id="data-modeling-mat1"}

## The verdict on the order that changed its price

Back to the order showing this morning's prices.

Was the query wrong? No — it read exactly what the model told it to read. Was the
catalog wrong to change? Also no: catalogs change, and a schema that forbids that
is modeling a different business.

What went wrong is that the order was never given a fact to own. Screen layouts
or transient payloads become the accidental source of truth when the model does
not say otherwise, and last spring's price had no home at all. It existed only
in the catalog, which is the wrong owner: the catalog answers what this costs,
and the order needs what this cost.

The repair is the commercial snapshot, and the reason it is not a duplicate is
that the copy is explicitly historical. Which returns the whole lesson to the
first question on the list — what fact must survive? The price on the day is a
fact. Nothing in the schema had ever said so.

## Sources

- PostgreSQL Global Development Group, [Data Definition](https://www.postgresql.org/docs/current/ddl.html) (accessed 2026-07-18) — database constraints reject impossible states
