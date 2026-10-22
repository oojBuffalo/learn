---
id: routing-and-navigation
title: "Routing and Navigation"
summary: Why a URL that works inside an application can fail for the person you send it to, and what the address bar is actually holding.
objectives:
  - Treat the URL as the published portion of navigation state rather than a side effect
  - Distinguish document navigation from client navigation by what each asks of the server
  - Read a routing failure back to the concern that was not reproduced
estimatedMinutes: 12
difficulty: intermediate
prerequisites: [rendering-and-the-dom, javascript-runtime]
tags: [frontend]
---

## The link that stops working when you send it to someone

A reader clicks through to an order inside the application and the screen
appears. They copy the address out of the bar, paste it into a message, and the
person who opens it gets a 404 from the server.

The address is not wrong — it is the address the application put there. What
differs is the route the two readers took to it. One of them arrived without the
server being asked anything at all.

## The URL is the part of navigation state you publish

Routing maps an application URL to content and behavior. Navigation changes the
active URL and history entry, possibly loading a new document or updating the
current document through client-side code.

Treat the URL as a serialized, public portion of navigation state:

```text
/projects/42/issues?status=open#issue-9
```

The path selects a resource or screen, the query selects a view, and the
fragment identifies a position within the resulting document. Three slots, three
jobs, and every one of them public.

That publicity is the whole benefit. Good routing makes application state
linkable, refreshable, shareable, and compatible with browser history rather
than hiding navigation inside transient component state. It is also the whole
constraint: put durable, shareable filters in the query and sensitive or
ephemeral data elsewhere, because nothing goes into a URL privately.

::activity{id="routing-and-navigation-mc1"}

## Two ways to change the screen

Document navigation asks the server for a new top-level resource. Client
navigation updates history and fetches or reveals the next screen without
replacing the whole document. One address bar, two entirely different events.

Underneath both, the browser owns session history even when a frontend router
coordinates it. A router keeps no session history of its own; it asks for
entries in one it does not own.

Routes are where a surprising number of concerns meet: URL design, server
resource handling, frontend composition, authorization, analytics, and caching.
Routers match paths, decode parameters, load data, enforce route-level policy,
manage errors, and restore titles, focus, and scroll — six jobs, several of
which a document navigation would have got from the server and the browser
between them.

Nested routes mirror layout ownership, which is why route shape and screen shape
tend to converge. Excessively clever route patterns make URLs unstable, which is
the same publicity working against you: a link that means something else next
month was never really shareable.

## One navigation, four steps

Navigating from `/orders` to `/orders/123` pushes a history entry, renders a
pending region, loads order `123`, then moves focus to the detail heading. A
not-found response renders a route error while preserving working navigation
back to the list.

Each step answers a question the one before it opened. The history entry goes
first because the reader may leave immediately and the back button has to work
from the moment the address changes. The pending region goes next because the
screen has changed identity and has nothing yet to show. The load follows. Focus
moves last, because until the detail heading exists there is nowhere to move it
to — and screen readers lose context when focus and title are not updated.

The not-found case is the interesting one. It is a route error rendered inside a
working application rather than a dead end, because the navigation succeeded
even though the resource did not resolve.

::activity{id="routing-and-navigation-ord1"}

## Server routes, client routes, and what each gives up

Server routing works without application JavaScript and gives each response an
independent lifecycle. Client routing preserves shell state and enables fluid
transitions but must reproduce document-level concerns.

Read that second sentence as a bill. Titles, focus and scroll came with the
document when the server sent one; a client router restores all three by hand,
and the failures below are what an unpaid installment looks like.

::activity{id="routing-and-navigation-mc2"}

## What each navigation failure rules out

Four routing symptoms, and what each one settles before you have opened
anything.

Directly loading a client route may return a server 404. That is the opening
scene, and it eliminates the application: the reader who got the 404 never
reached it. Their request was a document navigation, asking the server for a
top-level resource at a path the server has none for, while the first reader's
was a client navigation that asked the server for nothing.

Back buttons break when state changes use replacement or push inconsistently.
The symptom points at the router's history calls rather than at the screens,
because the browser owns session history and is doing exactly what it was told
to do.

A screen whose content arrives correctly while a reader using a screen reader
loses their place rules out the data layer. Focus and title are what were not
updated.

And authorization that holds in the interface but not against a request made
directly rules out nothing about the router, because the router was never the
control. Authorization performed only in the router is bypassable, since the
server remains the security authority.

## Sources

- WHATWG, [HTML Living Standard: Session history and navigation](https://html.spec.whatwg.org/multipage/nav-history-apis.html) (accessed 2026-07-18) — the browser owns session history even when a frontend router coordinates it
