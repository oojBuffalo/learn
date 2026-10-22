---
id: migrations-backups-and-recovery
title: "Migrations, Backups, and Recovery"
summary: Why a deploy that is only half out can read a column that is not there yet, and what a run of green backup jobs has never once proved.
objectives:
  - Plan a schema change on the assumption that two code versions run at once
  - Separate having backups from having demonstrated a recovery
  - Price backward compatibility, downtime and backup frequency against each other
estimatedMinutes: 12
difficulty: intermediate
prerequisites: [domain-and-application-logic]
tags: [data]
---

## The release that read a column before it existed

The deploy is halfway out. Two versions of the application are live at once, and
a share of requests fail on a column that has not been added everywhere yet.
Retrying sometimes works, which is the part that makes it hard to read: the same
request succeeds or fails depending on which version answers it. Neither version
of the code is wrong. What is wrong is the assumption underneath the release:
that code and data change at the same instant.

Durable systems must change without assuming all code and data update atomically.
An application release reading a column before it exists everywhere is one of
this lesson's named failure modes, and versions overlapping is exactly when it
becomes possible.

## Three jobs, and the one that has to be proved

Migrations evolve live data and schemas. Backups preserve recoverable copies.
Recovery turns those copies and logs into a working service within explicit time
and data-loss objectives. Hold on to “explicit”: with no stated objectives,
having backups is a fact about storage rather than a claim about service.

Two obligations follow. Durable systems must change without assuming all code and
data update atomically, and they must prove that loss or corruption can be
repaired. Prove, not intend.

These practices connect application releases, database administration, storage
policy, incident response, and compliance. They are part of application behavior
whenever versions overlap — the opening scene, restated as a rule.

## Expand, migrate, contract

The pattern is expand–migrate–contract: first add a backward-compatible shape,
then move readers and writers and backfill data, then remove the old shape after
no active version depends on it.

Read that last condition literally. “After no active version depends on it” is a
statement about what is running, not about what has been released.

Schema migrations are versioned, ordered changes. Online migrations avoid long
exclusive locks and bound backfills — two protections against two named failure
modes: a migration locking a hot table, and a backfill overwhelming replicas.
Dual-read or dual-write transitions need an authority and reconciliation.

Backups differ in what they can return you to: full, incremental, and log-based
backups offer different recovery points. And restore drills verify credentials,
tooling, integrity, and elapsed time — not merely that backup jobs report success.

::activity{id="migrations-backups-and-recovery-mc1"}

## Replacing `full_name`

To replace `full_name`, add nullable `given_name` and `family_name`, deploy code
that writes both formats and reads new with old fallback, backfill in bounded
batches, verify counts, switch reads, stop old writes, and only later remove the
old column.

Seven steps, and only the first and the last touch the schema. Everything between
them is about which code is running and what the data currently looks like, which
is why the pattern carries three names rather than one.

Read the fallback in the second step. Code that writes both formats and reads new
with old fallback is the version that can run beside the old code, so the deploy
no longer depends on every running version changing at the same moment.

Then read the instruction that sits apart from the sequence: practice restoring a
pre-migration backup separately. Separately, because a rollback cannot always
interpret newly written data, and the backup is what is left once the path forward
and the path back have both run out.

::activity{id="migrations-backups-and-recovery-ord1"}

## Temporary complexity, or downtime, or cost

Backward compatibility increases temporary complexity but supports safe rolling
deploys. In-place destructive changes are simple only when downtime is acceptable
— “only when” is the entire clause. The simplicity is real, and it is bought.

Frequent backups reduce potential loss while increasing cost. Multi-region
replicas improve availability but can replicate corruption, while independent
backups preserve earlier states. Read those as answers to different questions
rather than as alternatives: one keeps a service available, the other keeps a
state you can return to.

::activity{id="migrations-backups-and-recovery-ms1"}

## The two decisions to make before a migration ships

Two decisions, and both are made before anything ships.

The first is whether this change will be backward compatible. Compatibility buys
safe rolling deploys and costs temporary complexity: two shapes in the schema,
two write formats in the code, and a removal step somebody has to come back for.
The in-place destructive change costs downtime instead — simple, honest, and
often unavailable.

The second is what you are willing to lose. Recovery is defined by explicit time
and data-loss objectives, and everything else is priced against them. Frequent
backups reduce potential loss while increasing cost. Multi-region replicas improve
availability but can replicate corruption. Untested backups may be incomplete,
encrypted with unavailable keys, or too slow to meet recovery objectives — three
ways to fail, and a backup job that reports success reports none of them.

The bill is the same in both halves: work done while nothing is wrong.
Expand–migrate–contract is slower than one destructive change. A restore drill is
time spent on an outage that has not happened. The half-finished deploy in the
opening scene is what that bill looks like when nobody paid it.

## Sources

- PostgreSQL Global Development Group, [Backup and Restore](https://www.postgresql.org/docs/current/backup.html) (accessed 2026-07-18) — full, incremental, and log-based backups offer different recovery points
