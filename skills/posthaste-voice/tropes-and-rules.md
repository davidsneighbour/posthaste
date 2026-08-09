# Author voice tropes and rules

This file is the companion checklist for the `posthaste-voice` skill. Use it during
audit and self-audit passes. These patterns are warning signs, not absolute
bans. One occurrence can be fine. A cluster usually means the prose has drifted
away from the author's voice or has become weak, generic, or assistant-shaped.

## Core diagnostic rule

Bad drafts usually have more than one of these traits at once:

* inflated significance
* vague authority
* polished but empty rhythm
* fake contrast
* list-shaped structure disguised as prose
* over-explained transitions
* decorative formatting
* generic positive closure
* personality added as garnish

Fix the underlying sentence, not only the keyword.

## Author voice baseline

The author's prose should usually feel:

* plain-spoken, specific, and grounded
* technically precise without becoming pompous
* opinionated when the material calls for judgement
* economical with praise and adjectives
* allergic to hype, engagement bait, and vague authority
* comfortable leaving a real edge in the sentence
* written for a reader who can think

Do not turn this into a costume. The right voice depends on the draft's form and
evidence.

## Voice drift

### Generic assistant voice

Watch for:

* Great question
* Absolutely
* Certainly
* I hope this helps
* Let me know if you want
* Here is a polished version
* Let's dive in
* Let's explore
* Let's unpack

Remove chatbot residue from the content. If a transition is needed, write the
substance instead.

### Corporate shine

Watch for:

* seamless
* powerful
* robust
* intuitive
* vibrant
* transformative
* unlocks
* empowers
* enhances
* streamlines
* commitment to
* delivers value
* at scale

The author's voice can praise something, but the praise needs a reason.

Before:

> The new workflow unlocks a seamless and powerful editing experience.

After:

> The new workflow removes the two manual steps that made edits easy to miss.

### Fake warmth

Watch for:

* friendly little asides that do not sound like the author
* apologies inserted to soften a clear point
* over-explaining obvious constraints
* cheerfulness where the draft is making a criticism
* "we" used to manufacture intimacy with the reader

Warmth should come from clarity and attention, not from padding.

### Flattened opinion

Watch for a draft that removes the author's actual stance and replaces it with
balanced neutrality.

Before:

> There are a number of trade-offs to consider when evaluating this approach.

After:

> I would not use this approach unless the team already accepts the extra
> maintenance cost.

Use first person only when the source supports it.

## Word choice tells

### Inflated significance

Watch for:

* serves as
* stands as
* testament
* reminder of
* pivotal
* crucial
* vital
* significant
* underscores
* highlights the importance of
* reflects broader
* symbolises
* enduring legacy
* lasting impact
* setting the stage
* marks a shift
* evolving landscape
* focal point
* indelible mark
* deeply rooted

Fix by stating the concrete fact.

Before:

> The project stands as a testament to the enduring value of open collaboration.

After:

> The project has accepted patches from 42 contributors since 2022.

### Magic adverbs

Watch for:

* quietly
* deeply
* fundamentally
* remarkably
* arguably
* truly
* simply, when used to assert obviousness

These words often try to make an ordinary point feel weighty.

### AI vocabulary clusters

Watch for repeated use of:

* additionally
* align with
* delve
* enhance
* foster
* garner
* highlight
* interplay
* intricate
* landscape
* leverage, as a verb
* robust
* streamline
* tapestry
* utilize
* valuable
* vibrant

Fix by choosing the ordinary word the sentence wanted in the first place.

### Ornate abstract nouns

Watch for:

* tapestry
* landscape
* paradigm
* synergy
* ecosystem, unless it is genuinely technical or biological
* framework, unless it names an actual framework

Fix by naming the field, system, market, codebase, group, or relationship.

## Attribution and factuality tells

### Vague authority

Watch for:

* experts say
* observers argue
* industry reports suggest
* critics have noted
* some publications say
* several sources claim
* it is widely believed

Fix by naming the source, removing the claim, or writing the claim as the author's
own judgement when that is true.

### Notability padding

Watch for lists of media outlets, follower counts, awards, or citations that do
not support a concrete point.

