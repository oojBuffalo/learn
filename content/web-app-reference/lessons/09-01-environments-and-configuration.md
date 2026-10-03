---
id: environments-and-configuration
title: "Environments and Configuration"
summary: Why a change can pass in staging and behave differently in production with nobody having touched the code, and what the one-artifact rule actually promises about the two contexts.
objectives:
  - Read an environment as a context with its own identities, data, dependencies, policies and capacity
  - Hold the rule that one immutable artifact is built and everything that varies is bound to it later
  - Price staging fidelity, dynamic configuration, flags and per-developer contexts as purchases rather than practices
estimatedMinutes: 12
difficulty: intermediate
prerequisites: [reliability-and-performance]
tags: [delivery-and-operations]
---

## The staging pass that did not survive promotion

A change is exercised in staging and behaves exactly as intended. The same
change reaches production and behaves differently. Nobody edited the code in
between, and the build was not repeated.

Environment drift makes a tested artifact behave differently after promotion —
one of the failure modes named here, and the one that makes a staging pass
worth less than it looked. The run was evidence about staging.

## One artifact, and every varying value bound to it later

An environment is a running context with particular identities, data,
dependencies, policies, and capacity. Configuration supplies values that vary
across deployments without changing the built artifact.

Read the second sentence as a constraint on the first. Whatever differs between
two environments has to arrive as a value, because the thing being promoted is
not allowed to change. The Twelve-Factor App puts the rule directly: build one
immutable artifact, and bind environment-specific configuration at deployment
or startup. Configuration is then typed, validated input to the application
rather than something edited in place.

What the separation is for is stated plainly. Clear separation makes releases
reproducible, prevents environment-specific code branches, and limits
accidental access across development, test, staging, and production. Read the
middle one against the rule above: a branch on the environment name inside the
code is the artifact differing after all.

## What delivers a value, and what refuses to start

Environment variables, files, or configuration services deliver values. Secret
managers deliver credentials separately, which keeps a credential out of the
thing being promoted. Startup validation rejects missing or malformed settings.
Feature flags separate release of code from activation of behavior.

Environment identity is the one of these a name can imitate. It is enforced
through accounts, networks, and permissions, not naming convention alone. A
prefix on a name is a label. An account that cannot reach the production
database is a boundary.

::activity{id="environments-and-configuration-fb1"}

## The same image in two places, with two identities

The same image runs in staging and production. Each workload identity can read
only its own database and secrets. Startup validates endpoints and limits,
emits a redacted configuration fingerprint, and fails before accepting traffic
if required values are absent.

Read it clause by clause. The single image is the immutable artifact, promoted
rather than rebuilt. The per-workload identity is environment identity enforced
through accounts and permissions rather than through a name, and it is what
keeps staging from sharing a database with production. Validating endpoints and
limits is startup validation rejecting missing or malformed settings, and
failing before accepting traffic is what makes the rejection matter: a process
that starts and then serves wrongly has already been trusted.

The redacted fingerprint corresponds to none of the mechanisms above. It
neither delivers a value nor refuses one. It records which configuration this
instance actually came up with, without printing what the values were.

::activity{id="environments-and-configuration-ms1"}

## Rehearsal, speed, and branches that need owners

Production-like staging improves rehearsal but is costly and still differs in
traffic and data. That last clause limits the rehearsal rather than the spending:
staging can match production in every managed dimension and still be asked
different questions by different people.

Dynamic configuration enables rapid response but makes state harder to
reproduce. Flags reduce rollout risk while adding branches that need owners and
expiry. Per-developer environments isolate work but increase provisioning and
cleanup.

None of those four is a practice to adopt. Each names something bought and
something charged, and the charge lands on a different account every time:
money for the rehearsal, reproducible state for the rapid response, owners and
expiry for the reduced rollout risk, and provisioning and cleanup for the
isolation. A stale flag becoming permanent architecture is what happens when
the third charge is never paid.

::activity{id="environments-and-configuration-mc1"}

## The verdict on the staging pass

Was the staging run worthless? No. It was evidence about a running context with
particular identities, data, dependencies, policies, and capacity, and
production is a different one of those.

Was the artifact at fault? Not by itself. Several failure modes here do put the
problem inside what was promoted: the build embeds production credentials, or
defaults silently enable unsafe behavior. Neither of those is drift. Drift is
the case where the artifact is identical and the contexts are not.

So what differed? Something that was not a bound configuration value — the
identities, data, dependencies, policies, or capacity that make an environment
that environment. This is why the one-artifact rule is worth stating so
narrowly. It does not promise the two contexts are alike. It promises that
everything meant to differ arrives as a value you can name, look at, and reject
at startup.

That turns the opening question into a smaller one. Instead of asking why
production broke, the team can ask which value differed, and whether anything
was ever in a position to refuse it. If nothing validated endpoints and limits
on the way up, the fingerprint in the example is the record they do not have.

## Sources

- Adam Wiggins, [The Twelve-Factor App: Config](https://12factor.net/config) (2011; accessed 2026-07-18) — building one immutable artifact and binding environment-specific configuration at deployment or startup
