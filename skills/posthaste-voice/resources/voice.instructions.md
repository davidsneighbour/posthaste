---
description: Baseline copy and wording rules that apply to every written file, independent of any active writing task.
applyTo: "**/*.*"
references:
  - name: "Wikipedia: Signs of AI writing"
    src: https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing
---

# Voice instructions

These are mechanical, low-judgement copy rules. Apply them to any prose you
write or edit, regardless of whether a dedicated writing task is in progress.
For the deeper editorial work of matching the author's voice (tone, structure,
first person, form-specific calibration), use the `posthaste-voice` skill
instead; these rules are the baseline it builds on.

Use these rules as the final copy pass for every written file. They are stronger
than a style preference, but weaker than quoted text, legal text, required
policy wording, or a user-supplied format that explicitly needs different
punctuation or casing.

## Punctuation

* Use straight quotes (`"`, `'`), not curly or smart quotes.
* Use ASCII arrows (`->`) instead of unicode arrows if an arrow is needed in
  technical notes.
* Avoid decorative unicode symbols and emojis unless the target format
  requires them.
* Prefer commas, colons, semicolons, or periods over an em dash. Use an em
  dash only when it is genuinely the best punctuation for the sentence.
* Watch for em dash overuse during the final pass. Generated prose tends to use
  it as a universal hinge.

## Headings

Use sentence case for headings, not title case.

## Lists

* Do not start every bullet with a bold label and a colon. Use labelled
  bullets only when the labels help scanning.
* Do not turn short ideas into a vertical list of mini headings. Merge them
  into prose when the content is short.
* Avoid inline-header vertical lists when ordinary paragraphs would be clearer.

## Plain vocabulary

Prefer the plain word over the inflated one:

| Avoid | Prefer |
| --- | --- |
| utilize | use |
| leverage (verb) | use |
| delve | explain, look into |
| harness | use |
| robust | reliable |
| streamline | simplify |
| facilitate | enable, help |
| foster | encourage, support |
| garner | get |
| ecosystem | name the actual field, unless literal |
| landscape (abstract noun) | name the actual field |
| tapestry | remove |
| paradigm | approach, method |
| synergy | remove or name the actual effect |

## Filler phrases

Remove or replace filler that adds no information:

| Avoid | Prefer |
| --- | --- |
| in order to | to |
| due to the fact that | because |
| at this point in time | now |
| in the event that | if |
| has the ability to | can |
| it is important to note that | (remove it) |
| could potentially possibly | may |

Keep necessary uncertainty. Remove hedging that only protects the sentence from
having a point.

## Final copy check

Before returning or saving prose, check for:

* curly quotes
* decorative unicode
* title-case headings
* bold-first bullets
* inline-header vertical lists
* em dash overuse
* filler phrases from the table above
* clustered inflated vocabulary from the plain-vocabulary table