Before:

> Her work has appeared in national and international media outlets.

After:

> In a 2024 interview with [source], she argued that the rule would mostly hurt
> small suppliers.

### Knowledge-cutoff residue

Remove or rewrite:

* as of my last update
* based on available information
* details are scarce
* while specific details are limited
* it appears that

Use a source, ask for verification, or state the uncertainty in normal prose.

### Ungrounded claims

A non-trivial claim should be backed by something already present in the
material: a mechanism, an example, a metric, a named source, or a direct
observation. If the draft only asserts an outcome, look for the supporting
detail the source already contains and attach it. Do not invent the missing
support.

Before:

> This improves maintainability.

After:

> This improves maintainability because the module boundary is now explicit
> and the dependency graph is smaller.

Match the strength of the wording to the strength of the evidence. Words like
"always", "never", "proves", or "guarantees" need real support. When the
evidence is limited, narrower wording is more honest:

* often
* in this project
* in our tests
* under this setup
* tends to

## Sentence structure tells

### Copula avoidance

Watch for fancy substitutes for "is", "are", or "has":

* serves as
* functions as
* stands as
* marks
* represents
* boasts
* features
* offers

Before:

> The gallery serves as the organisation's main exhibition space.

After:

> The gallery is the organisation's main exhibition space.

### Superficial present-participle analysis

Watch for trailing `-ing` phrases that add fake depth:

* highlighting
* underscoring
* emphasising
* ensuring
* reflecting
* symbolising
* contributing to
* fostering
* cultivating
* encompassing
* showcasing

Before:

> The design uses blue and green, reflecting the region's connection to nature.

After:

> The design uses blue and green. The brief says the colours refer to the local
> coastline and forest.

### Negative parallelism

Watch for:

* It is not X, it is Y
* Not only X, but Y
* The question is not X. The question is Y.
* Not X. Not Y. Just Z.
* X, not Y
* not because X, but because Y

This structure is useful once in a while. Repeated use turns a draft into a
sequence of fake revelations.

### Self-posed rhetorical questions

Watch for:

* The result? …
* The problem? …
* The worst part? …
* The real question is …

Fix by writing the statement directly unless the author's sample clearly uses this
move.

### Rule of three and tricolon abuse

Watch for repeated triple structures:

* faster, smarter, better
* workflows, decisions, and interactions
* ideate, iterate, and deliver
* innovation, inspiration, and insight

Fix by cutting the weakest item or making the list real.

### False ranges

Watch for `from X to Y` when X and Y are not endpoints on a meaningful scale.

Before:

> The article covers everything from innovation to cultural transformation.

After:

> The article covers product design, adoption, and company culture.

### Elegant variation

Watch for needless synonym cycling:

* protagonist, main character, central figure, hero
* company, organisation, firm, enterprise
* tool, platform, system, solution

Fix by repeating the right noun.

### Passive voice and subjectless fragments

Rewrite passive or fragmentary lines when the actor matters.

Before:

> No configuration file needed. The results are preserved automatically.

After:

> You do not need a configuration file. The system saves the results
> automatically.

## Paragraph and composition tells

### Listicle in prose form

Watch for paragraphs that start:

* The first…
* The second…
* The third…
* Another key point…
* Finally…

Use an actual list if a list is useful, or write connected prose.

### Short punchy fragment abuse

A few fragments can work. Too many read like generated motivational copy.

Before:

> He published this. Openly. In a book. As a priest.

After:

> He published it openly, in a book, while still working as a priest.

### Fractal summaries

Watch for repeated preview-summary loops:

* In this section, we will…
* As discussed above…
* To recap…
* This section has shown…

Cut the scaffold.

### One-point dilution

Watch for the same argument restated with new metaphors across multiple
paragraphs. Keep the strongest version and remove the rest.

### Historical analogy stacking

Watch for rapid-fire lists of companies, eras, or revolutions used as authority.
One comparison can help. Five often means the argument lacks evidence.

### Dead metaphor

Watch for one metaphor repeated across a whole piece. Use it once, then move on.

### Formulaic challenges section

Watch for:

