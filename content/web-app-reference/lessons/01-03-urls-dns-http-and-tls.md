---
id: urls-dns-http-and-tls
title: "URLs, DNS, HTTP, and TLS"
summary: Why replacing one hostname is an origin migration rather than a text edit, and which of four mechanisms a given symptom implicates.
objectives:
  - Separate the problem each of URL, DNS, TLS and HTTP actually solves
  - Decide whether a change to a URL changes the origin
  - Narrow a failure to one mechanism from the symptom it presents
estimatedMinutes: 12
difficulty: beginner
prerequisites: [anatomy-of-a-web-app]
tags: [web-foundations]
---

## One hostname, replaced everywhere

A team moves an app from `app.example.com` to `www.example.com`. On the face of
it this is a text replacement: one string, a handful of config files, an
afternoon.

It is not. The change touches DNS records, certificates, cookie scope, CORS
policy, OAuth redirect URIs, canonical links, caches and monitoring — eight
places the ticket never mentioned. A hostname reaches that far because four
mechanisms all read it, each for a different purpose.

## Four mechanisms, four different problems

A URL identifies how to access a resource. DNS helps find an address for its
host. TLS protects communication and authenticates the server endpoint. HTTP
describes the request and the response. They cooperate on every page load while
solving different problems, which is why a symptom usually implicates one
rather than all four.

One boundary carries more weight than the rest, because so much policy is
defined on it: an HTTP origin is distinguished by scheme, host and
port. The path and the query are not part of it, so a change of path leaves the
origin alone while a change of scheme does not.

::activity{id="urls-dns-http-and-tls-mc1"}

## Which of the four is at fault

Read the common failures as narrowing devices, not a list of things that break.

A name that still resolves to the old address implicates DNS. A certificate the
browser refuses implicates TLS and the names in it, whatever the application is
doing. Mixed HTTP and HTTPS content implicates the scheme in URLs
your own pages emit, not the server that serves them. Redirect loops, cache
collisions and mishandled forwarded hosts all implicate HTTP itself — the fields
and statuses of the exchange.

::activity{id="urls-dns-http-and-tls-mat1"}

## Reading a URL part by part

For `https://api.example.com:443/orders?state=open`:

| Part | Role |
| --- | --- |
| `https` | scheme, security expectations |
| `api.example.com` | host and DNS name |
| `443` | transport service endpoint |
| `/orders` | path in the namespace |
| `state=open` | query read by the app |

The first three parts constitute the origin; the last two are addressed to the
application, which sets what each may safely carry. Stable identifiers improve
linking and caching, so a path worth publishing is worth keeping. Query
parameters suit representation selection and are unsafe for secrets, because
URLs appear in logs and history long after the request is over.

::activity{id="urls-dns-http-and-tls-sa1"}

## What has to be true before a request means anything

DNS resolution can follow caches and delegated name servers, so an answer is not
a promise about what is authoritative right now. Short time-to-live values speed
routing changes and increase lookup traffic, and never guarantee instant global
change.

TLS 1.3 then negotiates cryptographic parameters and is designed to prevent
eavesdropping, tampering and message forgery, and the client verifies the
certificate is valid for the requested host — the host taken from the URL. A
name in a URL is therefore a security input, not merely a routing one.

Only then does HTTP carry a method, a target, fields and content, and bring a
status back. One consequence catches people out: connection reuse means many
requests may share a connection without sharing application meaning — a pipe,
not a session.

::activity{id="urls-dns-http-and-tls-mc2"}

## Where the trust boundary actually sits

TLS can terminate at an edge, which is convenient and moves the boundary. Past
that point the internal hops still need an explicit trust model, because whether
they are still protected is now somebody's decision rather than something TLS is
doing for them.

The same caution applies to the certificate itself. A valid certificate proves
control of a name under the certificate system — not that the application behind
it is benign, nor that anything else about the deployment is correct. And
application code that trusts an unvalidated `Host` field has taken a
client-supplied string as authority over which site it serves.

::activity{id="urls-dns-http-and-tls-ms1"}

## Start with the origin

Four mechanisms and eight affected places is a lot of surface, and the order you
work through it is not arbitrary: some checks rule out far more than others.

The origin is one fact — scheme, host and port — and the fact cookie scope, CORS
policy, OAuth redirect URIs and cache keys are all defined against. If it moved,
the eight places are not eight problems but one problem and its consequences:
the difference between a text replacement and a migration, established by one
look at a URL.

Ask what the name resolves to next, because resolution sits under everything
else: while a client still holds the old address, everything you check above it
is checked against the wrong server.

Only then are the expensive questions worth asking: whether the certificate is
valid for the host actually requested, whether a redirect chain terminates,
whether a forwarded host is trusted unchecked — each costing more to settle and
ruling out less.

## Sources

- IETF, [RFC 9110 §4.3: Authoritative Access](https://www.rfc-editor.org/rfc/rfc9110.html#name-authoritative-access) (accessed 2026-07-18) — an origin is distinguished by scheme, host and port
- IETF, [RFC 8446: TLS 1.3](https://www.rfc-editor.org/rfc/rfc8446.html) (accessed 2026-07-18) — TLS 1.3 negotiates cryptographic parameters and is designed to prevent eavesdropping, tampering and message forgery
