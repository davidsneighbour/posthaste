---
id: posthaste-prepare-link
name: posthaste-prepare-link
title: Posthaste Prepare Link
description: Take a URL, pull its title/description/tags, screenshot the page, and draft a social post in Patrick's voice with topic hashtags derived from the linked page. Publishes through @humanwhocodes/crosspost or direct platform APIs only after explicit confirmation, attaches the screenshot on networks that support images, and keeps a durable per-network log of what has already been posted so the same link is never reposted to the same network by accident. Use for `/posthaste-prepare-link`, "post this link", "share this article", or "make a post about this page".
---

Turn a single URL into one confirmed social post: fetch the
page's own metadata, screenshot the page, draft an interesting long-form post
in Patrick's voice with topic hashtags, attach the screenshot on networks that
support images, publish through `@humanwhocodes/crosspost` or direct platform
APIs only after explicit confirmation, and log each network so the URL does
not get reposted to the same place later.

## Supported networks

This skill currently publishes through Crosspost to:

* `mastodon`
* `bluesky`
* `linkedin`
* `nostr`

It publishes through direct platform APIs, not Crosspost, to:

* `reddit`
* `threads`
* `tumblr`

Nostr support uses short text notes only. Crosspost requires Node.js v22 or
newer, `NOSTR_PRIVATE_KEY`, and `NOSTR_RELAYS`; this repository already targets
a newer Node version. Do not attach images to Nostr posts.

The direct API integrations for Reddit, Threads, and Tumblr do not attach local
screenshots. Reddit defaults to a link post that points at the source URL;
after the link post is created, it adds the long post text as a top-level
comment. Pass `--reddit-no-comment` only when the Reddit post should be just
the link card, and pass `--reddit-post-type self` only when a Reddit self/text
post is desired.
Threads image posts require publicly hosted image URLs, so local screenshots
are not attached there. Tumblr image posting is deliberately deferred until the
text workflow is stable.

