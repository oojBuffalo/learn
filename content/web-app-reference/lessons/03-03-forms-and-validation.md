---
id: forms-and-validation
title: "Forms and Validation"
summary: Why a form can reject a submission correctly and still leave the person unable to fix it, and what each boundary in the chain is checking for.
objectives:
  - Say what the client, the server and the domain each validate for
  - Separate preventing a repeated interaction from surviving a repeated delivery
  - Turn each server outcome into feedback the person can act on
estimatedMinutes: 12
difficulty: intermediate
prerequisites: [rendering-and-the-dom, javascript-runtime]
tags: [frontend]
---

## The form that said “invalid request” and stopped there

Someone fills in a transfer, submits it, and the page comes back with the fields
empty and the words “invalid request” at the top. Something about the submission
was wrong. Nothing on the screen says which part, and the input that would have
let them try again is gone.

The submission was rejected correctly. What failed is everything after the
rejection — the half of a form that decides whether a person can recover.

## Every boundary validates for its own reason

Forms collect structured user intent. Validation helps users correct input and
protects application boundaries, but frontend validation never replaces backend
validation or authorization.

```text
raw controls → client feedback → serialized request
→ server validation and authorization → domain command
→ field/global result → accessible UI feedback
```

Each boundary validates for its own purpose. Client checks improve interaction;
server checks protect authority; domain invariants preserve correctness. Read as
three jobs rather than three chances to run one check, the chain stops looking
redundant: the client is improving the interaction for the person in front of
it, the server is deciding whether this caller may do this thing at all, and the
domain is refusing to hold a state that cannot be true.

Which is why a disciplined form model handles labels, constraints, submission,
duplicate actions, server errors, and recovery without treating input fields as
trusted domain data. The fields are a proposal, and nothing more.

## From a label to a domain command

Labels give controls names. Input types and attributes express basic
constraints. Submission serializes successful controls. Native HTML supplies
that submission and constraint-validation behavior, which applications may
progressively enhance rather than rebuild.

Past the wire, application validation maps parse errors and business errors to
fields or a form-level summary — the split that decides whether feedback lands
where the person can act on it.

Two mechanisms guard the submit itself, and they are easy to mistake for one.
Pending state prevents accidental repeated interaction. An idempotency key
handles repeated network delivery. One is about a person clicking twice; the
other is about a request arriving twice, which no interface can prevent.

::activity{id="forms-and-validation-mc1"}

## Where forms fail people

Placeholder-only labels disappear. Color-only error cues exclude users.
Disabling a submit button without exposing pending status creates ambiguity: the
control is inert and the reason is unstated.

Three more sit further back. Client and server rules drift, so a form accepts
what the server will refuse. Generic “invalid request” responses prevent
correction — the opening scene, a true statement that leaves the person nothing
to change. And parsing formatted dates or numbers without locale rules corrupts
meaning, quietly, in the one place a form is supposed to be exact.

Against all six, one instruction does more work than any other: preserve safe
user input after a rejected submission.

::activity{id="forms-and-validation-ms1"}

## One transfer, four answers

A transfer form parses an amount, announces inline format errors, and submits a
unique operation ID. The server verifies account access and balance inside its
transaction. A declined transfer returns a form-level business message; an
invalid destination maps to that field; an unknown timeout offers status lookup
rather than a blind retry.

Four outcomes, four shapes of feedback, and the shape is the point. A format
error belongs beside the control, because that is where the correction happens.
A decline belongs at form level, because no single field was wrong. An invalid
destination belongs on the destination field, because one was. And an unknown
timeout belongs in a category of its own: the form does not know what happened,
so the honest answer is a way to find out rather than a second attempt at
something that may already have succeeded.

::activity{id="forms-and-validation-mat1"}

## Validating early, or validating late

Validate on blur or submit for most rules; aggressive per-keystroke errors can
punish incomplete input. A half-typed address is not an invalid address, and an
interface that cannot tell the difference spends the whole entry telling people
they are wrong.

Controlled component state offers coordination while native form state reduces
code. Optimistic completion feels fast but is unsuitable when the result is
uncertain or costly to reverse — a transfer being both at once.

## The first things to check on a form

Before the validation rules and before the state model, three checks cost almost
nothing and catch the failures that hurt most.

Look for a label outside the field. If the only label is the text sitting inside
the box, it is a placeholder-only label, and placeholder-only labels disappear.

Take the color out of the error cue. If nothing is left, the cue is color-only,
and color-only error cues exclude users.

Press submit and watch the control. If it goes inert without saying why,
disabling a submit button without exposing pending status has produced exactly
the ambiguity it was meant to remove.

Then the fourth, which costs one deliberate rejection to run: send a bad value
and read what comes back. If the fields are empty and the message is generic,
the form has failed the part of validation the person actually needed — and no
amount of correctness earlier in the chain substitutes for it.

## Sources

- WHATWG, [HTML Living Standard: Forms](https://html.spec.whatwg.org/multipage/forms.html) (accessed 2026-07-18) — native HTML supplies submission and constraint-validation behavior that applications may progressively enhance
