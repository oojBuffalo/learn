---
id: cdns-edge-and-load-balancing
title: "CDNs, Edge, and Load Balancing"
summary: Why a page can be served correctly, quickly and from the nearest possible place and still show one person another person's account, and what to read first when an edge is behaving strangely.
objectives:
  - Follow a request from a name through edge policy and origin selection to an application
  - Distinguish what the edge decides at a hop from what every hop has to carry forward
  - Read an edge configuration cheapest-first, from a cache key to a change's blast radius
estimatedMinutes: 12
difficulty: intermediate
prerequisites: [reliability-and-performance]
tags: [delivery-and-operations]
---

## The account page that came back with the wrong name

Someone opens their account page and sees another person's details. The
application is correct. The instance that produced the original response was
correct. The response was simply handed to a second person, quickly and from
somewhere very close to them.

Missing cache dimensions leak private data — a failure mode named here, and
nothing in it involves a bug in the application. The edge was told which
responses were the same as each other, and it believed the answer.

## Name, edge, policy, origin, application

Edge systems accept traffic near users, terminate connections, apply policy,
cache responses, and route requests toward healthy origins. Load balancers
distribute work across endpoints according to health and routing rules.

This layer improves latency, capacity, and resilience while creating another
authority boundary for identity, caching, and observability. That second half
is the part that produces surprises: something other than the application is
now deciding who a request is from and which responses may be shared.

```text
name
  -> edge endpoint
    -> policy / cache
      -> origin selection
        -> application
```

Read it downward. The edge lies between public DNS and application instances,
and it may include a CDN, a web application firewall, a reverse proxy, an API
gateway, and regional or global load balancers — several hops, not one.

At each hop, preserve the original scheme, host, client context, deadline, and
trace information through trusted fields. Five things travel the whole way
down, and “through trusted fields” is load-bearing: a hop may believe only what
a trusted hop wrote.

::activity{id="cdns-edge-and-load-balancing-ms1"}

## What selects, what terminates, and what says no

Anycast or DNS routing selects an edge location. TLS termination authenticates
the public origin. Cache keys and freshness determine which responses can be
reused, in the sense RFC 9111 gives to caching. Health checks remove unsuitable
origins. Rate limiting and request-size limits reject abuse early.

Balancing then splits by how much of the request it can see. Layer-4 balancing
routes connections. Layer-7 balancing can inspect HTTP targets and fields,
which is what makes routing on what a request is asking for possible at all.

::activity{id="cdns-edge-and-load-balancing-mc1"}

## One catalog, three kinds of response, one honest proxy

Product images use long immutable cache keys. Public catalog responses vary by
locale and region. Account responses are private and never shared. The proxy
overwrites client-supplied forwarding headers, attaches trace context, and
retries only safe reads within the request deadline.

The first three lines are one decision made three times, at three different
settings. An immutable image can be reused by everybody for a long time. A
catalog response can be reused by everybody who shares a locale and a region,
which is what varying the key means. An account response can be reused by
nobody, which is the opening scene refused.

The proxy's three clauses each answer something separate. Overwriting
client-supplied forwarding headers refuses to trust a field an arbitrary client
wrote. Attaching trace context is one of the five things a hop must carry.
Retrying only safe reads, and only within the deadline, keeps a retry from
outliving the request that justified it.

## Caching, sticky sessions, reach, and code at the edge

Caching static and public content reduces origin load; personalized content
needs private or carefully varied keys. Sticky sessions simplify instance-local
state but impair balancing and failover. Global routing improves reach while
making propagation and regional consistency visible. Edge computation reduces
latency but disperses code and observability.

Each of the four is charged for. Caching asks which responses may be shared,
and personalized content pays in private or carefully varied keys. Sticky
sessions ask where state lives, and instance-local state pays in balancing and
failover. Global routing asks how far to reach, and pays in visible propagation
and regional consistency. Edge computation pays in dispersed code and observability.

::activity{id="cdns-edge-and-load-balancing-mat1"}

## The cheapest thing to check first at the edge

These are ordered by how cheaply each can be established, not by how much
damage each does.

Start with a cache key. Which dimensions is it built from, and does anything
private share one? Missing cache dimensions leak private data, and a key is a
definition somebody can read in one sitting.

Then read what the proxy does with forwarding headers. Trusting forwarded
headers from arbitrary clients spoofs identity or scheme, and the repair is the
example's: overwrite what the client supplied.

Then read what the health check actually requests. Health probes test only a
shallow endpoint, so an origin can pass while the path users need is failing.

Counting retries costs more, because it takes both sides at once. Retries at
both proxy and application multiply effects, and one configuration on its own
never shows the product.

The most expensive question is the one about change. Edge configuration changes
can have a global blast radius, and how wide it reaches cannot be read off the
configuration.

The opening account page fails the first check on this list — the cheapest one,
and the one a key definition settles on its own.

## Sources

- IETF, [RFC 9111: HTTP Caching](https://www.rfc-editor.org/rfc/rfc9111.html) (accessed 2026-07-18) — cache keys and freshness determining which responses can be reused
