---
id: layers-boundaries-and-coupling
title: "Layers, Boundaries, and Coupling"
summary: Why replacing one payment provider can reach invoice rules and half the callers in a codebase, and what the direction of a dependency is actually promising when it points the way this lesson says it should.
objectives:
  - Read coupling as the knowledge one part must have about another, and locate where that knowledge sits
  - Order interfaces, dependency inversion, adapters, encapsulation and cohesion by what each one contributes to the direction rule
  - Decide when a direct dependency or a duplication is cheaper than the boundary that would remove it
estimatedMinutes: 12
difficulty: advanced
prerequisites: [monoliths-modules-and-microservices]
tags: [architecture]
---

## The provider swap that reached every caller

A payment provider is being replaced. The work was expected to touch the code
that talks to the provider. Instead it opens invoice rules, a long list of
callers, and several places that only ever wanted a total.

Nothing is broken. The swap is simply expensive, and this lesson names the
quantity behind it. Coupling is the knowledge one part must have
about another to change or operate correctly, and every file that had to be
opened was holding some.

## Coupling is knowledge, and knowledge is what has to change

Layers group responsibilities by role. Boundaries define what may cross and in
which direction. Coupling is the knowledge one part must have about another to
change or operate correctly.

Three words, three jobs. A layer is a grouping. A boundary is a
permission with a direction attached. Coupling is neither: a measurement of how
much has to be known.

Good boundaries localize change, protect domain language, and expose important
dependencies without adding ceremony to every function. That last clause is the
brake on the first three.

The direction rule follows. Prefer dependencies that point from volatile
delivery and infrastructure details toward stable application policy. Data
crossing outward is translated into a contract suitable for the receiving
boundary.

::activity{id="layers-boundaries-and-coupling-fb1"}

## Which way the arrows point, and what translates at the edge

Interfaces define permitted interaction. Adapters translate protocols and
schemas. Dependency inversion lets policy specify the capabilities it needs.
Encapsulation hides representations likely to change. Cohesion keeps behavior
that changes for the same reason together. Architecture tests can enforce
allowed module imports.

Take them in the order the direction rule needs. An interface says what
may cross. Dependency inversion settles who writes it: policy, naming the
capability it wants, rather than an implementation offering one. Adapters then
make the outside fit the name policy chose. Encapsulation keeps
the representation behind that name from leaking; cohesion decides which name a
behavior belongs behind.

This lesson reads the sixth differently: architecture tests enforce allowed
module imports, which checks a structure rather than creating one.

::activity{id="layers-boundaries-and-coupling-mc1"}

## An invoice use case that names what it needs

An invoice use case depends on `InvoiceRepository`, `Clock`, and `PaymentPort`
capabilities expressed in domain terms. HTTP and SQL adapters implement them.
Replacing the payment provider changes one adapter and mapping, not invoice
policy or every caller.

Three dependencies, and the load-bearing word is capabilities. The use case
does not ask for a database, a system clock, or a provider's API; it asks for
somewhere to keep invoices, the current time, and a way to take a payment, each
named in the language of invoices. That is dependency inversion: policy
specified what it needed, so nothing outside set the terms.

The adapters translate. HTTP and SQL are protocols and schemas, which is what
an adapter is for, and both sit on the volatile side.

So the swap has a bounded reach, and the boundary is why. One adapter
changes because a protocol changed, one mapping because a schema changed.
Invoice policy does not, because it never knew the provider's name.

::activity{id="layers-boundaries-and-coupling-ms1"}

## When the wrapper is empty and the duplication is cheap

Layering improves separation until simple behavior must traverse empty
wrappers. Direct dependencies are acceptable when concepts genuinely coincide
and change together. Shared libraries reduce duplication but coordinate
releases. Duplication can be cheaper than coupling when similar code represents
different domain meanings.

Two of those four are permissions rather than warnings. A direct dependency is
allowed when the two concepts really are one. A duplication is allowed when the
resemblance is a coincidence of shape rather than of meaning. Both ask the same
question: does this similarity survive a change to one side?

The other two are prices. A layer charges a hop through a wrapper that does
nothing. A shared library charges a release that has to be coordinated.

## What each of these coupling symptoms rules out

Controllers contain business rules, domain objects import framework types,
every module reads shared tables, and a “common” package becomes a dependency
magnet. Interfaces mirror concrete implementations without protecting change.
Cyclic dependencies make ownership and initialization ambiguous.

Read each as evidence. A controller holding business rules rules out delivery
being the volatile side, because the policy is in the delivery layer. A domain
object importing framework types rules out the direction the rule asks for,
because stable policy depends on what is most likely to be replaced. Every
module reading shared tables rules out encapsulation: the representation is the
interface. A “common” package everything depends on rules out cohesion as the
reason its contents sit together.

Interfaces that mirror implementations rule out dependency inversion, however
many there are, because policy is not the one specifying. Cyclic dependencies
rule out reading the graph for ownership at all.

That is the return on the provider swap. The expensive change was not caused by
a missing interface but by knowledge sitting where the direction rule says it
should not, and each symptom above names which piece to look for.

## Sources

- Robert C. Martin, [The Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html) (2012) — dependencies pointing from volatile delivery and infrastructure details toward stable application policy
