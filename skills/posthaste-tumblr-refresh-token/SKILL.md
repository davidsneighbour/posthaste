---
id: posthaste-tumblr-refresh-token
name: posthaste-tumblr-refresh-token
title: Posthaste! Tumblr Refresh Token
description: Create or refresh Tumblr OAuth2 credentials for the posthaste-prepare-link direct Tumblr poster using a local loopback callback server. Use when Tumblr posting is missing TUMBLR_ACCESS_TOKEN, TUMBLR_REFRESH_TOKEN, or TUMBLR_BLOG_IDENTIFIER, when the Tumblr token has expired, or when the user asks to generate Tumblr credentials for posthaste-prepare-link.
---

Generate or refresh Tumblr OAuth2 credentials for the
`posthaste-prepare-link` Tumblr publisher without exposing tokens in chat or
terminal output.

## Bare invocation

If the user invokes `posthaste-tumblr-refresh-token` without more context, explain
that the skill can be used directly or as a sub-skill from
`posthaste-prepare-link`, but the bundled script is not conversational. Tell
the user that a direct run opens Tumblr in the browser, waits for the local
callback, writes token values to `~/.env` only when `--write-env` is used, and
never prints tokens or authorization codes.

Show this command shape:

```bash
node skills/posthaste-tumblr-refresh-token/scripts/create-tumblr-refresh-token.ts \
  --write-env
```

Then ask whether the user wants to run the setup now.

## Safety model

Never print, paste, summarise, or otherwise reveal `TUMBLR_ACCESS_TOKEN`,
`TUMBLR_REFRESH_TOKEN`, `TUMBLR_CONSUMER_SECRET`, short-lived access tokens, or
authorization codes.

Use the bundled script:

```bash
node skills/posthaste-tumblr-refresh-token/scripts/create-tumblr-refresh-token.ts
```

The script enforces the core safety checks:

* redirect URI must be `http://` or `https://`; a hosted (non-loopback) URI
  must be `https://` and switches to the interactive paste flow instead of a
  local server
* per-run random OAuth `state` with callback verification, in both flows
* no token printing
* explicit `--write-env` before requesting or refreshing a token
* private dotenv permissions; refuses to write if the file is group/other
  readable unless `--fix-permissions` is passed
* one local callback request, then server shutdown

## Required tumblr app setup

The user needs a Tumblr app at:

```text
https://www.tumblr.com/oauth/apps
```

Tumblr does not accept `localhost`/`127.0.0.1` redirect URIs for this app, so
the app's OAuth callback URL must be the hosted callback microsite in
`auth-site/`, not a loopback URI. See
[`auth-site/README.md`](auth-site/README.md) for deployment and the current
live URL. Register the `/callback` path on that domain as the app's OAuth
Callback URL, e.g.:

```text
https://boisterous-wisp-bf8cd6.netlify.app/callback
```

Tumblr requires the redirect URI in the authorization request to match the app
registration exactly, including host, path, and trailing slash. Pass the same
URI to the helper with `--redirect-uri`; a non-loopback `--redirect-uri`
switches the helper from the local-server flow to the hosted flow: it opens
(or prints) the authorization URL, then prompts for the full callback URL
(or bare `code`) to paste from the hosted page once Tumblr redirects there.
If Tumblr shows a redirect URI error, ask the user for the registered
redirect URI and rerun with `--redirect-uri` matching it exactly.

Existing required app credentials in `~/.env`:

* `TUMBLR_CONSUMER_KEY`
* `TUMBLR_CONSUMER_SECRET`

Values created or refreshed by this helper:

* `TUMBLR_ACCESS_TOKEN`
* `TUMBLR_REFRESH_TOKEN`
* `TUMBLR_ACCESS_TOKEN_EXPIRES_AT`
* `TUMBLR_BLOG_IDENTIFIER`

Default scopes:

```text
basic write offline_access
```

## Workflow

1. Confirm the user wants to write to `~/.env`. Writing outside the repository
   requires explicit approval in sandboxed Codex sessions.
2. Run the helper with the hosted redirect URI (see
   [`auth-site/README.md`](auth-site/README.md) for the current deployed
   URL):

   ```bash
   node skills/posthaste-tumblr-refresh-token/scripts/create-tumblr-refresh-token.ts \
     --write-env \
     --redirect-uri "https://boisterous-wisp-bf8cd6.netlify.app/callback"
   ```

3. If the browser cannot open, rerun with `--no-open` and ask the user to open
   the printed authorization URL manually. The URL must not contain secrets.
4. After Tumblr redirects to the hosted callback page, the script prompts for
   the full callback URL (or bare `code`); paste it from the browser or from
   the "Copy" button on the hosted page. Report only the safe summary printed
   by the script afterward: dotenv path, updated key names, blog identifier,
   and expiry time.
5. Verify the posting skill sees Tumblr as configured:

   ```bash
   node skills/posthaste-prepare-link/resources/post-crosspost.ts --info
   ```

Do not include any token in the final answer. If setup succeeds, say that
`TUMBLR_ACCESS_TOKEN`, `TUMBLR_REFRESH_TOKEN`, and `TUMBLR_BLOG_IDENTIFIER`
are stored and Tumblr is configured.

## Refreshing an existing token

If `TUMBLR_REFRESH_TOKEN` already exists, refresh without opening a browser:

```bash
node skills/posthaste-tumblr-refresh-token/scripts/create-tumblr-refresh-token.ts \
  --write-env \
  --refresh-existing
```

If the refresh fails because the refresh token is invalid, rerun the normal
browser OAuth flow.

## Options

Use these when defaults do not match the Tumblr app:

```bash
--consumer-key "<key>"
--consumer-secret "<secret>"
--redirect-uri "https://boisterous-wisp-bf8cd6.netlify.app/callback"  # hosted flow (default for this app)
--host "localhost"                        # loopback flow only, if Tumblr ever allows it again
--port 8080                               # loopback flow only
--callback-path "/callback"               # loopback flow only
--scope "basic write offline_access"
--blog-identifier "<blog-name-or-uuid>"
--dotenv "~/.env"
--refresh-existing
--fix-permissions
--no-open
```

A non-loopback `--redirect-uri` (any host other than `127.0.0.1`,
`localhost`, or `::1`) always switches to the hosted paste flow; loopback
options (`--host`, `--port`, `--callback-path`) only apply when falling back
to the local-server flow.

Use `--fix-permissions` only when the user agrees to chmod the dotenv file to
`0600`.
