---
id: threat-modeling
title: "Threat Modeling"
summary: Why a thorough security document stops protecting anything without a single word of it becoming false, and what has to be attached to a threat before it counts as handled.
objectives:
  - Read a threat model as a repeatable design activity rather than a finished document
  - Work from data-flow boundaries to abuse cases to controls with named owners
  - Choose modeling depth and lens against the value of the flow being examined
estimatedMinutes: 12
difficulty: intermediate
prerequisites: [anatomy-of-a-web-app, api-design]
tags: [security]
---

## The model nobody had reopened

A team has a threat model. It was written during design, it is thorough, and it
is filed. Since then the system gained a path the diagram does not show, and
the threat list still reads well: every entry names a threat and not one names
a person.

Nothing on that page is false about the system it described. It is no longer
describing this one. Diagrams drift after architecture changes, and threats get
listed without owners and verification — two failure modes named here, inside a
document that looks finished.

## Five questions, asked again every time

Threat modeling identifies valuable assets, trust boundaries, plausible
attackers, abuse paths, and controls before incidents reveal them. It is a
repeatable design activity, not a one-time document — the sentence the opening
scene mislaid.

The practice focuses security effort on how this system can fail rather than on
a generic checklist alone. A checklist travels between products, which is
exactly its limit: it knows nothing about where your data crosses trust.

The model is a set of questions rather than a page. What are we protecting? Who
could act? Where does data cross trust? What can they cause? Which prevention,
detection, and recovery controls reduce likelihood or impact?

Threat models span browser, edge, backend, data, build, operations, people, and
third parties, and every data-flow boundary can change trust or privilege —
which is why the third question is never answered once.

## From a diagram to an owner

This lesson sets the mechanisms out in the order the source writes them.

Data-flow diagrams expose processes, stores, external actors, and boundaries.
Abuse cases describe attacker goals. Structured categories prompt review of
impersonation, tampering, repudiation, disclosure, denial of service, and
privilege escalation, so a review covers six kinds of harm rather than the ones
the room happens to fear.

Controls are assigned owners and verified through tests, monitoring, or
operational drills. Two demands, and the opening scene met neither: an owner
answers for the control, and verification separates a control from a paragraph
about one.

Residual risk is recorded rather than implied away, because a risk nobody wrote
down is indistinguishable from a risk nobody found.

::activity{id="threat-modeling-ord1"}

## A file-sharing product, boundary by boundary

For file sharing, assets include file content, access lists, and audit history.
Boundaries include browser upload, object storage, share links, preview
workers, and email. Threats include guessed links, malicious file parsing,
stale permissions, and resource exhaustion.

Take the four threats one at a time. A guessed link is an attacker acting
without ever holding an account. Malicious file parsing needs something to
parse it, and the boundary list already names preview workers. Stale
permissions are an access list that stopped matching the people it names.
Resource exhaustion arrives through the same upload path as everything
legitimate.

Then the clause that closes the example: controls and telemetry attach to each
path. Not to the product and not to the document — to each path. A control in
documentation but not on every entry point is a failure mode named here, and
per-path attachment is what makes its absence visible.

::activity{id="threat-modeling-ms1"}

## How deep to model, and which lens to look through

Model high-value flows deeply and ordinary flows lightly. Depth is a budget
rather than a standard.

Three lenses answer different questions.

| Lens | What it highlights |
| --- | --- |
| Asset-centered | impact |
| Attacker-centered | capabilities |
| System decomposition | boundary mistakes |

Nothing says to pick one: a model that only ever asks about impact will keep
missing the boundary the diagram never drew.

Controls can reduce probability, blast radius, detection time, or recovery
time. Four levers, and not interchangeable: shortening detection time changes
nothing about the chance of the event, only what it costs.

Security friction should be proportional to risk and usable enough that people
do not bypass it.

## The cheapest question to ask a threat model you did not write

This lesson sorts them by what an answer costs: what a document settles about
itself first, then what needs the system.

Does the diagram match the architecture? Diagrams drift after architecture
changes, and the check is two things laid side by side. The opening document
fails here, which is why its problem was never hard to find — only never looked
for.

Does every threat have a name against it? Threats listed without owners and
verification show in the list itself: you are checking for a column, not a
judgment.

Who is on the actor list? Teams model only anonymous internet attackers and
ignore insiders and compromised dependencies, and reading who was considered
costs no more than reading what was.

Then the two that need real work. A control exists in documentation but not on
every entry point, which means enumerating entry points rather than reading a
page. And availability and integrity threats receive less attention than
confidentiality — not a lookup but a judgment about how a whole model spent its
attention.

::activity{id="threat-modeling-mc1"}

## Sources

- OWASP, [Threat Modeling Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Threat_Modeling_Cheat_Sheet.html) (accessed 2026-07-18) — structured categories prompting review of impersonation, tampering, repudiation, disclosure, denial of service, and privilege escalation
