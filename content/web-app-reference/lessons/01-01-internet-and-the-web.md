---
id: internet-and-the-web
title: Internet and the Web
summary: Why a reachable server can still fail to serve a page, and what the layers underneath actually promise.
objectives:
  - Separate the internet as connectivity from the web as an application system
  - Read the layer stack as a reasoning tool rather than an implementation claim
  - Use layer boundaries to narrow where a failure lives
estimatedMinutes: 12
difficulty: beginner
tags: [web-foundations]
---

## The page is down, but the server answers

A colleague reports that the site is unreachable. You send packets at the host
and they come back. You open a connection to the port it serves on and the
connection is accepted. By every measure you have to hand the machine is fine —
and the page still does not load.

Nothing here is contradictory. Each of those checks proves something about a
different layer, and none of them proves the one your colleague cares about. A
network can deliver packets while an HTTP request fails, and a web app can be
unavailable even when its host is perfectly reachable.

## Connectivity is not an application

The internet is a network of interconnected networks: its job is to move packets
between interfaces. The web is an application system built on that connectivity,
using URLs to identify resources, HTTP to exchange representations of them, and
browsers as general-purpose clients.

Collapsing the two produces a category error you will meet in every outage.
“The server is up” is a claim about connectivity. “The page works” is a claim
about an application. The first never implies the second, and no amount of
network evidence will settle a question the network was never asked.

::activity{id="internet-and-the-web-mc1"}

## The stack is a reasoning tool

Application code sits above link, internet and transport mechanisms. Routers
forward IP packets between networks, transport protocols provide communication
between endpoints, DNS maps names, TLS protects a connection, and HTTP gives
messages their web semantics. Stacked, that reads:

```text
web app behavior
HTTP messages
TLS protection
TCP or QUIC transport
IP routing
physical and link networks
```

This is a reasoning stack, not a claim that every implementation has identical
layers. What it buys you is a discipline: each layer relies on services below and
exposes a narrower abstraction above. Evidence gathered at one layer licenses
conclusions about that layer and the ones beneath it — and no others.

## What each layer promises

Read from the bottom. IP addresses identify network interfaces so that packets
can be routed, and autonomous networks exchange reachability information so that
routing works between them at all. DNS resolves names through a distributed
hierarchy. A transport connection associates the two endpoints’ addresses and
ports. TLS protects that connection. Only then does HTTP get to say anything
interesting: it expresses an operation on a resource.

One property of HTTP deserves singling out, because so much application design is
a reaction to it. HTTP is explicitly a stateless application-level
request-response protocol. Every session, cart and login you have ever built is
an added mechanism, layered on top of a protocol that by itself carries nothing
from one request to the next.

::activity{id="internet-and-the-web-mc2"}

## One URL, all the way down

Say a developer opens `https://shop.example/orders`. The browser may obtain an
address for `shop.example` through DNS, create a protected transport connection,
send an HTTP request naming that authority and the path, and receive HTML back.

That looks like a single action and is at least four, each able to fail on its
own terms. Nor does it stop there: the HTML that comes back can trigger many more
independent requests, each with its own caching and security rules. “The page
loaded” is a statement about dozens of exchanges, not one.

::activity{id="internet-and-the-web-ord1"}

## Decisions, and the layer each one lives at

Once the layers are visible, several familiar arguments turn out to be arguments
about where in the stack something should happen. Developers choose where to
terminate TLS, which intermediaries may cache content, whether traffic uses
long-lived or short-lived connections, and how much application state is coupled
to a particular process — a question you only have because HTTP itself keeps
none.

Intermediaries are the sharpest of these tradeoffs. More of them can improve
reach, security and caching. The same additions complicate diagnosis and trust:
every hop is one more place a response can be served from or refused, and one
more party whose behaviour you are relying on.

::activity{id="internet-and-the-web-mat1"}

## What each symptom rules out

Failures are spread across the whole stack — DNS misconfiguration, unreachable
routes, packet loss, connection exhaustion, certificate errors, proxy policy,
application-level timeouts. What makes a symptom useful is less what it proves
than what it eliminates.

“It works by IP” narrows a problem toward naming or virtual-host configuration:
reaching the host by address exercised the layers below it and left those two
untested. “The TCP connection opens” is weaker than it feels. It shows that
two endpoints found each other; it does not prove that HTTP behaviour above them
is correct.

That answers the puzzle this lesson opened with. Packets arriving and a
connection being accepted were both true, and both silent about the layer that
was failing.

::activity{id="internet-and-the-web-sa1"}

## Sources

- IETF, [RFC 9110: HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html) (accessed 2026-07-18)
