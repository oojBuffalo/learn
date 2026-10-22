---
id: matching-vs-recommendation
title: Matching and Recommendation
summary: Two answers to “who gets connected to whom” — one where the supply runs out, one where it doesn’t.
estimatedMinutes: 18
difficulty: intermediate
tags: [systems, recsys]
activities: [match-cases]
---

## The one difference that matters

A dating app deciding who to show you tonight and a video app deciding what to
play next are described by the same sentence: given people on one side and
options on the other, decide who gets connected to whom. The teams that build
them will share almost no code.

The reason is scarcity. When the video app shows you a clip, the clip is not
used up — a million other people can be shown the same clip in the same second,
and nothing about your experience degrades. When the dating app introduces you
to someone, it has spent that person’s attention. When a dispatch system gives
you a driver, nobody else can have that driver. One system hands out copies.
The other hands out the thing itself.

Everything downstream follows from that. If supply is endless, the job is to
**rank**: put the best thing first, and be judged on what the reader does. If
supply runs out, the job is to **allocate**: decide who gets what, and be judged
on whether the people involved would rather have gone around you.

| Axis | Matching | Recommendation |
|---|---|---|
| Supply | Runs out | Endless |
| Preferences | Both sides | Mostly one side |
| Output | An assignment | A ranked list |
| Bad day | Instability | Irrelevance |
| Yardstick | Stability, wait time | NDCG, engagement |
| Classic tool | Deferred acceptance | Matrix factorization |

One warning about vocabulary before we start. Inside recommender teams,
“matching” usually means something much narrower: the first stage of the
pipeline, where you pull a thousand plausible candidates out of a billion. That
is a retrieval problem, not an allocation problem. Both meanings appear in this
lesson, and Part 2 flags which is which.

::activity{id="mc-scarcity"}

## Part 1 — The theory

### Matching: graphs, costs, and stability

The textbook object is a bipartite graph: two disjoint sets of nodes — riders
and drivers, students and schools, residents and hospitals — with edges only
between the sets, never inside them. A *matching* is a set of edges that share
no endpoints, so every node is used at most once.

That constraint is the entire problem. It is why you cannot solve matching by
scoring each pair independently and keeping the top scores: the best partner for
you may be the only acceptable partner for someone else.

Real markets are rarely one-to-one — a hospital hires thirty residents, a school
seats two hundred children — but that changes less than it looks. Give each node
a **capacity** and every result below carries over; a hospital with thirty slots
behaves like thirty copies of a hospital with one. What never relaxes is that
capacity is finite, which is exactly what recommendation does not have.

Three genuinely different questions get asked of that graph.

**How many pairs can we form?** Maximum-cardinality matching fills as many slots
as possible, treating every edge as equally good. Hopcroft–Karp does it in about
$O(E\sqrt{V})$, fast enough that raw cardinality is rarely what makes a system
hard.

**Which pairs are cheapest?** Now each edge carries a number — minutes to
pickup, a predicted rating, a dollar value. The *assignment problem* asks for
the set of edges that uses every node once and minimises the total. Picture a
matrix of costs — here, minutes to pickup — in which you must choose exactly one
cell per row and per column:

$$
C = \begin{pmatrix}
2.1 & 6.4 & 3.0 \\
5.8 & 1.9 & 4.2 \\
3.3 & 4.0 & 1.7
\end{pmatrix}
\qquad
\min_{\sigma}\; \sum_{i=1}^{n} C_{i,\sigma(i)}
$$

where $\sigma$ ranges over the permutations — one cell per row and column,
minimising the sum.

Greedy fails here in a way worth internalising. Repeatedly taking the smallest
remaining number can strand the last row with an enormous edge, because a cheap
edge taken early consumes a column somebody else needed far more. The Hungarian
algorithm solves it exactly in $O(n^3)$; at production scale the same problem is
usually posed as min-cost flow and handed to a solver.

**Would anyone defect?** This is the question that makes matching its own field.
Both sides now hold *preferences* — ordered lists, not just costs — and the
pairing has to survive contact with the people in it. A **blocking pair** is two
participants who prefer each other to whoever they were assigned. If one exists,
those two can walk away and pair up privately, and your matching is worth
nothing outside the spreadsheet. A matching with no blocking pair is **stable**.

Gale and Shapley proved in 1962 that a stable matching always exists, and gave
an algorithm that finds one: **deferred acceptance**. Every unmatched proposer
proposes to its favourite remaining choice. Each receiver keeps the best offer
it has seen so far and rejects the others — but holds nothing permanently, so a
better offer arriving later displaces the one being held. Rejected proposers
strike that receiver off their list and try again. It terminates because every
rejection removes an edge for good.

Two consequences matter more than the mechanics. Deferred acceptance is
**proposer-optimal**: every proposer gets the best partner it could obtain in
*any* stable matching, and receivers get their worst. And proposing honestly is
safe, while receivers can sometimes do better by misreporting. So “which side
proposes” is not an implementation detail. It is a decision about whose
interests the market serves.

