---
id: posthaste
name: posthaste
title: Posthaste!
description: Route the Posthaste! social publishing skill set. Use when the user wants to draft, adapt, review, publish, or configure social media workflows with Posthaste!, especially when choosing between link preparation, hashtag generation, configuration management, and social network credential helper skills.
---

Use this router skill to choose the right Posthaste! workflow.

Before handing an operational request to another Posthaste! skill, use
`posthaste-config` discovery and merge rules to resolve available global and
project configuration. Pass only relevant resolved values to the consuming
skill. Explicit values in the current user request always take precedence over
configuration. Do not turn this implicit lookup into a questionnaire merely
because no config file exists; consuming-skill defaults remain valid.

* Use `posthaste-config` when the user wants to inspect, validate, initialise,
  or edit Posthaste! configuration, or when another Posthaste! skill needs
  persistent user or project defaults resolved.
* Use `posthaste-prepare-link` when the user supplies a URL and wants a social
  post drafted, adapted for network limits, checked against the posted log, or
  published after explicit confirmation.
* Use `posthaste-post-retrieve-hashtags` when the user only wants topical
  hashtags for a URL or supplied text.
* Use `posthaste-reddit-refresh-token`,
  `posthaste-threads-refresh-token`, or `posthaste-tumblr-refresh-token` when a
  direct network integration needs credentials refreshed or created.

Never publish, write credentials, automate login, or click final publish
controls without explicit confirmation from the user.
