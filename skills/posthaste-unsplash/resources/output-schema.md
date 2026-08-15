# Unsplash output schema

Defines human-facing and machine-readable output for `posthaste-unsplash`.

## Human-facing preview output

Interactive chat searches return stacked Markdown results so preview images render outside table cells.

Use:

```markdown
### [PHOTO_ID](PHOTO_URL)
![Preview: Orange sunset behind a mountain range](SMALL_URL)

- Photographer: [Jane Smith](PHOTOGRAPHER_URL)
- Dimensions: 6000 x 4000
- Description: Orange sunset behind a mountain range
- Attribution: Photo by [Jane Smith](PHOTOGRAPHER_URL) on [Unsplash](UNSPLASH_URL)
```

Requirements:

- The preview image uses an Unsplash hotlinked `urls.small` or `urls.thumb` URL.
- The photo ID links to the Unsplash photo page.
- The photographer links to the photographer's Unsplash profile.
- Attribution is always visible.
- Links back to Unsplash use the configured UTM referral parameters.

Do not embed locally downloaded thumbnails.

## Human-facing result table

Markdown table output is available for renderers known to support images inside table cells.

Use:

```markdown
| Preview | Photo | Photographer | Dimensions | Description | Attribution |
| --- | --- | --- | --- | --- | --- |
| [![preview](THUMB_URL)](PHOTO_URL) | [PHOTO_ID](PHOTO_URL) | [Jane Smith](PHOTOGRAPHER_URL) | 6000 × 4000 | Orange sunset behind a mountain range | Photo by [Jane Smith](PHOTOGRAPHER_URL) on [Unsplash](UNSPLASH_URL) |
```

Requirements:

- `Preview` uses the Unsplash hotlinked thumbnail/small URL.
- `Photo` links to the Unsplash photo page.
- `Photographer` links to the photographer's Unsplash profile.
- Keep descriptions concise enough for table display.
- Attribution is always visible.
- Links back to Unsplash use the configured UTM referral parameters.

## JSON output conditions

Return JSON when:

- the user explicitly requests JSON;
- `--json` is supplied;
- another skill requests machine-readable data.

Return:

- an array for multiple candidates;
- a single object when exactly one selected photo is requested.

## Canonical photo object

```json
{
  "id": "abc123xyz",
  "description": "A beautiful sunset over mountains",
  "alt_description": "orange sunset behind mountain range",
  "urls": {
    "raw": "https://...",
    "full": "https://...",
    "regular": "https://...",
    "small": "https://...",
    "thumb": "https://..."
  },
  "width": 6000,
  "height": 4000,
  "color": "#f3a460",
  "blur_hash": "L8H2#8-;00~q4n",
  "photographer_name": "Jane Smith",
  "photographer_username": "janesmith",
  "photographer_url": "https://unsplash.com/@janesmith?utm_source=posthaste&utm_medium=referral",
  "photo_url": "https://unsplash.com/photos/abc123xyz?utm_source=posthaste&utm_medium=referral",
  "download_location": "https://api.unsplash.com/photos/abc123xyz/download?ixid=...",
  "attribution_text": "Photo by Jane Smith on Unsplash",
  "attribution_markdown": "Photo by [Jane Smith](https://unsplash.com/@janesmith?utm_source=posthaste&utm_medium=referral) on [Unsplash](https://unsplash.com/?utm_source=posthaste&utm_medium=referral)",
  "attribution_html": "Photo by <a href=\"https://unsplash.com/@janesmith?utm_source=posthaste&utm_medium=referral\">Jane Smith</a> on <a href=\"https://unsplash.com/?utm_source=posthaste&utm_medium=referral\">Unsplash</a>"
}
```

## Field rules

### Core photo data

Preserve:

```text
id
description
alt_description
urls
width
height
color
blur_hash
```

`description` and `alt_description` may be `null` when Unsplash does not provide them.

### Photographer fields

Derive:

```text
photographer_name
photographer_username
photographer_url
```

The photographer URL must link to the photographer's Unsplash profile and include the required referral parameters.

### `photo_url`

Link to the photo's page on Unsplash.

Include referral parameters.

### `download_location`

Preserve the exact `links.download_location` returned by Unsplash, including query parameters.

This field is operational metadata. It is needed so the selected image can be tracked correctly.

Do not display it in the normal human-facing result table.

### Attribution fields

Always generate:

```text
attribution_text
attribution_markdown
attribution_html
```

Plain text:

```text
Photo by Jane Smith on Unsplash
```

Markdown:

```markdown
Photo by [Jane Smith](PHOTOGRAPHER_URL) on [Unsplash](UNSPLASH_URL)
```

HTML:

```html
Photo by <a href="PHOTOGRAPHER_URL">Jane Smith</a> on <a href="UNSPLASH_URL">Unsplash</a>
```

## Empty results

Machine-readable output:

```json
[]
```

Human-facing output:

```text
No Unsplash photos matched those criteria.
```

## Secrets

Never include:

```text
UNSPLASH_ACCESS_KEY
Authorization
client_secret
```

or any other credential in structured output.