Maximum matching optimises a number. Stable matching optimises against
defection. Picking the wrong one means carefully solving a problem nobody had.

::activity{id="ord-deferred-acceptance"}

::activity{id="sa-blocking-pair"}

### Recommendation: filling in a mostly empty matrix

Start with a table: users down the side, items across the top, and in each cell
whatever that user did — a rating, a click, a watch, or nothing at all. Nearly
every cell is empty. A catalogue of a million items and an unusually active user
who has touched five hundred of them still leaves that row 99.95% blank. The
textbook framing of recommendation is: predict the missing cells, then sort.

**Content-based** methods describe items by their attributes, build a profile
from what the user has engaged with, and score by similarity. They handle a
brand-new item on day one, because a description exists before any behaviour
does. They also narrow: a content-based system can only ever offer more of what
you already picked.

**Collaborative filtering** ignores what items *are* and uses only the pattern of
who touched what. User-based CF finds people whose rows resemble yours and
recommends what they liked. Item-based CF finds items whose columns resemble
each other — people who watched this also watched that. Amazon’s 2003 paper made
item-based the industry default for a reason that is about engineering rather
than accuracy: item-item similarities move slowly, so they can be computed in a
nightly batch and looked up in constant time, while user-user similarity goes
stale the moment somebody clicks.

**Matrix factorization** compresses the whole table. Learn a short vector for
each user and each item — twenty to a few hundred numbers — such that the dot
product of a user vector and an item vector predicts that cell. Nobody designs
the dimensions; they fall out of the data, and after training a few are legible
while most are not. This is the family the Netflix Prize (2006–2009) settled on.
The winning ensemble was never shipped in full: too much machinery for the
accuracy it bought, which is the first honest lesson of the field.

One correction the textbook makes late and production makes immediately: most
real feedback is **implicit**. There are no ratings, only clicks, plays and
skips. An empty cell no longer means “disliked” — it usually means “never saw
it”. Treating unobserved as negative is simply wrong. The fixes are to weight
observed interactions by confidence, or to stop predicting values altogether and
predict *order* instead: learn that an item the user touched should outrank one
they didn’t.

That changes measurement too. RMSE on held-out ratings is the metric the Netflix
Prize made famous, and it is the wrong one, because nobody consumes a predicted
rating. People consume a list, read from the top, and stop. So the working
metrics are ranked ones: **Precision@k** and **Recall@k** for how much of the top
k is good, **MRR** for how far down the first good item sits, and **NDCG**, which
discounts each position logarithmically:

$$
\mathrm{DCG}@k = \sum_{i=1}^{k} \frac{\mathrm{rel}_i}{\log_2(i + 1)}
$$

Because the denominator grows with rank, being right at position 1 counts for
much more than being right at position 20.

Even those score one list for one user. Three system-level properties appear in
none of them and all three decay quietly: **coverage** — what share of the
catalogue is ever shown at all; **diversity** — whether ten slots hold ten
different ideas; and **novelty** — whether any of it tells the user something
they didn’t already know.

::activity{id="ms-collaborative-filtering"}

## Part 2 — The systems that ship

### A recommender is a funnel, not a model

The largest gap between the textbook and a deployed system is that there is no
“the model”. A feed is a pipeline of narrowing stages, each with its own job,
cost, and latency budget. The numbers below are typical of a large consumer
feed; the shape is close to universal.

```
corpus         10^6 – 10^9 items
   |   retrieval ("matching")             ~10 ms
   v
candidates     ~1,000
   |   filtering: already seen, blocked, policy
   v
eligible       ~600
   |   ranking: heavy model, several heads   ~50 ms
   v
scored         ~600
   |   re-ranking: diversity, dedup, ads     ~5 ms
   v
the page       ~20
```

**Retrieval** is the stage recommender teams call *matching* — the naming
collision this lesson opened with. Nothing here allocates anything; its only job
is recall, getting the good candidates into that thousand within single-digit
milliseconds and without touching a billion items one at a time. No serious
system uses a single source. A production retrieval layer blends several: a
two-tower embedding model, co-visitation (“people who watched X watched Y”),
whatever is trending, whatever the user explicitly subscribes to, and a pile of
rules.

::activity{id="ord-funnel"}

The **two-tower** model earns its detail, because its architecture is dictated by
serving rather than by accuracy. One tower embeds the user, another embeds the
item, and the score is nothing but their dot product, $s(u, i) = \mathbf{u}^\top
\mathbf{v}_i$ — deliberately, so that no user feature can interact with an item
feature except through that final multiply. The restriction is the whole point: it lets you push every item
through the item tower *offline*, load the resulting vectors into an approximate
nearest-neighbour index (HNSW, IVF-PQ, ScaNN), and at request time embed only
the user before asking the index for the closest few hundred. A model that let
user and item features mix earlier would score better on paper and could not be
served at all.

::activity{id="fb-retrieval"}

