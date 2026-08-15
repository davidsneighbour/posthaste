# Unsplash compliance rules

Mandatory usage rules for `posthaste-unsplash`.

These rules are operational requirements. Do not present them as optional advice.

## 1. Use returned Unsplash image URLs for display

When displaying Unsplash images or previews, use the hotlinked URLs returned by the Unsplash API under `urls`.

Do not download and re-host an image merely to present search results or previews.

For tables, use `urls.thumb` or `urls.small`.

For normal content use, prefer an appropriate returned URL such as `urls.regular`, unless the consuming workflow has another requirement.

## 2. Attribute displayed and used photos

Every displayed or selected photo must retain attribution.

At minimum preserve:

```text
photographer_name
photographer_url
photo_url
attribution_text
attribution_markdown
attribution_html
```

Human-facing search results must show attribution directly in the result table.

When another skill consumes the JSON result, do not silently discard attribution data.

## 3. Link attribution back to Unsplash

Attribution links must point to:

- the photographer's Unsplash profile;
- Unsplash itself.

Use the Posthaste referral parameters consistently.

Example:

```text
utm_source=posthaste&utm_medium=referral
```

## 4. Track selection for actual use

Unsplash's download tracking requirement applies when a photo is selected for use, not only when the user manually saves an image file.

Trigger tracking when a photo is selected for actions such as:

- using it in a blog post;
- assigning it as a hero image;
- inserting it into content;
- saving it locally for use;
- selecting it as the final asset in another workflow.

Do not track:

- search result retrieval;
- displaying candidate images;
- previewing;
- metadata inspection;
- rejected candidates.

## 5. Use `download_location`

Tracking must call the exact `links.download_location` returned for the selected photo.

Preserve any query parameters included in that URL.

Do not construct a download endpoint from the photo ID when an exact `download_location` was returned.

Do not substitute `links.download`.

## 6. Tracking is internal

The user does not need to manage or approve Unsplash tracking separately.

Do not expose a user-facing command such as:

```text
/posthaste unsplash track
```

The skill owns this mechanism automatically.

## 7. Protect credentials

Never output or log the API credential.

Render references to a configured key as:

```text
***
```

Follow `authentication.md` for credential discovery and setup.

## 8. Do not use bundled credentials

Never include or fall back to:

- a testing key;
- a demo key;
- an example key;
- a repository-owned shared credential.

The active user/project must provide its own Unsplash API Access Key.

## 9. Keep compliance data through skill handoff

For skill-to-skill calls, preserve:

```text
id
urls
photo_url
photographer_name
photographer_url
download_location
attribution_text
attribution_markdown
attribution_html
```

The parent skill may transform presentation, but it must retain the information needed for attribution and selection tracking.

## References

- https://unsplash.com/documentation
- https://help.unsplash.com/en/collections/1451694-api-guidelines
