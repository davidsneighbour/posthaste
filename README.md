# Posthaste

![You won't ever believe what I have to tell you!](.github/assets/posthaste.jpg)

## AI-assisted social publishing, posthaste

Posthaste is a collection of reusable AI skills for drafting, adapting, reviewing, and publishing social media content. Let's keep social publishing workflows focused, portable, and easy to use across projects and AI assistants.

## Install

Install the current posthaste skillset with:

```bash
npx skills add davidsneighbour/posthaste --yes
```

Install one skill by id:

```bash
npx skills add davidsneighbour/posthaste --skill posthaste-prepare-link --yes
```

## Update

Re-run the install command to refresh an existing install:

```bash
npx skills add davidsneighbour/posthaste --yes
```

Use `--global` when the skills should be available outside the current project.

## Skills

* `posthaste` routes the social publishing skillset.
* `posthaste-prepare-link` drafts and publishes confirmed social posts from URLs.
* `posthaste-post-retrieve-hashtags` generates topical hashtags from a URL or supplied text.
* `posthaste-reddit-refresh-token` creates Reddit OAuth credentials for direct Reddit posting.
* `posthaste-threads-refresh-token` creates or refreshes Threads API credentials.
* `posthaste-tumblr-refresh-token` creates or refreshes Tumblr OAuth2 credentials.
