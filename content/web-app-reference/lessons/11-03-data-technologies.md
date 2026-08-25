---
id: data-technologies
title: "Data Technologies"
summary: Why a fourth store can join a system without anyone being able to say what it is authoritative for, and the two things that have to be written down about a store before a fifth is added.
objectives:
  - Give every store a role before specifying anything else about it
  - Say what has to be measured before a specialized store is justified beside a relational one
  - Read each of this lesson's data failures as a role that was never assigned
estimatedMinutes: 12
difficulty: advanced
prerequisites: [evolving-an-architecture]
tags: [technology-landscape]
---

## The fourth store nobody can name an owner for

A product has a relational database, a cache, a search index, and a document
store. Each arrived on its own, because something needed to scale. A support
ticket now reports that a customer's plan is wrong, and the answer depends on
which of the four you ask.

Nothing has failed. The stores were added one at a time and never given jobs.
This lesson's map exists to prevent that: to assign a clear authority and
rebuild strategy to every store instead of accumulating products around vague
“scale” needs.

## Every store gets a role, then four specifications

Data technologies include transactional databases, document and key-value
stores, caches, search engines, warehouses, object stores, queues, and event
logs. Each offers a different correctness and access model.

Classify a store by role: system of record, acceleration layer, search
projection, analytical copy, byte-object authority, or delivery log. Then
specify consistency, latency, retention, and recovery.

Two moves, and the order carries the weight. The role settles what the store
may be believed about; the four specifications settle what it promises and how
it comes back. A store with neither is the one in the support ticket.

::activity{id="data-technologies-fb1"}

## What each named product is described as providing

PostgreSQL and MySQL provide relational schemas, transactions, indexes, and
SQL. MongoDB centers document aggregates. Redis exposes in-memory data
structures used for caching and coordination. Elasticsearch and OpenSearch
build search indexes. Kafka provides partitioned retained logs for event
streams. Object stores manage durable byte objects by key. Warehouses and
columnar engines optimize analytical scans.

None of those sentences is a role. They say what a product provides; the role
is what a system decides to believe it for. The same in-memory store is an
acceleration layer where a design says so and a system of record where no
design says anything.

## A media product where only two of four stores are authorities

A media product stores accounts and metadata in PostgreSQL, bytes in object
storage, search documents in OpenSearch, and short-lived hot summaries in
Redis. An outbox drives projections. Only the relational and object stores are
authorities; other stores are monitored and rebuildable.

Read the four stores against the six roles and two never come up: nothing here
is an analytical copy or a delivery log. The remaining four line up one to one,
and the last sentence says which two may be believed.

Monitored and rebuildable is a pair of obligations rather than a demotion:
somebody watches those two, and somebody can rebuild them from what the
authorities hold. Both obligations attach to the two stores that are not
authorities.

::activity{id="data-technologies-mat1"}

## What a second store multiplies

Managed services reduce operational work while increasing provider dependency
and cost structure. One relational database handles more workloads than
category marketing suggests; specialized systems are justified by measured
access or isolation needs. Replication improves read scale or recovery but
introduces lag. Polyglot persistence multiplies security, schema evolution,
backup, and expertise.

The middle claim decides how many stores a system ends up with. A specialized
system is justified by measured access or isolation needs — measured, which
makes the justification evidence rather than a category name. The last claim
prices the alternative: polyglot persistence multiplies security, schema
evolution, backup, and expertise — four bills paid again for every store
added.

Replication sits between the two: not another product, and still a source of
lag a replica's reader has to be told about.

::activity{id="data-technologies-mc1"}

## The cheapest question to ask of a store you already have

The cheapest check is not a property of any product. It is whether every store
has a role and a rebuild strategy written down, which costs a conversation.

Four of this lesson's failures are what that missing sentence looks like later.
A cache becomes authoritative: an acceleration layer believed as a system of
record. Search receives dual writes without reconciliation: a projection with
two sources and no way to say which is right. Queue retention is shorter than
recovery time: a delivery log whose retention was never specified against the
recovery it must survive. Object metadata and database rows drift: two
authorities holding halves of one fact.

The fifth is different in kind. Teams assume “distributed” means automatically
consistent and available under every partition — not a missing role but a
belief about what a product does for free.

So the opening scene answers itself. The customer's plan is wrong in one place
and right in another, and the question is not which store is correct but which
was ever supposed to be. That is one line per store.

## Sources

- PostgreSQL Global Development Group, [Documentation](https://www.postgresql.org/docs/current/) (accessed 2026-07-18) — relational schemas, transactions, indexes, and SQL
- Oracle, [MySQL Reference Manual](https://dev.mysql.com/doc/refman/8.4/en/) (accessed 2026-07-18) — relational schemas, transactions, indexes, and SQL
- MongoDB, [Data Modeling](https://www.mongodb.com/docs/manual/data-modeling/) (accessed 2026-07-18) — document aggregates at the center of the model
- Redis, [Data types](https://redis.io/docs/latest/develop/data-types/) (accessed 2026-07-18) — in-memory data structures used for caching and coordination
- Elastic, [Elasticsearch Reference](https://www.elastic.co/docs/reference/elasticsearch) (accessed 2026-07-18) — search indexes built over documents
- OpenSearch, [Documentation](https://docs.opensearch.org/latest/) (accessed 2026-07-18) — search indexes built over documents
- Apache Kafka, [Introduction](https://kafka.apache.org/documentation/#intro_concepts_and_terms) (accessed 2026-07-18) — partitioned retained logs for event streams
