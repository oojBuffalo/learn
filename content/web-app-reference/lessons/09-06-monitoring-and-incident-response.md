---
id: monitoring-and-incident-response
title: "Monitoring and Incident Response"
summary: Why an incident can be closed on a normal-looking graph while the work it damaged is still sitting in a queue, and what the goal of all this actually is if it is not the number of alerts.
objectives:
  - Alert on actionable user-visible symptoms or imminent exhaustion rather than on every error
  - Run an incident as an ordered sequence that ends in verification and follow-up, not in a quiet graph
  - Price alert sensitivity, automated remediation and public communication against what each risks
estimatedMinutes: 12
difficulty: intermediate
prerequisites: [reliability-and-performance]
tags: [delivery-and-operations]
---

## The incident that closed when the graphs came back

An alert clears. The error rate is where it was yesterday, nobody is reporting
anything new, and the response winds down. Somebody writes that the
issue is resolved.

Two days later the effects are still arriving, because the work that piled up
while the service was failing was never drained or checked. Recovery is
declared when metrics normalize but queued work remains corrupt or delayed — a
failure mode named here, and every signal involved was accurate.

## What deserves a page, and what an incident is

Monitoring evaluates signals against expected service behavior. Incident
response coordinates detection, mitigation, communication, recovery, and
learning when impact requires focused action.

The goal is to reduce user harm and recovery time while preserving a clear
operating picture, not to produce the maximum number of alerts. That last
clause rules out the obvious reading of the first: more alerts is not more
monitoring, and an alert nobody can act on has spent attention without buying
anything.

So the rule for what fires is narrow. Alert on actionable user-visible symptoms
or imminent exhaustion. Two admissible cases: something users are meeting now,
and something that will run out shortly.

Both are about consequences rather than causes. A user-visible symptom is
something somebody has already met. Imminent exhaustion is a resource that will
not last long enough, which is a prediction the system makes about itself. An
internal error that produces neither is not on the list.

The incident itself is a sequence. Establish command, bound impact, stabilize,
investigate in parallel, communicate, verify recovery, and capture follow-up
work.

::activity{id="monitoring-and-incident-response-ord1"}

## Burn rate, probes, runbooks, roles, and the record

SLO burn-rate alerts relate recent failure to an error budget — a rate of
spending against a tolerance rather than a tally of individual errors.
Synthetic probes test controlled journeys; real-user monitoring captures actual
experience. Runbooks provide safe first actions. Incident roles separate
coordination, technical response, and communication. Timelines preserve
decisions and evidence. Blameless reviews examine system conditions and control
failures.

Monitoring consumes telemetry from every layer, and incident response connects
on-call ownership, runbooks, change systems, status communication, and
post-incident improvement.

Several named failures attack the operating picture rather than the service.
Dashboards omit deployment markers. Responders make simultaneous undocumented
changes. Monitoring depends on the failed system. Every exception pages
someone, and communication waits for perfect certainty.

::activity{id="monitoring-and-incident-response-ms1"}

## One checkout alert, three people, and a closure that waited

A checkout SLO burn alert pages the service owner. The incident lead declares
scope, one responder disables an optional dependency, another checks the
release diff, and communication reports affected regions. Recovery includes
draining backlogs and verifying payments before closure.

The alert is a burn-rate alert, so what paged somebody was a rate of failure
against a budget rather than an exception. The lead declaring scope is bounding
impact. The two responders are investigating in parallel: one acts on the
system, one reads the change history. Neither of them is the person reporting
affected regions, because incident roles separate coordination, technical
response, and communication.

The final sentence is the hinge. Draining backlogs and verifying payments
before closure is the verify-recovery step done against the work rather than
against the graph, and it is exactly what the opening incident skipped.

## Sensitivity, automation, and telling people early

Sensitive alerts detect earlier but page more falsely. Automated remediation
reduces response time but can amplify incorrect diagnosis. Public status
communication builds trust while requiring verified scope. Postmortems should
prioritize durable risk reduction rather than produce an unowned list.

Two of those four price speed directly. Detecting earlier costs false pages;
responding faster costs the chance that an incorrect diagnosis is amplified
instead of caught. The third prices trust against scope you have checked, which
is the same tension as communication waiting for perfect certainty, seen from
the other side. The fourth is not a tradeoff at all but a standard for the
review afterward.

::activity{id="monitoring-and-incident-response-mc1"}

## The verdict on the closed incident

Was the alert wrong? No. Something users were meeting had crossed a budget, and
it cleared when the service recovered. It was an actionable user-visible
symptom, which is what should have fired.

Was the closure wrong? Yes, and precisely. Verify recovery comes before capture
follow-up work in the sequence, and neither step is satisfied by a graph
returning to where it was. The example verifies against payments and backlogs;
the opening incident verified against the same signal that had raised the alarm
in the first place.

Was somebody at fault? Blameless reviews examine system conditions and control
failures, so the question this lesson asks instead is which control was missing.
Nothing in the described response was ever going to notice queued work, because
nothing was watching it.

What was actually lost? The two days of continuing effects are the recovery
time the whole practice exists to reduce. That is the cost of closing on a
normal-looking graph: not an embarrassment, but the exact quantity named in the
goal.

## Sources

- Google, [Site Reliability Engineering: Practical Alerting](https://sre.google/sre-book/practical-alerting/) (accessed 2026-07-18) — SLO burn-rate alerts relating recent failure to an error budget
