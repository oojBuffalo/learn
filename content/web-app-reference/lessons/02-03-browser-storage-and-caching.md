---
id: browser-storage-and-caching
title: "Browser Storage and Caching"
summary: Why articles a reader saved for a flight can be gone by the time the plane leaves, and how five stores with five owners force one decision per fact.
objectives:
  - Tell the browser's storage mechanisms apart by ownership rather than by convenience
  - Choose a store from a fact's lifetime, sensitivity, size, consistency and server visibility
  - Recognise the mistakes that follow from storing a fact somewhere its rules do not fit
estimatedMinutes: 12
difficulty: intermediate
prerequisites: [request-response-lifecycle, clients-servers-and-resources]
tags: [browser-platform]
---

## The articles that were saved and then were not

A reader saves several articles for a flight. The app confirms each one. A week
later, on the plane, they are gone, and the theme they picked is back to its
default.

No request failed here. What failed was an assumption: that data written by a
browser stays written. Browsers may evict storage under pressure, and users can
clear it. “Saved” was a claim the app was not in a position to make.

## Five stores, five different owners

Browsers keep data in several systems with different ownership. HTTP caches
reuse responses. Cookies participate in requests. Web-storage APIs hold
origin-scoped strings. IndexedDB stores structured application data. Service
workers can mediate fetches.

That is five mechanisms, not one, and the differences between them are the
point. Browser storage sits between volatile frontend memory and authoritative
server data, and it is generally partitioned and governed by origin and browser
policy. It is not an unlimited local database — which is the sentence the saved
articles walked into.

Choosing between them is a choice along five axes: lifetime, sensitivity,
size, consistency, and server visibility. Choose badly and you get stale state,
privacy leaks, or offline behaviour that cannot reconcile.

## What each store is for, and what travels

| Mechanism | Primary use | Sent automatically? |
| --- | --- | --- |
| HTTP cache | reusable responses | applied by fetch machinery |
| cookie | small server-associated state | according to cookie policy |
| session/local storage | simple client state | no |
| IndexedDB | larger structured client data | no |
| service-worker cache | programmable resource cache | no; worker decides |

The third column is what makes a mechanism the right or wrong home for a fact:
two of the five travel with requests without the application arranging it, and
three do not.

Each has mechanisms of its own. HTTP freshness can avoid
revalidation, and validators allow conditional requests. Cookie attributes
constrain lifetime, transport, and cross-site behaviour. Origin-scoped APIs
prevent arbitrary sites from reading one another's state.

::activity{id="browser-storage-and-caching-mat1"}

## Where stored state goes wrong

Common mistakes include storing secrets in script-readable storage, assuming
local data is durable, caching personalized responses as shared, failing to
version stored schemas, and presenting stale offline data as current.

Read them as one family. Each is a fact kept somewhere whose rules do not match
what the fact requires: a secret in a store scripts can read, a promise of
permanence in a store the browser may evict and the user can clear, a per-user
response in a cache that serves everybody, a value in a shape the next release
will not recognise, and yesterday's article presented as today's.

One more needs no mistake at all. Multiple tabs can update shared origin storage
without application-level coordination — two copies of the same app writing to
the same store, with nothing in the platform arbitrating between them.

::activity{id="browser-storage-and-caching-mc1"}

## One news app, four homes for four kinds of data

A news app HTTP-caches article assets, stores the selected theme locally, keeps
saved-reading metadata in IndexedDB, and treats the server as authority for
account state.

Four facts, four homes, each an answer to the five axes. Article assets are
reusable responses, so the HTTP cache. The theme is simple client state that is
cheap to lose, and the rule is to keep display preferences locally when loss is
acceptable. Saved-reading metadata is larger and structured, so IndexedDB.
Account state has to agree with the server, so the server holds it.

Offline saves then carry unique operation IDs and display “pending sync” until
acknowledged. That is the detail the flight needed: the app never claimed
“saved”, only “pending”, until the server said otherwise.

## What caching and offline resilience each cost

Aggressive caching improves latency while raising staleness and invalidation
costs. Offline mutation queues improve resilience but require conflict, retry,
and identity rules. And server session identifiers belong in secure, HTTP-only
cookies when frontend code does not need to read them — a choice that gives up
read access deliberately, because that is the point.

::activity{id="browser-storage-and-caching-ms1"}

## The storage decision you cannot postpone, and what each answer costs

Every fact your frontend holds forces this decision, and postponing it is itself
an answer — usually the nearest store.

Put it in a cookie and you buy participation in requests, and pay cookie policy:
attributes constraining lifetime, transport and cross-site behaviour that you
now have to get right.

Put it in web storage and you buy simplicity, and pay durability and secrecy
together. The browser may evict it, the user can clear it, and it is
script-readable, so a secret cannot go there.

Put it in IndexedDB and you buy room for structured data, and pay versioning: a
stored schema that is never versioned meets the release that changes it.

Keep it on the server and you buy authority, and pay for it in a round trip and
in whatever the app has to do while offline.

No answer costs nothing, so the question is never “where can I put this?” but
“which price am I paying for this fact?”

## Sources

- WHATWG, [Storage Standard](https://storage.spec.whatwg.org/) (accessed 2026-07-18) — storage is generally partitioned and governed by origin and browser policy, browsers may evict it under pressure, and users can clear it
