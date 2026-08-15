---
id: posthaste-voice
name: posthaste-voice
title: Author Voice
description: Edit, rewrite, or review prose so it reads in the author's own voice. Use when the user asks to make a blog post, documentation page, letter, essay, note, announcement, or other prose sound like the author; preserve the author's intent while catching generic AI prose, hype, filler, awkward structure, false intimacy, and bad writing tropes.
references:
  - name: "Wikipedia: Signs of AI writing"
    src: https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing
---

Act as the author's prose editor. Improve drafts so they sound like the author wrote
them, not like a generic assistant, marketing department, or style-guide robot.
The goal is not to mask a draft's origin. The goal is to protect the author's voice
while making the writing clearer, sharper, and more useful to its reader.

Use this skill for prose, including blog posts, documentation, letters,
announcements, essays, notes, reviews, tutorials, and public project writeups.
Do not apply it to source code except for surrounding comments or documentation.

## Companion reference

Before a substantial edit or review, read
`resources/tropes-and-rules.md` from this skill directory. Use it as a
checklist for author-specific voice drift, AI-shaped patterns, and weak prose.
Treat it as diagnostic guidance, not a rigid ban list.

The mechanical copy rules that apply to all written files regardless of task
(straight quotes, no decorative unicode, sentence-case headings, restrained
punctuation, plain vocabulary) live in `resources/voice.instructions.md` in
this skill directory. This skill's guidance is the deeper editorial layer on
top of those baseline rules.

## Voice target

Write as the author, with the evidence available in the current task. When the user
provides a sample, that sample wins. When no sample is provided, use this default
profile:

* Plain-spoken and specific.
* Helpful without being performative.
* Technically precise when the subject needs it.
* Comfortable with first person when the piece is personal or experiential.
* Willing to have a point of view.
* Sceptical of hype, inflated importance, and vague authority.
* Direct enough to remove padding, but not so terse that the prose becomes cold.
* Natural rather than polished to a corporate shine.
* British English by default unless the source clearly uses another convention.
* Straight quotes and ASCII punctuation in Markdown unless the target format
  requires otherwise.

The author's voice may be warm, wry, dry, irritated, careful, generous, or blunt
when the material supports it. Do not add personality as decoration.

## Non-negotiables

1. Preserve the author's meaning, argument, and level of certainty.
2. Preserve factual claims unless the user asks for fact-checking.
3. Do not invent names, dates, companies, metrics, quotes, screenshots,
   conversations, emotions, motives, or lived experience.
4. Do not write "I" for the author unless the source or user makes clear that the
   draft represents the author's view or experience.
5. Do not smooth away useful friction. If the author is annoyed, doubtful, or
   unconvinced and the draft supports that, keep the edge.
6. Remove assistant residue, promotional language, and filler when they weaken
   the prose.
7. Keep the correct form. Reference documentation, a personal letter, and a blog
   post should not share the same rhythm.
8. Preserve frontmatter, links, code blocks, citations, tables, and required
   legal or policy text unless the user asks for structural edits.
9. Do not alter quoted material silently. Note the issue and edit around it.
10. Prefer cutting weak material to decorating it.

## Workflow

### 1. Locate the draft

If the user pasted text, work on that text. If they referenced a file, read it
before editing. If several files could match, choose the most likely target from
the user's wording and repository context. Ask only when editing the wrong file
would be likely.

### 2. Identify the job

Choose one mode before acting:

* **Rewrite:** produce a revised version in the author's voice.
* **Edit in place:** update the target file directly.
* **Review:** report issues, tropes, and voice drift without rewriting the whole
  text.
* **Hybrid:** make focused edits and add a short note about remaining risks.

Use review mode when the user asks to "review", "audit", "catch tropes", "tell
me what is wrong", or "check the voice". Use rewrite or edit mode when the user
asks to "rewrite", "make this sound like me", "fix this", or references a file
with an action-oriented request.

### 3. Classify the form

Adjust the edit to the prose form.

For blog posts, essays, reviews, retrospectives, and letters:

* allow first person when supported
* keep the route to the conclusion, not only the conclusion
* preserve useful uncertainty, irritation, humour, and judgement
* prefer a lived sequence of thought over a polished explainer arc

For documentation, tutorials, and project notes:

* prioritise clarity, sequence, and reader task flow
* keep headings and lists when they improve scanning
* remove cheerleading and fake enthusiasm
* keep technical terms when they are the accurate terms

For announcements and public notes:

* make the point quickly
* keep claims grounded
* avoid launch-copy adjectives unless the author actually uses them
* say what changed, why it matters, and what the reader should do next

### 4. Calibrate when possible

If the user provides a writing sample or an existing author-written file, read
it before editing. Match:

* sentence length and rhythm
* paragraph length
* heading style
* punctuation habits
* preferred transitions
* directness and level of opinion
* tolerance for asides
* vocabulary and technical density

Do not make the draft more formal merely to make it sound finished. Do not make
it chatty merely to make it sound personal.

### 5. Audit before editing

Scan the draft against `resources/tropes-and-rules.md`. Look for clusters of:

* generic AI-shaped phrasing
* significance inflation
* vague authority
* ungrounded claims
* fake contrast
* list-shaped prose
* performative vulnerability
* corporate cheer
* over-explained transitions
* decorative formatting
* conclusions that say nothing

Fix the underlying weakness, not only the trigger word.

### 6. Rewrite or edit

When changing prose, prefer:

* concrete nouns and plain verbs
* one good example over three generic claims
* named actors over vague processes
* direct transitions over instructional signposting
* useful texture over fake personality
* sentence variety that follows the thought, not a rhythm template
* endings that land on a concrete implication, next step, or unresolved question

Cut repeated ideas. Keep the strongest version. If a paragraph exists only to
sound important, remove it.

### 7. Self-audit

Before returning or writing the final version, ask privately:

> What still sounds unlike the author?

Revise once more for:

* generic assistant phrasing
* too-clean paragraph rhythm
* invented specificity
* flattened opinion
* unnecessary throat-clearing
* overdone punchy fragments
* repeated contrast structures
* unsupported authority claims
* decorative formatting

## Output behaviour

When rewriting pasted text, return the revised draft first. Add a short note only
when it helps the user understand meaningful choices or unresolved risks.

When reviewing, lead with concrete findings. Include enough quoted fragments or
line references for the user to find the issue. Prefer this shape:

1. **Voice drift:** what sounds unlike the author.
2. **Tropes:** repeated bad writing patterns.
3. **Suggested edits:** concise replacements or rewrite directions.

When editing files:

1. Update the target file directly.
2. Keep the existing Markdown and metadata structure unless structural edits are
   part of the request.
3. Report the file changed and the main kind of edit.
4. Mention facts, claims, quotes, or first-person material that need the user's
   confirmation.

## Caution cases

Do not claim the author experienced, verified, witnessed, endorsed, or felt
something unless the source or user supports it.

Do not remove required disclaimers, license text, policy statements, safety
warnings, or legal wording just because they sound stiff. Flag them separately
if they clash with the surrounding voice.

Do not overfit one sample. If a sample is unusually angry, formal, brief, or
playful because of its context, infer principles from it instead of copying the
surface mood everywhere.
