---
id: secrets-dependencies-and-supply-chain
title: "Secrets, Dependencies, and Supply Chain"
summary: Why deleting a key from a repository is necessary and not sufficient, and what has to be in place before a vulnerable library is a task rather than an incident.
objectives:
  - Read secrets, dependencies and the supply chain as three routes by which authority reaches production
  - Use short-lived credentials, locked graphs, bills of materials and provenance to keep a response possible
  - Weigh vendoring, automatic updates, pinning and managed builds by the job each one leaves behind
estimatedMinutes: 12
difficulty: intermediate
prerequisites: [anatomy-of-a-web-app, api-design]
tags: [security]
---

## The credential that was in the history all along

A key is removed from the repository. The file is gone, the working tree is
clean, and the change is reviewed and merged.

The key is still in the history. It is also, as it turns out, the same key
staging uses, which is the same key production uses. Secrets enter source
history or logs, and one credential spans environments — two failure modes
named here, and the second is what turns the first from an embarrassment into
an incident.

## Three routes into production

Secrets grant authority. Dependencies import other people's code and release
processes. The software supply chain connects source, build, artifact,
deployment, and update systems, and compromise in any link can become
application compromise.

This lesson reads the three as one subject at three distances. A secret hands
authority over directly. A dependency hands over a decision about what your
process will run. The supply chain is the set of links either travels along.

The goal is to minimize trusted material, limit its authority and lifetime,
verify provenance, and retain a practical response path when components are
vulnerable. Four aims. Read against the other three, the fourth is the only one
written for a case that has already happened: by its wording it applies when
components are vulnerable.

These concerns span developer machines, repositories, CI/CD, registries,
runtime configuration, third-party scripts, package managers, and incident
response.

## Inventory before mechanism

The model starts as an inventory rather than a control list. What enters
production, who can change it, how identity is established, where credentials
exist, and how a compromised version is detected, revoked, and replaced.

Five questions, and the last is three wearing one clause: detection, revocation
and replacement are separate capabilities, and a plan holding two of them stops
short.

Then the mechanisms. Secret managers encrypt values, authenticate workloads,
authorize reads, rotate versions, and audit access. Short-lived credentials
reduce stored secrets, the cheapest form of minimizing trusted material: a
credential that expires is one fewer thing to find later in a history.

Lockfiles and immutable artifact identifiers make dependency resolution
reproducible. Software bills of materials describe included components, and
provenance can connect an artifact to its build process. Automated scanning
prioritizes known risk but does not prove safety.

::activity{id="secrets-dependencies-and-supply-chain-sa1"}

## One deployment, from workload identity to promotion

A deployment authenticates to the cloud through short-lived workload identity,
retrieves only its environment's secrets, installs dependencies from a locked
graph, builds once, records an SBOM, and promotes the same immutable artifact.

Follow the authority through it. The workload identity is short-lived, so no
long-term credential sits anywhere waiting to be found. Retrieving only its
environment's secrets answers one credential spanning environments — the
opening scene's second failure, closed by scope rather than rotation.
Installing from a locked graph makes the resolution reproducible, which is what
lets anyone say afterward what was in there.

Building once and promoting the same immutable artifact means the thing tested
and the thing running are one object; the SBOM says what that object contains.

The payoff is stated as a capability rather than a guarantee: a compromised
library can be located, rebuilt, and rolled out without changing application
configuration. Not prevented. Located.

::activity{id="secrets-dependencies-and-supply-chain-ms1"}

## Vendor, update, pin, or hand it to someone else

Vendoring improves availability and reviewability while increasing update work.
Automatic updates shorten exposure but require strong tests and controlled
rollout. Pinning versions improves reproducibility; teams still need a process
to advance pins. Managed build systems reduce maintenance but remain privileged
dependencies.

Each of the four buys something and leaves a job behind. Vendoring leaves the
update work. Automatic updates leave the tests and the rollout control they
depend on. Pinning leaves the process for moving pins forward. Managed build
systems leave a dependency that is privileged, the one teams stop counting
because it is somebody else's to operate.

::activity{id="secrets-dependencies-and-supply-chain-mc1"}

## The verdict on the credential in the history

Back to the key that was deleted and is still there.

Was deleting it wrong? No, and it was necessary. It was also not sufficient:
secrets enter source history or logs, and history is the part that does not
change when a file does.

Was the incident about that one key? No. One credential spans environments, so
what leaked was not a staging credential that also happens to work in
production. It was production authority that had been living in staging the
whole time.

What would have made this ordinary? Short-lived credentials reduce stored
secrets, so there would have been less to leak and less time to use it.
Retrieving only its environment's secrets would have made the staging copy a
staging copy. And the replacement has to actually work, which is its own named
failure: rotation plans fail when consumers cannot overlap old and new
credentials, so the plan needed testing before the day it was needed.

The rest of the list deserves the same day's attention. CI workflows execute
untrusted code with write tokens. Packages are selected by ambiguous names.
Abandoned dependencies remain because ownership is unclear.

## Sources

- NIST, [Secure Software Development Framework 1.1](https://csrc.nist.gov/projects/ssdf) (accessed 2026-07-18) — software bills of materials describing included components, and provenance connecting an artifact to its build process