**Ranking** can afford to be expensive, because it only ever sees hundreds of
items. This is where cross features live and where the genuine complexity sits:
a modern ranker predicts several things at once — probability of a click, of a
long watch, of a like, of a hide or a report — and a hand-tuned **value model**
folds those heads into the single number that sorts the list. That set of
weights is a product decision wearing a formula’s clothes. YouTube’s published
architecture is the canonical reference: candidate generation and ranking in
2016, then multi-task heads with an explicit position-bias correction in 2019.

**Re-ranking** repairs what pointwise scoring cannot see. Ten individually
optimal items are often ten near-duplicates. So the final stage enforces
diversity, dedups, injects freshness, applies per-creator caps, blends in ads,
and drops whatever the policy layer forbids.

Then there is everything that is not the algorithm.

**Feature stores and skew.** Every feature is computed twice — once in the
training pipeline, once in the serving path — and the day those two disagree,
through a different default for a missing value or a window measured against a
different clock, the model quietly degrades. Training–serving skew is the most
common serious defect in deployed ML, and it never throws an exception.

**Cold items.** A video uploaded ten minutes ago has no embedding, no
co-visitation neighbours, and no statistics. A system that ranks only what it
can confidently score gives new content no way in, and the catalogue narrows
over time to whatever was already popular.

**Fallbacks.** Everything downstream of retrieval runs against a deadline. When
the ranker misses it, you serve the cached list or the popularity ordering. An
adequate page beats an empty one every time.

**Evaluation.** Offline gains routinely fail to reproduce in an A/B test, for a
structural rather than statistical reason: your logs contain only the items the
*old* system chose to show, in the positions it chose. Users clicked the top slot
partly because it was the top slot — position bias — so replaying a new ranker
over those logs scores it inside the old model’s world. The countermeasures are
inverse-propensity weighting, interleaving (mixing two rankers into one list, far
more sensitive per user than a split test), and guardrail metrics, so a click win
paid for in retention gets caught. Teams also reserve a slice of traffic for
**exploration**, deliberately showing items the model is unsure about — a system
that only shows what it already believes trains tomorrow’s model on today’s
beliefs and converges on a popularity loop.

::activity{id="mc-offline-gap"}

### Matching in the wild

**Dispatch.** The obvious ride-hailing algorithm is: a rider requests, you find
the nearest free driver, you send them. It is worse than it looks. Handing the
nearest driver to whoever happened to ask first can strand a rider two blocks
away whose only remaining driver is fifteen minutes out. So dispatch systems
batch: hold requests for a few seconds, build the cost matrix over that window,
solve it as one assignment problem, and repeat. A few seconds of added wait buys
a globally better set of pairings, and much of the published work from
ride-hailing engineering teams is about tuning exactly that trade.

Two production wrinkles the textbook lacks. Cost is not distance — it folds in
ETA under live traffic, driver idle time, cancellation risk, and the value of
the trip. And an assignment is a **forecast**: a driver sent across town is a
driver unavailable where demand is about to spike, which pushes serious dispatch
toward online stochastic optimisation rather than a sequence of independent
matchings.

::activity{id="mc-dispatch"}

**Markets that clear once.** The US medical residency match runs deferred
acceptance nationally every year, and it also shows what breaks when reality is
added. **Couples** who want jobs in the same city turn two preference lists into
one joint list, and once couples exist a stable matching may not exist at all —
finding one becomes NP-hard. The NRMP’s redesign for the 1998 match both flipped
the algorithm to applicant-proposing and adopted a heuristic that copes with
couples. School-choice systems in Boston and New York went through the same
redesign for the same reason: the mechanisms they replaced punished families who
ranked schools honestly.

**Reciprocal recommendation.** Dating and hiring are where the two halves of
this lesson collide. A suggestion is only any good if the *other* side also says
yes, so the score has to combine both directions — roughly, the chance you like
them times the chance they like you. And the scarce resource is attention: rank
purely by predicted quality and the most attractive handful of profiles collect
thousands of messages nobody can read, while everyone else gets nothing. Working
systems therefore cap exposure and ration attention on purpose. That is
recommender machinery running under matching constraints.

**Auctions.** Ad serving is matching with prices attached: many advertisers want
the same slot, and money resolves the conflict. Whether bidding honestly is safe
is then a mechanism-design question — which is why ad systems are designed by
economists about as often as by engineers.

The operational difference is worth remembering when you are on call. A
recommender that degrades serves a boring page. A matching system that degrades
gives two people the same slot, or nobody a driver. One fails soft; the other
fails hard.

## When it’s which

One question sorts most real problems.

*Does choosing this option for this person take it away from anybody else?*

If it doesn’t, you have a recommendation problem. Optimise the list, measure at
the top of it, and stay aware of the feedback loop you are standing inside.

If it does — or if the other side is allowed to say no — you have a matching
problem, and your ranking model is at most half the system. You still need a
scoring function, and every tool from Part 2 applies to building one. But those
scores are now inputs to an allocation, and the allocation is where the
difficulty lives: capacity, congestion, when you commit, and whether the people
you paired would rather have gone around you.

The expensive mistake is treating the second kind as the first — shipping a
beautifully ranked list into a market where supply runs out, then discovering
that a great recommendation nobody can act on was never a recommendation at all.
