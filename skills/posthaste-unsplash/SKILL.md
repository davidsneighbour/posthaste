---
name: posthaste-unsplash
description: Search, preview, select, and retrieve Unsplash photos with required attribution and download tracking. Use for Unsplash searches, stock-photo requests, random photo selection, image discovery for content, or when another Posthaste skill needs Unsplash image candidates. Treat "find" requests as searches.
argument-hint: "help | search [query] [options] | random [topic] [options]"
---

# Posthaste Unsplash

Search, preview, select, and retrieve photos through the Unsplash API.

The skill supports two modes:

1. **Interactive use** — a user searches or requests random photos, reviews a result table, and chooses an image.
2. **Skill-to-skill use** — another skill requests image candidates and consumes structured JSON.

Always preserve the requirements defined in `references/compliance.md`.

## Required references

Read the relevant reference before performing the associated operation:

- `references/authentication.md` — credential discovery, validation, safe handling, and setup guidance.
- `references/unsplash-api.md` — API parameters, rate limits, endpoint behaviour, and script interfaces.
- `references/output-schema.md` — human table output, JSON output, and attribution fields.
- `references/compliance.md` — mandatory Unsplash API usage rules.

For any API request, read `references/authentication.md` and `references/compliance.md` first.

## Command routing

Recognise:

```text
/posthaste unsplash help
/posthaste unsplash search
/posthaste unsplash search QUERY [options]
/posthaste unsplash random
/posthaste unsplash random TOPIC [options]
```

Also recognise equivalent natural-language instructions.

Treat **find** as an alias for **search**.

Examples:

```text
/posthaste unsplash find modern architecture
find Unsplash photos of Koh Samui
find me a landscape image from Unsplash
```

All invoke the search workflow.

Do not expose download tracking as a user command.

## Help

When the user runs:

```text
/posthaste unsplash help
```

explain both modes and their parameters.

### Search

```text
/posthaste unsplash search [QUERY] [options]
```

Alias:

```text
/posthaste unsplash find [QUERY] [options]
```

Options:

```text
--page NUMBER
--per-page NUMBER
--order-by relevant|latest
--orientation landscape|portrait|squarish
--color black_and_white|black|white|yellow|orange|red|purple|magenta|green|teal|blue
--content-filter low|high
--json
--table
--preview-list
```

Defaults:

```text
page: 1
per-page: 10
order-by: relevant
content-filter: low
```

### Random

```text
/posthaste unsplash random [TOPIC] [options]
```

Options:

```text
--count NUMBER
--orientation landscape|portrait|squarish
--content-filter low|high
--json
```

Defaults:

```text
count: 1
content-filter: low
```

Explain:

- `search` finds ranked photos matching a query.
- `random` requests random photos, optionally constrained by a topic or orientation.
- `--json` returns the structured format defined in `references/output-schema.md`.
- `--table` returns a Markdown table with clickable image previews from the returned Unsplash thumbnail URLs.
- `--preview-list` returns stacked Markdown results with each preview image outside a table for chat clients that do not render table-cell images reliably.

Do not present tracking as an option.

## Search workflow

### Search with arguments

Validate the supplied parameters against `references/unsplash-api.md`, then invoke the existing search script.

Example request:

```text
/posthaste unsplash search modern architecture --orientation landscape --per-page 5
```

Conceptual script invocation:

```bash
./scripts/search.sh "modern architecture" 1 5 relevant landscape --preview-list
```

Use `--preview-list` for interactive chat-facing results so the response includes visible preview images. Use `--table` only in renderers known to support images inside Markdown tables. Use `--json` or omit display flags for machine-readable output.

Supply additional supported filters according to the script implementation.

Do not invent unsupported values.

### Search without arguments

For:

```text
/posthaste unsplash search
```

or:

```text
/posthaste unsplash find
```

ask for the missing search query.

Offer these optional settings when useful:

- number of results;
- orientation;
- order;
- colour;
- content filter.

Do not require the user to configure every optional setting.

Use defaults for omitted optional settings.

### Find routing

Any request whose operative intent is to find an Unsplash image uses search.