X (Twitter) is not a supported network above and is never included in the
default `post` command or the multi-network confirmation table. The X API
requires a paid tier to publish, so this skill does not call it at all. See
[X (Twitter) manual posting](#x-twitter-manual-posting) below for the
link-based workaround, which only activates when the user explicitly names
Twitter or X.

Patreon is likewise never included in the default `post` command, the
multi-network confirmation table, or the posted-log dedup checks. Patreon has
no public post-creation API for third-party apps and no stable composer URL
to navigate to directly, so this skill drives a real browser through
Playwright instead: it clicks Patreon's own Post button to mint a new draft,
fills it in, and stops before the publish button. See
[Patreon browser-assisted posting](#patreon-browser-assisted-posting) below,
which only activates when the user explicitly names Patreon.

Keep unsupported-network implementations isolated in their own resource
scripts. `post-crosspost.ts` is the coordinator for network selection,
message-file routing, duplicate logging, and Crosspost-backed networks. Direct
API platform details live in:

* `resources/post-reddit.ts`
* `resources/post-threads.ts`
* `resources/post-tumblr.ts`

When a direct network breaks, patch and test the matching platform script
first. The coordinator should only pass CLI arguments, run the script, parse
its JSON result, and record the posted URL. The coordinator invokes these
direct scripts with `node` so they do not depend on a globally installed
`tsx`.

Use configured networks from the environment. The helper reads the current
process environment and the configured dotenv file, defaulting to `~/.env` via
`CROSSPOST_DOTENV`.

## Info command

If the user runs `/posthaste-prepare-link info` or asks for the current
posting setup, print the helper's configuration information and do not start a
draft:

```bash
node skills/posthaste-prepare-link/resources/post-crosspost.ts --info
```

The info output must include:

* the effective dotenv path
* the posted log path and whether it exists
* configured supported networks
* supported network settings: transport, Crosspost flag when applicable,
  direct script when applicable, required environment variable option groups,
  missing environment variable names, character limit, image support,
  network-specific draft suffix, and a short description
* Crosspost-backed network names
* direct API network names
* unsupported network names, currently an empty list

Never print environment variable values, access tokens, private keys, relay
URLs if they contain credentials, or other secret material.

## Context boundary

Treat the supplied URL, the metadata fetched from it, and the user's answers
to this skill's questions as the source material for the post. Do not invent
facts, quotes, or claims about the linked page beyond what the fetched
metadata and screenshot actually show. If the page's own description is thin,
say so and ask the user for the angle they want, rather than making one up.

## Scratch files and draft state

Use the current repository or project root as the working root. Keep all
generated working files under that root's local `scratch/` directory, not
under `/tmp`. If `scratch/` does not exist, ask the user whether to create it
before writing screenshots, draft files, or other working material.

For every link, create a stable slug from the page title or hostname and keep
these files:

```text
scratch/posthaste-prepare-link/<slug>.md
scratch/posthaste-prepare-link/<slug>.png
```

The Markdown file is the source of truth for the exact post text after it
exists. It must contain only the post text, including URL and hashtags; do not
store notes, metadata, front matter, tables, or instructions in that file
after a draft or rework is complete. If the user edits that file manually,
read the file again before showing any new table, publishing, or rephrasing.
When a `rephrase` or `rewrite` request arrives, first read the current file;
if the file contains extra instructions in addition to post text, use those
instructions for the rework, then overwrite the file so it contains only the
new post text.

## Required input

If no URL followed the command, ask: `What URL do you want to post about?`

Reject non-`http(s)` URLs and ask for a corrected one.

## Workflow

1. **Fetch page metadata.**

   ```bash
   node skills/posthaste-prepare-link/resources/fetch-link-metadata.ts --url "<url>"
   ```

   This returns JSON with `title`, `description`, `siteName`, `canonicalUrl`,
   `finalUrl`, `ogImage`, and `tags` (from the page's own `keywords` meta tag
   and any `article:tag` entries). Use `canonicalUrl` (falling back to
   `finalUrl`) as the stable identifier for dedup and logging in the next
   step.

   If the fetch fails (network error, non-2xx status, timeout), report the
   failure and ask the user how to proceed. Do not fabricate metadata to
   route around a failed fetch.

2. **Check the posted log before doing any more work.**

   ```bash
   node skills/posthaste-prepare-link/resources/check-posted-log.ts \
     --url "<canonicalUrl>"
   ```

   To check specific target networks, pass:

   ```bash
    --to mastodon,bluesky,linkedin,nostr,reddit,threads,tumblr
   ```

   If the URL was already posted to some networks, surface the posted and
   missing network lists. Already-posted networks do not block posting to
   missing networks. For example, if a draft was already posted to Mastodon and
   the user says `post to bluesky linkedin nostr`, use the same scratch draft
   and screenshot, then publish only to Bluesky, LinkedIn, and Nostr. Do not
   silently repost to a network that is already logged unless the user
   explicitly asks to force a repost.

3. **Take a screenshot.**

   ```bash
   node skills/posthaste-prepare-link/resources/screenshot-site.ts \
     --url "<url>" \
     --output scratch/posthaste-prepare-link/<slug>.png
   ```

   Use the repository-local scratch path described above. Default viewport is
   1280x800; pass `--full-page` only if the user asks for the whole page
   rather than the fold. Known limitation: cookie-consent banners and other
   overlays are not dismissed automatically, since that needs page-specific
   JavaScript. Show the resulting screenshot in the review table before
   asking for publish confirmation, so the user can catch a banner-dominated
   or broken capture and ask for a retake instead of publishing it blind.

4. **Derive topic hashtags.**

   Create two to four hashtags from the actual topic and angle of the linked
   page. Use the fetched title, description, visible page content, screenshot,
   and the draft's point of view as evidence. Metadata tags from step 1 may
   provide hints, but do not treat them as the source of truth and do not tell
   the user that hashtags were inferred only because the page had no tags. The
   normal behaviour of this skill is to create relevant topic hashtags.

   Skip generic or noisy hashtags (e.g. a bare "news" or "blog"). Convert each
   selected topic into a valid social hashtag:

   * lowercase everything
   * strip punctuation that is not meaningful for separation
   * join ordinary multi-word tags with no separators
   * use dashes only when two distinctive words need separation for reading

   Examples: `"open source"` becomes `#opensource`, `"TypeScript"` becomes
   `#typescript`, and `"privacy first"` may become `#privacy-first` when the
   separation improves readability. If the page is too thin to support useful
   hashtags from its topic, ask the user for the desired angle rather than
   publishing with filler tags.

5. **Draft the post.**

   Use the fetched title, description, and your own reading of the page's
   subject to write one interesting, concrete social post — a specific
   detail or a point of view, not just a restated headline or "Check this
   out:". Avoid hype, clickbait phrasing, and unsupported claims. Include the
   `canonicalUrl` (or `finalUrl`) in the post text so readers can reach the
   source. Write in Patrick's voice: plain-spoken, specific, sceptical of
   hype, direct, British English by default. If a voice-editing skill is
   available in this session, prefer running the draft through it before
   presenting it; otherwise apply that same profile directly.

   Default length target:

   ```text
   min: 600 characters
   max: 1000 characters
   ```

   Mastodon allows 1000 characters for this account and LinkedIn allows more.
   This is intentionally long-form — use at least 600 characters when there is
   enough substance, and use more of the available Mastodon room when the link
   benefits from context, caveats, or a point of view. Do not pad a thin link
   just to hit the maximum. Use shorter network-specific variants for networks
   with tighter limits.

   Write the exact draft, including URL and hashtags, to:

   ```text
   scratch/posthaste-prepare-link/<slug>.md
   ```

   This default draft should target Mastodon and LinkedIn. Bluesky and Nostr
   have much shorter limits, so if the default draft is too long and either
   network is a target, create shorter variants at:

   ```text
   scratch/posthaste-prepare-link/<slug>.bluesky.md
   scratch/posthaste-prepare-link/<slug>.nostr.md
   ```

   Keep the same URL and appropriate topic hashtags in short variants unless
   there is no room. Nostr is text-only through Crosspost, so its variant
   should stand on its own without relying on an attached screenshot. If a
   network-specific file exists, treat it as the source of truth for that
   network and read it again before publishing or rephrasing.

6. **Present the draft for confirmation.**

   Do not use a fenced code block for the review. Show a Markdown table with
   two columns: `label` and `text`. The left-column labels must be:

   * `post`
   * `hashtags`
   * `image`
   * `alt text`

   The `post` row must show the exact post text from the draft file, the
   character count, and a link to the draft file when it exists. Preserve
   paragraph breaks in the table cell with `<br><br>` if needed. The `hashtags`
   row must list the selected lowercase hashtags exactly as they appear in the
   post. The `image` row must include a small rendered preview and a link to
   the screenshot file. Do not show raw `<img>` markup, escaped HTML, or a code
   span in place of the preview. Use the renderer's actual image mechanism
   (Markdown image syntax, raw HTML only when it renders as an image, an image
   attachment, or the available local-image display tool) so the user can see
   the screenshot before confirming. The `alt text` row must show the exact
   alt text that would be sent with the image.

   When multiple networks are available, include network readiness in the
   `post` row or an additional `networks` row: configured networks, already
   posted networks, missing networks, which message file each network will use,
   and character counts against each network's limit.

   After the table, ask for the next step and show these command options:

   ```text
   edit <slug>
   edit post
   edit hashtags
   edit image
   edit alt-text
   rephrase <instructions>
   rewrite <instructions>
   post
   post to mastodon
   post to bluesky linkedin
   post to nostr
   post to reddit
   post to threads tumblr
   cancel
   ```

   Treat the command names as exact commands. The editable slugs are `post`,
   `hashtags`, `image`, and `alt-text`. `post` publishes to every configured
   supported network that has not already been logged for the URL. `post to
   <network...>` publishes only to the named network or networks. `rephrase`
   and `rewrite` are aliases for the same revision flow.

## Image handling

The screenshot from step 3 is the image attachment. Write concise, accurate
alt text describing what the screenshot actually shows (page title/section,
not a guess at content off-screen). Do not invent alt text unrelated to the
captured image.

If the user wants a different image instead of the auto-captured screenshot,
collect a local image path and alt text for it in place of the screenshot
step.

## Confirmation protocol

Accept clear publishing instructions such as:

* `post`
* `publish`
* `send it`
* `post this version`

Treat requests to revise the text, change hashtags, retake the screenshot, or
cancel as not being publishing confirmation.

Immediately before publishing, read the draft file again and restate the exact
post text and image details in the review table format. Never publish without
explicit confirmation.

When the user says `edit post`, ask them to edit the linked draft file or
provide replacement text. When they are done, read the file again and show the
table again. When the user says `edit hashtags`, update the hashtags in the
draft file so the file remains the exact publishable post, then show the table
again. When the user says `edit image`, collect or create a replacement image
path, update the image row, and show the table again. When the user says
`edit alt-text`, collect replacement alt text and show the table again.

When the user says `rephrase <instructions>` or `rewrite <instructions>`,
read the current draft file or relevant network-specific draft file, revise
only the post text according to the user's conditions, keep the URL and
appropriate hashtags unless the instruction says otherwise, write the revised
post back to the same draft file, and show the table again. If the draft file
contains additional instructions because the user edited them into it, combine
those instructions with the command conditions for the rewrite, then overwrite
the file with only the revised post.
Never publish without explicit confirmation.

## Publishing

The CLI session is expected to expose whichever environment variables are
needed for the configured target networks:

```text
MASTODON_ACCESS_TOKEN
MASTODON_HOST
BLUESKY_HOST
BLUESKY_IDENTIFIER
BLUESKY_PASSWORD
LINKEDIN_ACCESS_TOKEN
NOSTR_PRIVATE_KEY
NOSTR_RELAYS
REDDIT_ACCESS_TOKEN
REDDIT_USER_AGENT
REDDIT_SUBREDDIT
REDDIT_CLIENT_ID
REDDIT_CLIENT_SECRET
REDDIT_REFRESH_TOKEN
THREADS_APP_ID
THREADS_APP_SECRET
THREADS_CLIENT_TOKEN
THREADS_ACCESS_TOKEN
THREADS_USER_ID
THREADS_ACCESS_TOKEN_EXPIRES_AT
THREADS_USERNAME
TUMBLR_ACCESS_TOKEN
TUMBLR_REFRESH_TOKEN
TUMBLR_ACCESS_TOKEN_EXPIRES_AT
TUMBLR_BLOG_IDENTIFIER
```

The resource script defaults `CROSSPOST_DOTENV` to `~/.env` when the variable
is not already set.

For Reddit, either provide a current `REDDIT_ACCESS_TOKEN` plus
`REDDIT_USER_AGENT` and `REDDIT_SUBREDDIT`, or provide
`REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_REFRESH_TOKEN`,
`REDDIT_USER_AGENT`, and `REDDIT_SUBREDDIT` so the helper can refresh an
access token before posting. Optional `REDDIT_FLAIR_ID` is passed through when
present. Reddit posts default to link posts using `--canonical-url`, falling
back to `--source-url`; use `--reddit-link-url` to override the target or
`--reddit-post-type self` to publish a self/text post instead. For Reddit link
posts, the helper submits the link first, then posts the draft text as a
top-level comment on the new Reddit post. Use `--reddit-no-comment` to skip
that comment.

If Reddit is missing `REDDIT_REFRESH_TOKEN`, use the companion
`posthaste-reddit-refresh-token` skill. It runs a local loopback OAuth callback
server, verifies `state`, never prints the refresh token, and writes it to the
configured dotenv file only when explicitly run with `--write-env`.

For Threads, `THREADS_APP_ID`, `THREADS_APP_SECRET`, and
`THREADS_CLIENT_TOKEN` are app credentials, not enough to publish by
themselves. Posting needs `THREADS_ACCESS_TOKEN` and `THREADS_USER_ID`.
Optional `THREADS_ACCESS_TOKEN_EXPIRES_AT` records when the current long-lived
token should be refreshed, and optional `THREADS_USERNAME` lets the helper
print a best-effort public URL; otherwise it logs the returned Threads post id.

If Threads is missing `THREADS_ACCESS_TOKEN` or `THREADS_USER_ID`, or the
stored long-lived token is expired, use the companion
`posthaste-threads-refresh-token` skill. It runs a local loopback OAuth callback
server, verifies `state`, exchanges the short-lived token for a long-lived
Threads token, never prints tokens, and writes the needed values to the
configured dotenv file only when explicitly run with `--write-env`. If an
existing long-lived token is still refreshable, run the companion with
`--refresh-existing` to refresh it without a browser round trip.

For Tumblr, `TUMBLR_CONSUMER_KEY` and `TUMBLR_CONSUMER_SECRET` are app
credentials, not enough for this direct OAuth2 workflow. Posting needs
`TUMBLR_ACCESS_TOKEN` and `TUMBLR_BLOG_IDENTIFIER`. Optional
`TUMBLR_ACCESS_TOKEN_EXPIRES_AT` records when the current access token should
be refreshed.

If Tumblr is missing `TUMBLR_ACCESS_TOKEN`, `TUMBLR_REFRESH_TOKEN`, or
`TUMBLR_BLOG_IDENTIFIER`, or the stored token is expired, use the companion
`posthaste-tumblr-refresh-token` skill. It runs a local loopback OAuth callback
server, verifies `state`, never prints tokens, and writes the needed values to
the configured dotenv file only when explicitly run with `--write-env`. If an
existing refresh token is available, run the companion with
`--refresh-existing` to refresh without a browser round trip.

```bash
node skills/posthaste-prepare-link/resources/post-crosspost.ts \
  --message-file scratch/posthaste-prepare-link/<slug>.md \
  --image scratch/posthaste-prepare-link/<slug>.png \
  --image-alt "Concise screenshot description" \
  --source-url "<canonicalUrl>" \
  --canonical-url "<canonicalUrl>"
```

Use `--to mastodon`, `--to bluesky,linkedin`, `--to nostr`, `--to
reddit,threads,tumblr`, or similar when the user names specific networks. If
the user says only `post`, omit `--to` so the helper publishes to every
configured supported network that is not already logged.

If a Bluesky or Nostr variant exists at `<slug>.bluesky.md` or
`<slug>.nostr.md`, the helper uses it automatically. You can also pass
explicit network-specific files:

```bash
--message-file-bluesky scratch/posthaste-prepare-link/<slug>.bluesky.md
--message-file-nostr scratch/posthaste-prepare-link/<slug>.nostr.md
--message-file-reddit scratch/posthaste-prepare-link/<slug>.reddit.md
--message-file-threads scratch/posthaste-prepare-link/<slug>.threads.md
--message-file-tumblr scratch/posthaste-prepare-link/<slug>.tumblr.md
```

The helper skips `--image` and `--image-alt` for Nostr, Reddit, Threads, and
Tumblr. Reddit uses a link post by default rather than uploading the local
screenshot as media, then adds the long post text as a comment.

Pass `--force` only when the user explicitly wants to repost to a network that
is already logged. Pass `--no-log` only if the user explicitly does not want
this post tracked.

On success, the script itself appends a per-network record to the posted log —
no separate logging step is needed. The log defaults to:

```text
~/.local/share/posthaste-prepare-link/posted.jsonl
```

one JSON object per line. New records include a `networks` object keyed by
network name; older Mastodon-only records with `mastodonUrl` are still treated
as Mastodon posts. Pass `--log-path` to both the check and publish scripts
together if the user wants a non-default log location.

### LinkedIn token renewal

LinkedIn access tokens expire periodically. If Crosspost fails for LinkedIn
with:

```text
401 Failed to retrieve person URN
```

treat that as a likely expired or invalid `LINKEDIN_ACCESS_TOKEN`. Tell the
user that LinkedIn needs a fresh token and point them to the LinkedIn OAuth
token generator:

```text
https://www.linkedin.com/developers/tools/oauth/token-generator
```

After the user updates `LINKEDIN_ACCESS_TOKEN` in `~/.env`, rerun the same
`post to linkedin` command. Do not repost to networks that already succeeded.

## Network length handling

Use these default limits when preparing and checking drafts:

| Network | Limit | Draft file |
| --- | ---: | --- |
| `mastodon` | 1000 | `<slug>.md` |
| `bluesky` | 300 | `<slug>.bluesky.md` when needed |
| `linkedin` | 3000 | `<slug>.md` |
| `nostr` | 280 | `<slug>.nostr.md` when needed |
| `reddit` | 40000 body, 300 title | `<slug>.reddit.md` when needed |
| `threads` | 500 | `<slug>.threads.md` when needed |
| `tumblr` | 4096 conservative helper limit | `<slug>.tumblr.md` when needed |

The helper enforces these limits before publishing. If the main draft is too
long for Bluesky, Nostr, Threads, or Tumblr, create or ask the user to edit the
matching network-specific file before posting there. If Reddit needs a better
title than the first line of the post, pass `--title` when publishing.

## X (twitter) manual posting

X's posting API requires a paid developer tier, so this skill never calls it
and X/Twitter is not part of the `post` command, the network readiness table,
or the posted-log dedup checks described above. Only start this flow when the
user explicitly names Twitter or X, for example "post this to twitter" or
"post to x" — never offer it as part of the default network list.

1. Check whether the existing draft (`<slug>.md`) already fits in 280
   characters including the URL and hashtags. If it does not, write a short
   variant to:

   ```text
   scratch/posthaste-prepare-link/<slug>.twitter.md
   ```

   Keep the `canonicalUrl` (or `finalUrl`) in the text itself — that is the
   only way an image preview can appear, since the intent link below cannot
   attach a local file. X only renders a card image if the linked page
   exposes its own `og:image`/`twitter:image` metadata; if the fetched
   metadata from step 1 had no `ogImage`, tell the user the tweet will be
   text-and-link only, with no image preview.

   Do not eyeball the 280-character budget by counting the raw text. X counts
   length using its own weighted-character algorithm, which the next step
   validates for real, but the most common trap worth avoiding while drafting
   is: X auto-detects any bare domain-like substring as a link and always
   counts it as exactly 23 characters, no matter how long or short it really
   is. A brand name that happens to read like a domain (e.g. "Footer.design")
   trips this even when it is only mentioned in prose, not meant as a link —
   it gets t.co-shortened to 23 characters same as the real URL, which can
   inflate the total well past what a plain character count suggests. Prefer
   not repeating the site's own domain-styled name in the body text when the
   real URL is already in the post.

2. Build the web-intent link:

   ```bash
   node skills/posthaste-prepare-link/resources/post-twitter-intent.ts \
     --message-file scratch/posthaste-prepare-link/<slug>.twitter.md
   ```

   This validates the message with X's own weighted-length algorithm (via the
   official `twitter-text` package), not a raw character count, and prints
   JSON with `intentUrl`, `characters` (raw), `weightedLength` (what X
   actually enforces), `maxChars` (280 by default), `detectedUrls` (every
   substring X will treat as a link, including accidental domain-like
   mentions), and `opened`. The script fails if `weightedLength` is over the
   limit and lists `detectedUrls` in the error so the cause is visible;
   shorten or reword the `.twitter.md` variant and rerun rather than
   truncating on its behalf or trusting a manual character count.

3. Ask the user whether to open the link now or just receive it:

   * To open a browser directly, add `--open` to the same command.
   * Otherwise, hand the printed `intentUrl` to the user as a Markdown link
     so they can open it themselves.

   Either way, the user still has to review the prefilled compose dialog and
   press "Post" themselves — nothing is published automatically.

4. Do not record this in the posted log and do not tell the user the post was
   published. Report only that the intent link was generated (and opened, if
   requested); the actual publish happens outside this session.

## Patreon browser-assisted posting

Patreon has no public API for creating posts on a third-party app's behalf,
so this skill never calls a Patreon API and Patreon is not part of the `post`
command, the network readiness table, or the posted-log dedup checks
described above. Only start this flow when the user explicitly names
Patreon, for example "post this to patreon" or "post to patreon" — never
offer it as part of the default network list.

This flow drives a real, visible browser through the Playwright MCP tools
available in this session (not a spawned Node script) so it can fill the
actual composer form. It never automates the login step and never stores or
reads a Patreon username or password anywhere, including `.env`: login pages
are exactly where sites run bot detection (CAPTCHA, device checks, 2FA), a
scripted login risks getting the account flagged or locked, and a stored
password is a full-account credential, far more sensitive than the
post-scoped session it would replace. The human always completes login by
hand in the automated browser window.

Patreon has no stable "new post" composer URL to store and reuse: clicking
the Post nav button (the sidebar item with the `IconPosts` icon and the
label "Post") mints a brand-new draft with a fresh, one-time URL every time
it is clicked. Never save, hardcode, or reuse a composer URL observed from a
previous run — always reach the composer by clicking the Post button, and
always locate that button by its accessible role and name from a live
snapshot, never by CSS class name. Patreon's class names in the rendered DOM
(for example `sc-c7e2141-1`, `frEUhw`) are build-hashed and churn on every
deploy, so a selector copied from one session will not survive to the next.

1. **Resolve configuration.**

   ```bash
   node skills/posthaste-prepare-link/resources/patreon-config.ts
   ```

   This reads `PATREON_LOGIN_URL` (optional, defaults to
   `https://www.patreon.com/login`) and `PATREON_DASHBOARD_URL` (optional, no
   default) from the configured dotenv file and prints `{ network, loginUrl,
   dashboardUrl }`. `PATREON_DASHBOARD_URL` only needs to be set if the page
   Patreon lands you on right after login does not already show the Post nav
   button — for example if the account also has a fan-facing landing page.
   Leave it unset and rely on step 4's fallback unless a run demonstrates it
   is needed.

2. **Open the browser and check login state.** Navigate to `loginUrl` in a
   visible (non-headless) browser session. Take a snapshot. If the page
   already shows a creator-area page rather than a login form, the existing
   session is still valid — skip to step 4.

3. **Hand off for manual login.** If a login form is showing, tell the user
   the browser is open on Patreon's login page and ask them to log in
   themselves (credentials, 2FA, CAPTCHA, whatever Patreon asks for), then
   reply with something like `go ahead` when done. Do not read, fill, or
   guess at any username or password field yourself. Wait for that reply
   before continuing; do not poll or retry login-state checks in a loop.

4. **Reach a page with the Post nav button.** Take a snapshot of the current
   page. If it shows the Post nav button, stay here. If not and
   `dashboardUrl` was resolved in step 1, navigate there and snapshot again.
   If the button still is not visible, ask the user to navigate to a
   creator-area page where it is, then continue.

5. **Click Post to mint a new draft.** Click the Post nav button found in
   step 4. This immediately creates a new post on Patreon's side and
   navigates to its one-time composer URL — treat that URL as disposable,
   never reused across runs. If this flow is cancelled or fails after this
   click, tell the user an empty draft may have been left in their Patreon
   posts list and that they may want to delete it manually.

6. **Derive the title, body, and tags from the draft.** Take a snapshot of
   the fresh composer to see the live fields — do not rely on selectors from
   a previous run, since Patreon's DOM can change between sessions. Start
   from the draft text at `<slug>.md` (or a `<slug>.patreon.md` variant, same
   convention as the other networks' short variants, if the user wants
   Patreon-specific wording), but do not paste it in verbatim:

   * **Title.** Write a short, distinct headline, not the draft's full first
     paragraph verbatim — a full sentence lifted as-is reads as an oversized
     wall of bold text in Patreon's composer. Target roughly 70-80
     characters, one line, no trailing period. For example, a draft opening
     with "Footer.design is a whole gallery for the bit of the website
     people usually treat as the cupboard under the stairs: useful…"
     becomes a title like "footer.design - a collection of design
     inspirations for website footers". Use the user's own title if they
     gave one instead.
   * **Body.** Use the rest of the draft text, excluding the trailing
     hashtag line (a line consisting only of `#tag #tag ...`) — those move
     to the tags field in the next bullet instead of staying in the post
     text. Do not edit the underlying `<slug>.md` file to remove the
     hashtag line; this exclusion only applies to what gets typed into the
     Patreon body field.
   * **Tags.** Take the same hashtags, strip the leading `#` from each, and
     enter them one at a time into the composer's "Add tags" field.

   If the composer exposes a file/image upload control, attach the
   screenshot (`<slug>.png`) — clicking the toolbar's Image button opens an
   in-panel picker with its own "Browse" button; that inner "Browse" button
   is what triggers the actual native file chooser Playwright can hand
   files to, not the toolbar button itself. If no image control is found in
   the snapshot, skip the image and say so in the report rather than failing
   the run.

7. **Confirm the URL is a real link, not plain text.** Patreon's editor has
   auto-linked a bare URL on its own line asynchronously in testing, a
   second or two after typing — take a snapshot after a short wait and check
   whether the URL now appears as a `link` node with the right `href`. Only
   if it is still plain text after that, select it (click into the line,
   `End`, `Shift+Home`) and use the toolbar's Link control to link it
   manually. When deleting the hashtag line from the body (previous step),
   removing the trailing empty paragraph can occasionally touch the
   paragraph above it — take a snapshot afterward and confirm the URL
   paragraph is still intact with its link before moving on.

8. **Add the post to the creator's "Links" collection, if it already
   exists.** Open the "Add to collection" control and check its current
   selection. If a collection named "Links" is already listed, select it
   (leave it selected if the account setup already defaults to it). If no
   such collection exists yet, tell the user rather than creating a new
   collection yourself — creating a persistent, audience-visible collection
   is a bigger step than selecting an existing one and should be a decision
   the user makes explicitly.

9. **Show the filled form for review.** Take a fresh snapshot or screenshot
   of the composer after filling it and present it to the user the same way
   the confirmation table shows other networks' drafts, so they can see
   exactly what was typed into the live page.

10. **Stop before publishing.** Never click Publish, Post, Submit, or any
    equivalent control in the Patreon composer, no matter what confirmation
    phrase the user gives in this flow — publishing is always a manual click
    the human makes themselves. Leave the browser tab open on the filled
    composer and tell the user it is ready for them to review and publish.

11. **Do not log this as posted.** Since the skill never confirms the post
    went live, do not write a Patreon record to the posted log described
    under [Publishing](#publishing). Report only that the draft was filled
    in and is ready for manual review and publishing, not that it was
    published.

## Final checks

Before publishing, verify:

* the final post text matches the version the user approved
* the final post text was read from the draft file after the user's latest
  edit, rephrase, or confirmation
* the post is within each target network's character range
* any network-specific draft was read from its file after the user's latest
  edit, rephrase, or confirmation
* the selected hashtags are present in the post text, lowercase, and genuinely
  relevant, not generic filler
* the screenshot exists, has alt text, and was shown to the user before this
  confirmation step
* the URL was checked against the posted log for the target networks, and if a
  target network was already posted, the user explicitly chose to force a repost
* no secrets, tokens, credentials, or private paths are exposed
* the user explicitly confirmed publishing

If a check fails, do not publish. Explain the issue and ask for the smallest
needed correction.

After successful publishing, return each network result:

```text
Published:
- mastodon: <URL>
- bluesky: <URL>
- linkedin: <URL>
- nostr: <URL>
- reddit: <URL>
- threads: <URL or post id>
- tumblr: <URL>
```

If no URL can be extracted for a network, report `unknown`; the post is still
logged for that network, so a duplicate check will still work.

## Cleanup

Keep the draft file after publishing, rephrasing, or cancellation. Keep the
screenshot file as long as it is linked from the review table or useful for
audit. Do not move either file to `/tmp`.
