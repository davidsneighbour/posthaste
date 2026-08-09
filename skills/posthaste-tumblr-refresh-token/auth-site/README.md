# Auth-site (tumblr)

Static OAuth callback microsite for `posthaste-tumblr-refresh-token`, deployed as
its own Netlify site. Tumblr rejects `localhost`/`127.0.0.1` redirect URIs,
so this hosted page is the redirect target instead.

## Design

* `callback.html` runs entirely client-side: it reads `code`/`state`/`error`
  from the URL, shows them for copying, and makes no network requests of its
  own (`connect-src 'none'` in the CSP). Nothing is logged or stored
  server-side — Netlify just serves the static file.
* `netlify.toml` rewrites `/` to `/callback` (status 200) so the site's root
  URL doubles as the callback path, and sets security headers
  (`noindex`, `no-referrer`, a locked-down CSP).
* No secrets ever reach this site. Only the short-lived OAuth `code` and the
  `state` value pass through the URL; the actual token exchange happens
  locally via `create-tumblr-refresh-token.ts`.

## Currently deployed at

```text
https://boisterous-wisp-bf8cd6.netlify.app
```

Netlify account: `quickies` (`dnb@davids-neighbour.com`). The `.netlify/`
link state in this folder is gitignored, so re-cloning or switching machines
requires either `netlify link --id 578d56b9-1764-4f94-b93f-6c04dd3cbb8c` (to
reuse this exact site) or a fresh `netlify sites:create` (which mints a new
URL — update this file and the Tumblr app's callback URL if you do that).

The Tumblr app's OAuth callback URL is set to the `/callback` path on that
domain:

```text
https://boisterous-wisp-bf8cd6.netlify.app/callback
```

## Deploying

This folder is a standalone Netlify site (own `.netlify/state.json` link, not
shared with any other skill). All commands run from inside this directory.

First time only, to create a brand-new site (mints a new random URL — only do
this if the site above no longer exists):

```bash
cd skills/posthaste-tumblr-refresh-token/auth-site
netlify login                            # if not already logged in
netlify sites:create --account-slug quickies
```

To redeploy this page after editing `callback.html` or `netlify.toml` (this
is the normal update path — it reuses the existing linked site above and its
URL):

```bash
cd skills/posthaste-tumblr-refresh-token/auth-site
netlify deploy --prod --dir . --no-build
```

To confirm which Netlify account/site this folder is currently linked to:

```bash
cd skills/posthaste-tumblr-refresh-token/auth-site
netlify status
```

`create-tumblr-refresh-token.ts` supports this hosted flow the same way as
`create-threads-refresh-token.ts`: a non-loopback `https://` `--redirect-uri`
skips the local server and prompts for a pasted callback URL/code instead.