* Despite its promise, X faces several challenges
* Despite these challenges, X continues to thrive
* Challenges and future outlook

Fix by naming specific constraints, dates, actors, or decisions.

### Generic positive conclusion

Cut endings like:

* The future looks bright
* Exciting times lie ahead
* This is a major step in the right direction
* The journey continues

End with the next concrete fact, implication, or unresolved question.

## Form-specific rules

### Blog posts and essays

Prefer:

* a clear reason the piece exists
* a route through the author's thinking
* concrete examples from the source
* honest uncertainty when the source supports it
* a conclusion that earns its last paragraph

Avoid:

* TED-talk cadence
* universal claims about what "we all" experience
* fake vulnerability
* thesis paragraphs that explain the obvious
* ending on inspiration when the piece is actually about a problem

### Documentation and tutorials

Prefer:

* direct task flow
* accurate terminology
* examples that compile or match the documented system
* headings that help scanning
* warnings only where the reader can act on them

Avoid:

* marketing language in technical instructions
* "simply" before hard steps
* "just" before brittle steps
* unexplained abstractions
* fake friendliness that hides requirements

### Letters and personal notes

Prefer:

* the actual point early
* natural sentence rhythm
* enough context for the recipient
* warmth that sounds earned
* direct asks and next steps

Avoid:

* over-polished diplomacy
* generic gratitude paragraphs
* phrases that sound copied from a template
* apologising for having a reasonable request

## First-person experiential writing

Use first person when the draft is the author's lived view or experience and the
user has not asked for an impersonal form.

### Use this mode for

* personal blog posts
* tutorials written from experience
* opinion pieces
* reviews
* retrospectives
* post-mortems
* build logs
* conference recaps
* newsletters
* personal guides

### Do not use this mode for

* academic writing
* encyclopedic writing
* reference documentation
* legal or compliance text
* official reports
* neutral journalism
* institutional copy

### Rewrite rules

1. Replace neutral claims with the route that led to the claim.
2. Keep the author's real uncertainty, frustration, surprise, or change of mind
   when the source supports it.
3. Use time markers only when supplied or safely generic.
4. Keep judgements in the author's voice.
5. Do not universalise the author's experience.
6. Do not invent proof, receipts, conversations, metrics, or client names.
7. Do not write "I" unless the text represents the author's experience or opinion.

Before:

> Database indexing is a critical aspect of performance optimisation.

After:

> I used to add indexes whenever a query felt slow. That worked until writes
> started crawling because every insert had to update indexes nobody had looked
> at in two years.

### First-person anti-patterns

Watch for:

* I'm no expert, but…
* I think that I believe that…
* everyone has been there
* we all know
* so basically I was like
* honestly, tbh, ngl, when performative
* invented dates, people, project names, or numbers

## Formatting tells

The baseline punctuation, heading-case, unicode, and bullet-formatting rules
are always-on and live in `voice.instructions.md` in this skill directory. Apply
them during every edit. Watch in particular for em dash overuse, bold-first
bullets, inline-header vertical lists, title-case headings, decorative unicode,
and curly quotes, since generated prose drifts toward all of them by default.

## Filler and hedging

Replace filler with direct wording:

* in order to -> to
* due to the fact that -> because
* at this point in time -> now
* in the event that -> if
* has the ability to -> can
* it is important to note that -> remove it
* could potentially possibly -> may

Keep necessary uncertainty. Remove hedging that only protects the sentence from
having a point.

## Review output checklist

When reviewing instead of rewriting, report issues in terms the user can act on:

* quote the weak phrase or provide a line reference
* name the trope or voice problem
* explain why it weakens the piece
* suggest a concrete edit

Do not produce a generic school-marking rubric. The review should help the next
revision happen quickly.

## Final self-audit

Before returning a rewrite or review, ask internally:

> What still sounds unlike the author?

Then check for:

* repeated sentence openings
* too many contrast structures
* too many lists
* too many short paragraphs
* unsupported claims
* vague authority
* inflated ending
* decorative formatting
* words from the watch lists still clustered together
* first-person details the user did not provide
* politeness that weakens a clear point
* opinions flattened into committee prose

Revise once more before sending or writing the final version.
