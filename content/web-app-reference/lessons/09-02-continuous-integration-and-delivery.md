---
id: continuous-integration-and-delivery
title: "Continuous Integration and Delivery"
summary: Why a rollout can satisfy every instance that reports on itself and still be advancing a release users are already suffering, and which signal was supposed to settle that gate.
objectives:
  - Follow a change along the commit-to-promotion ladder and say what each stage preserves
  - Separate admission from promotion, and deployment from release, as different decisions with different evidence
  - Read an inherited pipeline cheapest-check-first, from an artifact tag to the signals at its last gate
estimatedMinutes: 12
difficulty: intermediate
prerequisites: [reliability-and-performance]
tags: [delivery-and-operations]
---

## The rollout that every instance approved

A new artifact is live for a small cohort. Every instance reports itself ready,
the infrastructure graphs are clean, and the pipeline advances the release.
Support hears about the change before the graphs do.

Green infrastructure health masks user failure — a failure mode named here, and
it describes a pipeline that asked the wrong question at its last gate. The
instances answered honestly. They were answering about themselves.

## Build once, then move the same thing

Continuous integration merges small changes into a shared line with automated
feedback. Continuous delivery keeps a verified artifact deployable through
controlled promotion. Deployment and release may occur at different times.

That third sentence reorganizes the other two: if putting code in place and
switching behavior on are separable events, a pipeline is not one lever.

```text
commit
  -> verify
    -> build once
      -> identify artifact
        -> deploy
          -> observe
            -> promote or roll back
```

Read it downward. Every later environment receives the same artifact with
different configuration, which makes building once a rule rather than an
optimization: a second build produces a second artifact, and what was verified
is no longer what is deployed.

The pipeline exists to shorten feedback, preserve artifact identity, automate
policy, and make change safer to observe and reverse. The second of those is
the fourth rung of the ladder restated as a purpose.

::activity{id="continuous-integration-and-delivery-ord1"}

## Checks, provenance, strategies, and two kinds of signal

Required checks validate structure, tests, security policy, and compatibility.
Reproducible builds produce immutable artifacts, and release provenance
protects the software supply chain, the concern NIST's Secure Software
Development Framework addresses.

Deployment strategies include rolling, blue-green, and canary rollout. Feature
flags decouple exposure. Backward-compatible migrations support overlapping
versions, which is what lets two versions answer at once during a rollout.

Two signals sit at different gates and are not interchangeable. Health checks
govern admission: they decide whether an instance may take traffic at all.
User-facing signals govern promotion: they decide whether this artifact goes
further.

## One change, one cohort, one comparison

A change passes Markdown validation, unit and integration tests, builds an
identified artifact with provenance, deploys to a small production cohort, and
compares error and latency objectives. The pipeline promotes automatically or
restores the previous artifact; feature activation remains separately
controllable.

Read it against the ladder. The validation and the tests are the verify rung,
which required checks cover. Building an identified
artifact with provenance covers two rungs at once, build and identify. The
small production cohort is the canary rollout named above. Comparing error and
latency objectives is the observe rung, and a user-facing signal rather than
an instance reporting on itself. Promoting automatically or restoring the
previous artifact is the last rung, both of its branches.

The final clause belongs to none of the rungs. Feature activation remaining
separately controllable is exposure decoupled by a flag, still adjustable after
the artifact has stopped moving.

::activity{id="continuous-integration-and-delivery-mc1"}

## Fast gates, automatic deployment, and approval that becomes ritual

Fast checks enable frequent integration; expensive suites can run at later
gates without making the main line unknowable. Automatic production deployment
reduces queueing but requires trustworthy rollback and observability. Manual
approval adds judgment for high-risk changes but can become ritual. Canary
rollout limits blast radius while requiring cohort-aware metrics.

Two of those four name something you must already have before the choice is
even available: automatic deployment requires trustworthy rollback and
observability, and canary rollout requires cohort-aware metrics. The other two
decide where a cost falls — early or late among the checks, and on a person or
on nobody.

Trustworthy rollback is the requirement that can be quietly untrue. Rollback is
impossible after a destructive migration, so the demand reaches back into the
migration that shipped beside the code.

::activity{id="continuous-integration-and-delivery-sa1"}

## The cheapest thing to check first in a pipeline you inherited

Order these by what it costs to find out, not by how bad each is.

Start with how the artifact is named. Pipelines use mutable tags, and a name
that can be repointed means the artifact identity the ladder was meant to
preserve is not. One look settles it.

Then count the builds. Pipelines rebuild per environment, which is the same
defect by a different route: what was verified and what runs are two artifacts
that happen to share a commit.

Then read what the pipeline holds and what it agrees to run. Pipelines hold
broad credentials, or run untrusted pull-request code with secrets. Both are
legible in configuration, if slower to read than a name.

The rest needs the running system. Whether green infrastructure health is
masking user failure takes a comparison between what instances report and what
users met. Whether rollback works takes a migration somebody is willing to
reverse. And flaky checks normalize bypasses, which surfaces only in the
history of how often a red result was merged past.

The opening rollout passes every cheap check. It built once, identified the
artifact, and deployed to a cohort. It read the wrong signal at the one gate
where the difference showed.

## Sources

- NIST, [Secure Software Development Framework](https://csrc.nist.gov/projects/ssdf) (accessed 2026-07-18) — release provenance protecting the software supply chain