Examples:

```text
find a sunset photo
find photos of tropical villas
find me an Unsplash image for this article
```

Do not interpret `find` as random selection.

## Random workflow

### Random with arguments

Validate parameters against `references/unsplash-api.md`, then invoke the existing random-photo script.

Example:

```text
/posthaste unsplash random architecture --count 5 --orientation landscape
```

Conceptual script invocation:

```bash
./scripts/random.sh "architecture" 5 landscape
```

### Random without arguments

For:

```text
/posthaste unsplash random
```

ask for options before performing the request.

Offer:

- optional topic;
- number of results;
- optional orientation;
- optional content filter.

If the user explicitly says that no filtering matters, use the defaults.

## Interactive workflow

When the user manually invokes the skill:

1. run the authentication gate from `references/authentication.md`;
2. search or retrieve random images;
3. present results using the table format from `references/output-schema.md`;
4. include required attribution;
5. let the user choose an image;
6. when an image is selected for actual use, run the internal tracking mechanism;
7. return the selected image information.

Allow the user to identify a result by:

- row number;
- photo ID;
- photographer/photo combination;
- another unambiguous reference.

Do not track mere previews or rejected candidates.

## Skill-to-skill workflow

Another skill may call this skill when it needs image candidates.

Example:

```text
Find 5 landscape Unsplash images matching "industrial architecture".
Return JSON.
```

### Candidate selection

When another skill needs the user to choose:

1. authenticate;
2. perform the requested search;
3. return structured candidate data;
4. preserve IDs, URLs, attribution, and `download_location`;
5. let the parent skill present or evaluate candidates;
6. after selection for actual use, perform download tracking.

### Automatic choice

If the parent skill or user explicitly delegates the choice, for example:

```text
choose an image for me
pick something suitable
use a random suitable photo
```

then:

1. derive an appropriate search query from the parent task;
2. request one suitable photo unless more are explicitly required;
3. select the resulting image;
4. trigger download tracking;
5. return the structured photo object to the parent skill.

Do not return a large candidate set when only one automatically selected image is required.

## Internal download tracking

Download tracking is an implementation mechanism, not a user-facing command.

Existing script:

```bash
./scripts/track.sh PHOTO_ID
```

Trigger it only when an image is selected for an action equivalent to using/downloading it, as defined in `references/compliance.md`.

Never ask whether tracking should happen.

Never expose:

```text
/posthaste unsplash track
```

## Existing scripts

Assume these scripts exist:

```text
scripts/search.sh
scripts/random.sh
scripts/track.sh
```

See `references/unsplash-api.md` for their expected interfaces.

## Error handling

Follow credential-specific handling in `references/authentication.md`.

For other failures:

- include the HTTP status when available;
- include the safe Unsplash error message when available;
- identify which operation failed;
- never expose credentials or authorisation headers.

For no results in human-facing output:

```text
No Unsplash photos matched those criteria.
```

Offer to broaden the query or remove filters.

For JSON output, return:

```json
[]
```

For invalid parameters, identify the invalid value and list accepted values.

Do not silently replace invalid values unless the correction is unambiguous.

## Operational rules

1. Read authentication and compliance references before API calls.
2. Never expose `UNSPLASH_POSTHASTE_ACCESS_KEY` or `UNSPLASH_ACCESS_KEY`.
3. Never use a bundled, demo, testing, or repository-owned shared key.
4. Treat `find` as `search`.
5. Ask for a query when `search`/`find` has none.
6. Ask for random-photo options when `random` has no parameters.
7. Use table output for interactive human-facing results.
8. Use JSON for machine-to-machine requests or explicit `--json`.
9. Preserve attribution data in structured output.
10. Trigger download tracking when a photo is selected for actual use.
11. Never expose tracking as a user command.
12. Avoid unnecessary API requests.
13. Never log credentials or authorisation headers.

## References

- Unsplash API documentation: https://unsplash.com/documentation
- Unsplash developer applications: https://unsplash.com/developers
- Unsplash API guidelines: https://help.unsplash.com/en/collections/1451694-api-guidelines
