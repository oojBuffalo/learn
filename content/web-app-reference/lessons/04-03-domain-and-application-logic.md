---
id: domain-and-application-logic
title: "Domain and Application Logic"
summary: Why a rule that a screen enforces is not a rule the application has, and where business behavior has to live to survive a second caller.
objectives:
  - Separate rules that must stay true from the workflow that keeps them true
  - Judge whether an abstraction between policy and storage is earning its place
  - Decide which parts of a workflow belong inside one transaction and which do not
estimatedMinutes: 12
difficulty: intermediate
prerequisites: [clients-servers-and-resources, data-fetching]
tags: [backend]
---

## The rule the form enforced and nothing else did

An expense screen will not let an approver approve their own expense. The button
is disabled, the message is clear, and for a year nobody gets past it. Then an
administrative tool approves one, and so does a scheduled job, and the rule
turns out to have been a property of one screen.

A rule enforced only in the UI is bypassed by another client. That is not a
prediction; it is what happens the first time a second caller exists, and every
system that lives long enough grows one.

## Rules that stay true regardless of interface

Domain logic expresses rules that make the application meaningful. Application
logic coordinates those rules with persistence, identity, time, and external
systems. The two are worth separating because they answer different questions:
what must be true, and what has to happen in what order for it to stay true.

Transport and database details should not be the only place business behavior
exists. When they are, the rules sit wherever somebody last needed them, and the
behavior of the application is whatever falls out of the plumbing.

Explicit logic preserves invariants across HTTP handlers, jobs, administrative
tools, and future interfaces. That list is the answer to the opening scene: four
callers, one rule, and the rule only survives all four if it lives somewhere
none of them own.

## What sits between the adapter and the database

This layer sits between delivery concerns such as HTTP and technical concerns
such as SQL or message brokers, keeping dependencies directed toward application
policy. It names operations in the vocabulary of the problem, so the code says
what the business says.

```text
adapter input
  → application use case
  → domain decisions
  ↘ ports for data, time, messages, external services
```

A use case owns the workflow; domain objects or functions own rules that remain
true regardless of interface. The last arrow matters most: ports for data, time,
messages, and external services point outward from the policy, not into it.

The vocabulary underneath is small. Commands express requested effects; queries
retrieve views. Value objects represent validated concepts such as money or
email addresses. Entities carry identity across change. Policies decide
eligibility. Repositories or ports hide storage operations when that separation
adds value. Domain events record facts that other behavior may react to.

::activity{id="domain-and-application-logic-mc1"}

## `approveExpense`, and the callers it has to survive

`approveExpense` loads an expense, checks that the approver is different from
the submitter and within an approval limit, records approval, and schedules
notification after commit.

Read the checks first: both are the opening scene's rule, now living somewhere
the screen does not own. Read the last clause second. Notification is scheduled
*after* commit, because a notification about an approval that did not commit is
a statement about nothing.

That ordering generalizes. Strong invariants often belong inside one
transaction, since an invariant enforced across two commits is enforced nowhere
in between. Cross-system processes require explicit intermediate states and
compensation, because there is no single commit for the crossing part to hide
inside.

Then the sentence that settles the whole lesson: HTTP maps input to the command,
and a worker could invoke the same use case without duplicating rules. The HTTP
handler has been demoted to a translator with no opinion about approval limits,
which is exactly why the worker gets the same behavior without asking for it.

::activity{id="domain-and-application-logic-ms1"}

## Rich models, procedural services, and abstractions that pay for themselves

Rich models colocate state and rules, which is what you want when the rules
belong to one thing. Procedural services can be clearer for workflows spanning
many entities, where insisting that some object own the workflow produces an
object whose only subject is other objects.

Abstractions protect stable business language but are wasteful when they merely
rename a database call. Repositories or ports hide storage operations when that
separation adds value — *when*, not always, and the conditional is the whole
guidance.

The failure modes are the same choices made without noticing. Anemic models
scatter rules through controllers. Generic “manager” services accumulate
unrelated behavior. Database schemas leak into public APIs, so an internal
shape becomes a promise to every client.

::activity{id="domain-and-application-logic-mc2"}

## The verdict on the rule the form enforced

Back to the approval nobody could make, and then two callers could.

Was the screen wrong to enforce the rule? No — it was wrong to be the only place
that did. Was the fix a matching check in the administrative tool? Also no: that
is the same mistake with a second owner, and the scheduled job would still get
through.

What actually went wrong is that the rule was a property of an interface rather
than of the application. Anemic models scatter rules through controllers, and a
rule living in a form is that fault one layer further out still.

`approveExpense` is the repair. The approver-and-limit check is a domain
decision, the workflow is a use case, and HTTP is a translator that maps input
to a command. Explicit logic preserves invariants across HTTP handlers, jobs,
administrative tools, and future interfaces — including the interface nobody has
written yet, which is the one caller the form could never have been checked
against.

## Sources

- Robert C. Martin, [The Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html) (2012) — this layer keeps dependencies directed toward application policy
