---
id: browser-security
title: "Browser Security"
summary: Why a header that tells other pages what they may read gets filed as a lock on the door, and what each browser-side symptom eliminates once you stop treating the browser as one thing.
objectives:
  - Read browser policy against the origin tuple, and notice which mechanisms do not turn on origin at all
  - Hold the browser as an untrusted client and an enforcement environment at once
  - Weigh one origin against several, and a cookie session against a token scripts can read
estimatedMinutes: 12
difficulty: intermediate
prerequisites: [anatomy-of-a-web-app, api-design]
tags: [security]
---

## The wildcard that was mistaken for a lock

A team fixes a broken cross-origin request by allowing every origin, ships it,
and moves on. Months later somebody asks whether that API is protected, and the
answer that comes back is that CORS is configured on it.

Two failure modes are already in the room. Wildcard CORS is mistaken for
authentication, and browser-side checks are treated as protection against
direct HTTP clients. Neither is a bug in the header. It does exactly what it
says; the mistake is about what kind of sentence it is.

## An origin is a tuple, and the browser is two things at once

An origin is the scheme, host, and port tuple. Same-origin content has broad
interaction; cross-origin interaction is constrained and selectively permitted.
Most of the policies in this lesson are a variation on that one line.

The browser is an untrusted client but also a security enforcement environment.
Both halves are true at once, and holding only one produces a predictable
mistake in each direction. Take it as only untrusted and you never configure
the policies it would have enforced for you. Take it as only an enforcement
environment and you get the opening scene, where a rule the browser applies to
pages is read as a rule about the API.

It mediates between users, multiple origins, extensions, local state, and
application servers. It isolates web content primarily by origin while applying
policies around scripts, network access, cookies, framing, navigation, and
powerful capabilities, and applications strengthen those defaults through
correct headers and content handling.

## Six mechanisms, six different questions

CORS controls whether scripts can read selected cross-origin responses — a
question about reading, asked of a script. Cookie attributes constrain script
access, secure transport, cross-site sending, and scope. Content Security
Policy restricts executable and loadable sources. Frame policy limits
clickjacking. Subresource integrity can verify fixed external assets. And CSRF
defenses ensure a credentialed request reflects application intent, not merely
that cookies were attached.

That last clause is why the six are worth keeping apart. A cookie arriving with
a request proves the browser attached it. Nothing in that proves the
application meant to send it.

::activity{id="browser-security-mat1"}

## An account app, decision by decision

An account app serves its API same-origin, stores the session ID in a Secure,
HttpOnly cookie, requires a CSRF token for mutations, uses a restrictive CSP,
refuses framing, and sanitizes any permitted rich text before insertion.

Six decisions, and they are not six applications of the six mechanisms above.
Serving the API same-origin avoids the cross-origin problem rather than
configuring it. Sanitizing rich text is content handling, not a browser policy
at all. Subresource integrity does not appear here.

The cookie repays a close reading. Secure and HttpOnly cover two of the four
things cookie attributes constrain — secure transport and script access. The
CSRF token is present because no cookie attribute settles the question CSRF
defenses settle: whether a credentialed request reflects application intent.

## One origin or several, cookie or bearer

Keeping application and API on one origin simplifies credentials. Multiple
origins improve isolation when their content is genuinely untrusted, a narrower
condition than it sounds: the test is untrusted content, not a different team.

Strict CSP reduces injection impact but requires disciplined script delivery.

Then the credential decision. Cookie-based sessions integrate with browser
protections while requiring CSRF policy. Bearer tokens exposed to JavaScript
increase the consequences of script injection. These are not a safe option and
a risky one; they are two different bills. The cookie asks for a CSRF policy
you have to build and keep. The token asks you to accept that any script
running on your page has the session in reach.

::activity{id="browser-security-mc1"}

## What each of these rules out about the browser

Take each of these as an elimination rather than a diagnosis.

**Data reaching a client that never loaded your page** rules out every
mechanism above at once. Browser-side checks are not protection against direct
HTTP clients, so whatever answered did so with none of this involved.

**A credentialed request the application never intended** rules out the cookie
as the thing that failed. It was attached correctly. CSRF defenses establish
intent, and intent is a separate thing to establish.

**A message handled from an origin nobody checked** rules out the sender.
PostMessage receivers fail to verify origin, and the receiving code is where
the check was missing.

**A sensitive page inside somebody else's frame** rules out CSP as the answer.
Frame policy limits clickjacking, and it is its own mechanism.

**A redirect that carried a credential somewhere unexpected** rules out a
break-in. Open redirects enable phishing and credential forwarding, and the
credential was handed over by someone who believed they were looking at your
application.

The opening API ruled out nothing, because nobody asked it the first question.
A wildcard tells scripts in other origins that they may read the response. It
says nothing at all about who may call it.

::activity{id="browser-security-ms1"}

## Sources

- WHATWG, [HTML Living Standard: Origin](https://html.spec.whatwg.org/multipage/browsers.html#concept-origin) (accessed 2026-07-18) — an origin as the scheme, host, and port tuple
- OWASP, [HTTP Security Response Headers Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html) (accessed 2026-07-18) — CSRF defenses establishing that a credentialed request reflects application intent
