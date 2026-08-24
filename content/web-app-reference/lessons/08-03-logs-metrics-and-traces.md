---
id: logs-metrics-and-traces
title: "Logs, Metrics, and Traces"
summary: Why a system carrying three kinds of telemetry can still leave nobody able to say which users are affected, and which of those questions can be settled by reading a single line.
objectives:
  - Hold logs, metrics and traces as answers to different questions rather than as three copies of the same data
  - Follow the identifiers and propagation that turn separate signals into one story
  - Order telemetry problems by what an answer costs, from one log line to the system under load
estimatedMinutes: 12
difficulty: intermediate
prerequisites: [scaling-and-resilience, third-party-integrations]
tags: [quality-and-observability]
---

## The alert that could not say who was affected

An alert fires. The metric behind it went up, the logs for that minute are
English sentences somebody wrote by hand, and the trace ends where the request
was put on a queue and resumes on the far side as something unrelated.

Nothing is down, and nothing is answerable either. Free-form logs cannot be
queried reliably and missing context breaks traces at queues — two failure
modes named here, and between them they explain how a system with three kinds
of telemetry still cannot say which users this touched.

## Four questions, four kinds of answer

Logs record discrete events, metrics aggregate measurements, and traces connect
work across a request or workflow. Together they provide complementary views of
a running system.

The split is easiest to hold as four questions. Metrics answer “how much or how
often?” Logs answer “what event occurred?” Traces answer “where did this
operation spend time and fail?” Profiles can answer “which code consumed
resources.”

The fourth is the only one hedged. Metrics, logs and traces answer; profiles
can answer, and what they answer about is code rather than a request.

Telemetry should answer operational questions and connect symptoms to affected
users and dependencies without collecting secrets or unbounded data. Read those
two halves together and they pull against each other: connecting a symptom to a
user wants an identifier, and not collecting unbounded data wants fewer of them.

## What carries a signal across a boundary

Instrumentation exists in browsers, edges, applications, data systems, queues,
and platforms. Context propagation connects signals across boundaries, and
OpenTelemetry defines common concepts for signals, instrumentation, and
propagation.

Structured logs use stable event names and typed fields. Counters, gauges, and
histograms aggregate measurements. Trace spans carry parent relationships,
duration, status, and attributes. Correlation identifiers link signals.
Sampling bounds cost. Semantic conventions make common operations comparable.

Two of those six are about joining rather than recording. A parent relationship
on a span says which work this work belongs to. A correlation identifier says
which other signals describe the same thing. Propagation is what moves either
of them across a boundary the request does not stay inside. Sampling and
semantic conventions do neither job: one bounds what all this costs, the other
makes common operations comparable.

::activity{id="logs-metrics-and-traces-sa1"}

## One upload, and everything it declines to record

An upload emits a request-rate and error metric, a trace spanning
authorization, object storage, and database work, and a structured
`upload.completed` log with object ID and trace ID. No token, file content, or
unrestricted filename is recorded.

Read that last sentence as part of the design rather than as a caveat. Secrets
and personal data entering telemetry is a named failure, and this example is
partly a list of what stayed out.

The trace ID in the log is the join. It is a correlation identifier: the log
line says what event occurred, the trace says where the operation spent time,
and the identifier is what lets one be read against the other. The object ID
names what the upload produced. The unrestricted filename, which arrives with
the file, does not appear at all.

::activity{id="logs-metrics-and-traces-fb1"}

## Cardinality, sampling, and how long you keep it

High-cardinality identifiers are useful in traces and logs but expensive as
metric dimensions; OpenTelemetry notes that cardinality drives metric memory
cost. That is one identifier with two different prices, and which price you pay
depends only on the signal it lands in.

Head sampling decides early; tail sampling retains interesting completed traces
at greater infrastructure cost. The difference is when the decision happens:
one before the trace exists, one after it is complete and can be judged
interesting.

More retention improves investigation but raises privacy and storage
obligations.

## What to read first when the telemetry cannot answer you

Order these by what an answer costs rather than by how bad each would be.

Start with one log line. Does it have a stable event name and typed fields?
Free-form logs cannot be queried reliably, and a single line settles that.

Read the same line for a correlation identifier. Without one, the signals are
three separate accounts of the same minute with nothing joining them.

Then read definitions rather than data. What dimensions does the metric carry?
User IDs or raw paths explode metric cardinality. What is the alert defined
over? Alerts fire on infrastructure noise instead of user harm, and the
definition is where that shows.

The rest costs more. Whether context survives a queue needs both sides of the
boundary in front of you. Whether secrets or personal data are in there means
searching the data itself. And whether instrumentation itself blocks requests
or consumes unbounded resources is a question about the running system under
load.

The opening telemetry fails the first check on this list and one of the
expensive ones: the logs are free-form, and the trace does not survive the
queue. That is the cheapest possible finding and the least satisfying one.

::activity{id="logs-metrics-and-traces-mc1"}

## Sources

- OpenTelemetry, [Concepts](https://opentelemetry.io/docs/concepts/) (accessed 2026-07-18) — common concepts for signals, instrumentation, and propagation
- OpenTelemetry, [Metrics: Cardinality limits](https://opentelemetry.io/docs/concepts/signals/metrics/#cardinality-limits) (accessed 2026-07-18) — cardinality driving metric memory cost
