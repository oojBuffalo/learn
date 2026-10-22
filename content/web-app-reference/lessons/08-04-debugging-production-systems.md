---
id: debugging-production-systems
title: "Debugging Production Systems"
summary: Why the fix that clears a symptom fastest is often the one that removes the answer, and what a method gives you that a sequence of plausible changes does not.
objectives:
  - Work a production failure as evidence-guided reduction of uncertainty under safety constraints
  - Bound impact and recent change before forming a hypothesis, then pick the check that discriminates
  - Weigh each investigative tool against what it costs in money, auditability, state or overhead
estimatedMinutes: 12
difficulty: intermediate
prerequisites: [scaling-and-resilience, third-party-integrations]
tags: [quality-and-observability]
---

## Two alerts, and the loud one got the restart

Two alerts are firing and one of them is louder. Somebody restarts the service
behind it. The symptom clears, and then it comes back. Somebody else raises a
pool size, disables a feature flag, and ships a configuration change in one go.
The graph moves.

Nobody can now say which of the three moved it, or whether the loud alert was
the one users felt. Teams debug the loudest alert rather than user
impact and change several variables together — two failure modes named here,
and the second one spent the answer to the first.

## Evidence-guided reduction of uncertainty

Production debugging is evidence-guided reduction of uncertainty under safety
constraints. The goal is to restore service, preserve evidence, and test
hypotheses without expanding impact.

Three goals, and not automatically compatible: restoring service quickly is
frequently the same act that removes the evidence.

The method is a sequence. Observe the symptom. Bound affected users and time.
Identify recent changes. Map the dependency path. Form a falsifiable
hypothesis. Choose the safest discriminating check. Then mitigate or continue.

This lesson leans on two words there. A falsifiable hypothesis is one a check
can come back against; a discriminating check separates the hypotheses rather
than adding output.

Debugging connects alerts, deploy history, logs, metrics, traces, profiles,
feature flags, runtime state, and incident coordination.

::activity{id="debugging-production-systems-ord1"}

## What the dashboards, traces and comparisons each expose

Golden-signal dashboards reveal latency, traffic, errors, and saturation.
Distributed traces expose slow or failing spans. Structured logs provide event
detail. Differential comparison contrasts healthy and unhealthy cohorts,
versions, regions, or tenants.

Differential comparison is the only one of those four that produces nothing on
its own. Dashboards, traces and logs each report; a comparison needs a healthy
side and an unhealthy side, and reports the difference.

Safe mitigations include rollback, traffic shift, feature disablement, and load
shedding. This lesson groups them as safe against restarting, which clears
symptoms quickly and destroys state.

## One region, one release, one pool

Checkout latency rises only in one region after a release. Metrics show
database pool saturation, traces show connection wait, and configuration diff
reveals a reduced pool. Traffic shifts away while the prior configuration is
restored; a later review adds a saturation alert and rollout check.

Follow which step each clause is doing. “Only in one region” is
the bound on affected users and a differential comparison at once: one region
is unhealthy and the others are not. “After a release” is identifying recent
changes. Pool saturation on the golden signals and connection wait in the
traces map the dependency path. The configuration diff is the discriminating
check — a reduced pool explains both observations, and the diff can come back
either way.

The mitigation is two of the safe ones together: traffic shifts away, and the
prior configuration is restored, which this lesson's list would call a
rollback. The review afterward adds a saturation alert and a rollout check —
one for the signal nobody was watching, one for the change that moved it.

::activity{id="debugging-production-systems-mc1"}

## Powerful, auditable, and what a restart takes with it

Detailed telemetry improves diagnosis but costs money and privacy budget.
Interactive production shells are powerful but difficult to audit, and
purpose-built read-only tools are safer. Restarting clears symptoms quickly but
destroys state and can hide leaks. Capturing profiles adds evidence but must
have bounded overhead.

Each of those four buys something and charges for it. Telemetry buys diagnosis
and charges money and privacy budget. A shell buys reach and charges
auditability. A restart buys speed and charges the state. A profile buys
evidence and charges overhead, which is why the overhead has to be bounded.

The named failures add two ways the evidence itself misleads — clock skew and
sampling mislead timelines — and one way the exit is blocked: rollback fails
because data migrations or flags were not backward compatible. Teams also query
production stores without limits or expose customer data in copied logs.

::activity{id="debugging-production-systems-ms1"}

## The verdict on the loud alert and the restart

Back to the two alerts and the restarted service.

Was the restart wrong? It did what this lesson says it does: cleared the
symptom quickly. It also destroyed state and can hide leaks, and the symptom
returned — so it bought a pause and spent whatever the process was holding.

Was the loud alert the wrong place to start? The method does not start at an
alert. It starts by observing the symptom and bounding affected users and time.
Teams debug the loudest alert rather than user impact, and loudness is a
property of the alert, not of the harm.

Could anyone say which change fixed it? No — that is the whole cost of changing
several variables together. The graph moved; the evidence names no cause.

What would have made this ordinary is in the worked example. Bound the users
and the time, identify the recent change, then run one check that can come back
either way. The region, the release and the configuration diff are that shape.

## Sources

- Google, [Site Reliability Engineering: Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/) (accessed 2026-07-18) — golden-signal dashboards revealing latency, traffic, errors, and saturation
