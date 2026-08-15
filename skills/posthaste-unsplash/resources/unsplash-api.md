# Unsplash API reference

Technical reference for `posthaste-unsplash`.

## API mode and rate limits

New Unsplash applications begin in demo mode.

Typical limits:

- demo mode: 50 requests/hour;
- production mode: up to 1,000 requests/hour after approval.

When available, inspect:

```text
X-Ratelimit-Limit
X-Ratelimit-Remaining
```

Do not perform redundant API requests when an existing result can satisfy the operation.

## Search

Conceptual script interface:

```bash
./scripts/search.sh QUERY [PAGE] [PER_PAGE] [ORDER_BY] [ORIENTATION] [COLOR] [--json|--table|--preview-list]
```

Parameters:

- `QUERY` — required search query;
- `PAGE` — page number, default `1`;
- `PER_PAGE` — results per page, default `10`, maximum `30`;
- `ORDER_BY` — `relevant` or `latest`;
- `ORIENTATION` — `landscape`, `portrait`, or `squarish`;
- `COLOR` — supported Unsplash colour filter.
- `--json` — emit JSON lines for machine-readable workflows; this is the script default;
- `--table` — emit a Markdown table with a clickable image preview column for human review.
- `--preview-list` — emit stacked Markdown results with each preview image outside a table.

Where implemented, also support:

- `CONTENT_FILTER` — `low` or `high`.

User-facing command options:

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

## Random

Conceptual script interface:

```bash
./scripts/random.sh [QUERY] [COUNT] [ORIENTATION]
```

Parameters:

- `QUERY` — optional topic/query;
- `COUNT` — number of photos, default `1`, maximum `30`;
- `ORIENTATION` — `landscape`, `portrait`, or `squarish`.

Where implemented, also support:

- `CONTENT_FILTER` — `low` or `high`.

User-facing options:

```text
--count NUMBER
--orientation landscape|portrait|squarish
--content-filter low|high
--json
```

## Tracking

Internal script:

```bash
./scripts/track.sh PHOTO_ID
```

This must ultimately call the exact `links.download_location` URL returned for the chosen photo.

Preserve all query parameters on `download_location`.

The tracking request must be authenticated.

Do not substitute `links.download`.

## Image URL fields

Unsplash photo objects expose hotlinked image URLs under `urls`.

Common fields:

- `raw`;
- `full`;
- `regular`;
- `small`;
- `thumb`.

For normal web content, prefer `urls.regular` unless the consuming workflow requires another size.

For result previews, prefer `urls.thumb` or `urls.small`.

Do not infer fixed pixel dimensions from the field name; treat the URLs returned by the current API response as authoritative.

## Required photo fields

Normalise enough source data to construct the output schema:

```text
id
description
alt_description
urls
width
height
color
blur_hash
user.name
user.username
user.links.html
links.html
links.download_location
```

Preserve the exact `links.download_location`.

## Errors

### Rate limit

When safe metadata is available:

```text
Unsplash API rate limit exceeded.

Limit: 50 requests/hour
Remaining: 0
```

Do not expose authorisation headers.

### No results

Machine output:

```json
[]
```

Human output:

```text
No Unsplash photos matched those criteria.
```

### Network/API errors

Report:

- operation;
- HTTP status when available;
- safe API error message.

Never include credentials.

## Dependencies

Existing Bash scripts require:

- Bash;
- `curl`;
- `jq`.

Ubuntu/Debian:

```bash
sudo apt-get install jq
```

macOS:

```bash
brew install jq
```

If scripts are not executable:

```bash
chmod +x scripts/*.sh
```

## References

- https://unsplash.com/documentation
- https://unsplash.com/developers
