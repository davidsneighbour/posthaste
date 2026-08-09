---
id: posthaste-threads-refresh-token
name: posthaste-threads-refresh-token
title: Posthaste! Threads Refresh Token
description: Create or refresh a long-lived Threads API access token for the posthaste-prepare-link direct Threads poster using a local loopback callback server. Use when Threads posting is missing THREADS_ACCESS_TOKEN or THREADS_USER_ID, when the long-lived Threads token has expired or is close to expiring, or when the user asks to generate Threads credentials for posthaste-prepare-link.
---

Generate or refresh a long-lived Threads API access token for the
`posthaste-prepare-link` Threads publisher without exposing tokens in chat or
terminal output.

## Bare invocation

If the user invokes `posthaste-threads-refresh-token` without more context, explain
that the skill can be used directly or as a sub-skill from
`posthaste-prepare-link`, but the bundled script is not conversational. Tell
the user that a direct run opens Threads in the browser, waits for the local
callback, writes the token values to `~/.env` only when `--write-env` is used,
and never prints tokens or authorization codes.

Show this command shape:

```bash
node skills/posthaste-threads-refresh-token/scripts/create-threads-refresh-token.ts \
  --write-env
```

Then ask whether the user wants to run the setup now.

## Safety model

Never print, paste, summarise, or otherwise reveal `THREADS_ACCESS_TOKEN`,
`THREADS_APP_SECRET`, short-lived access tokens, long-lived access tokens, or
authorization codes.

Use the bundled script:

```bash
node skills/posthaste-threads-refresh-token/scripts/create-threads-refresh-token.ts
```

The script enforces the core safety checks:

* redirect URI must be `http://` or `https://`; a hosted (non-loopback) URI
  must be `https://` and switches to the interactive paste flow instead of a
  local server
* per-run random OAuth `state` with callback verification, in both flows
* no token printing
* explicit `--write-env` before requesting or refreshing a token
* HTTPS loopback by default with a temporary self-signed certificate, because
  Threads blocks insecure login pages
* private dotenv permissions; refuses to write if the file is group/other
  readable unless `--fix-permissions` is passed
* one local callback request, then server shutdown

## Required threads app setup

The user needs a Meta app with Threads API enabled. Meta rejects
`localhost`/`127.0.0.1` redirect URIs for this app type
(`URL Blocked: This redirect failed because the redirect URI is not
whitelisted`), so the app's OAuth redirect URI must be the hosted callback
microsite in `auth-site/`, not a loopback URI. See
[`auth-site/README.md`](auth-site/README.md) for deployment and the current
live URL. Register the `/callback` path on that domain as the app's redirect
URI, e.g.:

```text
https://cute-starlight-2d4b0e.netlify.app/callback
```

Threads requires the redirect URI in the authorization request to match the
app registration exactly, including host, path, and trailing slash. Pass the
same URI to the helper with `--redirect-uri`; a non-loopback `--redirect-uri`
switches the helper from the local-server flow to the hosted flow: it opens
(or prints) the authorization URL, then prompts for the full callback URL
(or bare `code`) to paste from the hosted page once Threads redirects there.
If Threads shows a redirect URI error, ask the user for the registered
redirect URI and rerun with `--redirect-uri` matching it exactly.

Existing required app credentials in `~/.env`:

* `THREADS_APP_ID`
* `THREADS_APP_SECRET`
* `THREADS_CLIENT_TOKEN`

Values created or refreshed by this helper:

* `THREADS_ACCESS_TOKEN`
* `THREADS_USER_ID`
* `THREADS_ACCESS_TOKEN_EXPIRES_AT`
* `THREADS_USERNAME` when the API returns it

Default permissions:

```text
threads_basic,threads_content_publish
```

## Workflow

1. Confirm the user wants to write to `~/.env`. Writing outside the repository
   requires explicit approval in sandboxed Codex sessions.
2. Run the helper with the hosted redirect URI (see
   [`auth-site/README.md`](auth-site/README.md) for the current deployed
   URL):

   ```bash
   node skills/posthaste-threads-refresh-token/scripts/create-threads-refresh-token.ts \
     --write-env \
     --redirect-uri "https://cute-starlight-2d4b0e.netlify.app/callback"
   ```

3. If the browser cannot open, rerun with `--no-open` and ask the user to open
   the printed authorization URL manually. The URL must not contain secrets.
4. After Threads redirects to the hosted callback page, the script prompts
   for the full callback URL (or bare `code`); paste it from the browser or
   from the "Copy" button on the hosted page. Report only the safe summary
   printed by the script afterward: dotenv path, updated key names, user id,
   and expiry time.
5. Verify the posting skill sees Threads as configured:

   ```bash
   node skills/posthaste-prepare-link/resources/post-crosspost.ts --info
   ```

Do not include any token in the final answer. If setup succeeds, say that
`THREADS_ACCESS_TOKEN` and `THREADS_USER_ID` are stored and Threads is
configured.

## Refreshing an existing long-lived token

If `THREADS_ACCESS_TOKEN` already exists and has not fully expired, refresh it
without opening a browser:

```bash
node skills/posthaste-threads-refresh-token/scripts/create-threads-refresh-token.ts \
  --write-env \
  --refresh-existing
```

If the refresh fails because the token is expired or invalid, rerun the normal
browser OAuth flow.

## Options

Use these when defaults do not match the Threads app:

```bash
--app-id "<id>"
--app-secret "<secret>"
--redirect-uri "https://cute-starlight-2d4b0e.netlify.app/callback"  # hosted flow (default for this app)
--host "localhost"                        # loopback flow only, if Meta ever allows it again
--port 8080                               # loopback flow only
--callback-path "/callback"               # loopback flow only
--https-key "./localhost-key.pem"         # loopback flow only
--https-cert "./localhost-cert.pem"       # loopback flow only
--scope "threads_basic,threads_content_publish"
--dotenv "~/.env"
--refresh-existing
--fix-permissions
--no-open
```

A non-loopback `--redirect-uri` (any host other than `127.0.0.1`,
`localhost`, or `::1`) always switches to the hosted paste flow; loopback
options (`--host`, `--port`, `--callback-path`, `--https-key`,
`--https-cert`) only apply when falling back to the local-server flow.

Use `--fix-permissions` only when the user agrees to chmod the dotenv file to
`0600`.
