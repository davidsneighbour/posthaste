---
id: posthaste-config
name: posthaste-config
title: Posthaste Config
description: Load, merge, validate, explain, or create Posthaste TOML configuration. Use when another Posthaste skill needs user or project defaults, when the user asks what Posthaste configuration is active, or when the user wants to initialise or change global or project Posthaste settings.
---

Manage persistent, non-secret configuration shared by Posthaste skills.

Posthaste configuration is layered on top of defaults owned by each consuming
skill. This skill owns config discovery, precedence, safety rules, validation,
and interactive setup. It does not redefine another skill's built-in defaults.

## Configuration files

Support these locations:

```text
~/.config/posthaste/config.toml   global user configuration
.posthaste.toml                   project configuration
```

Resolve the project configuration from the current project or repository root,
not from the installed Posthaste skill directory.

If a caller explicitly provides a config file, treat that as an additional
explicit config layer above project configuration. Do not silently invent other
config locations.

## Precedence

Resolve values from lowest to highest precedence:

```text
consuming skill defaults
< global ~/.config/posthaste/config.toml
< project .posthaste.toml
< explicitly supplied config file
< explicit command, argument, or user request
```

Merge TOML tables recursively. Later scalar and array values replace earlier
values; do not concatenate arrays unless the consuming skill explicitly defines
that behaviour for a particular key.

A missing config file is valid and contributes no values. A malformed config
file is an error: report its path and the parse problem instead of silently
ignoring it.

## Configuration ownership

Each consuming skill owns:

* its built-in defaults
* the config keys it understands
* validation rules specific to those keys
* environment variable names used when no override is configured

`posthaste-config` owns:

* config discovery and precedence
* generic TOML parsing and merge semantics
* safe creation and editing of config files
* generic structural and secret-safety validation
* reporting where effective values came from

Do not copy network character limits, API endpoints, supported transports,
credential values, or other implementation metadata into configuration merely
because a skill already knows them.

## Shared configuration schema

Configuration is intentionally extensible. These shared keys are reserved for
cross-skill behaviour:

```toml
version = 1

[posting]
default_networks = ["mastodon", "bluesky", "linkedin"]

[paths]
dotenv = "~/.env"
posted_log = "~/.local/share/posthaste-prepare-link/posted.jsonl"

[networks.reddit]
enabled = true
auth_site = "reddit"

[networks.reddit.env]
access_token = "REDDIT_ACCESS_TOKEN"
client_id = "REDDIT_CLIENT_ID"
client_secret = "REDDIT_CLIENT_SECRET"
refresh_token = "REDDIT_REFRESH_TOKEN"
user_agent = "REDDIT_USER_AGENT"
subreddit = "REDDIT_SUBREDDIT"
```

The `[networks.<network>.env]` table maps semantic credential/configuration names
to environment variable names. Its values are environment variable names, not
credentials. Consuming skills may define additional network keys.

For skill-specific settings that do not naturally belong to a shared section,
use:

```toml
[skills.posthaste-prepare-link]
example_setting = "value"
```

Do not require every skill to use `[skills.*]` when a shared section is clearer.

## Secret safety

TOML configuration MUST NOT contain credential values.

Never write or recommend writing:

* passwords
* access or refresh tokens
* OAuth authorization codes
* client secrets
* private keys
* API secrets or keys that grant private access
* session cookies

Environment variable names are safe configuration. For example:

```toml
[networks.mastodon.env]
access_token = "MASTODON_ACCESS_TOKEN"
```

is valid, while this is not:

```toml
[networks.mastodon]
access_token = "actual-token-value"
```

When validating `[*.env]` tables, require values to look like environment
variable names: uppercase ASCII letters, digits, and underscores, beginning
with a letter or underscore. Flag suspicious credential-like values elsewhere
in the TOML and ask the user to move them to the configured dotenv/secret
store. Do not repeat a suspected secret value in the response.

## Commands

Interpret these command forms when this skill is invoked directly:

```text
/posthaste-config info
/posthaste-config check
/posthaste-config init
/posthaste-config init global
/posthaste-config init project
/posthaste-config edit
/posthaste-config edit global
/posthaste-config edit project
```

Natural-language equivalents are valid.

### `info`

Load all available layers and report:

* global config path and whether it exists
* project config path and whether it exists
* any explicitly supplied config path
* configuration version
* effective shared configuration
* provenance for each effective value when practical
* warnings from generic validation

Never print credential values from environment variables or dotenv files.
Environment variable names may be printed.

When another skill calls `posthaste-config`, return the merged configuration
plus provenance in a form the caller can use. Do not turn an internal config
lookup into a questionnaire unless required configuration is missing.

### `check`

Load the same layers as `info`, then validate them without modifying files.
Check at least:

1. TOML parses successfully.
2. `version`, when present, is the supported integer version `1`.
3. `[posting].default_networks`, when present, is an array of non-empty strings.
4. `[paths]` values, when present, are non-empty strings.
5. `[networks.<name>]`, when present, is a table.
6. `[networks.<name>.env]` values are plausible environment variable names.
7. no obvious secret values appear to be stored directly in config.
8. consuming-skill validation is applied for keys owned by the caller.

Distinguish errors from warnings. Unknown keys are warnings by default, not
errors, because the schema is intentionally extensible.

### `init`

Create configuration through a questionnaire-style conversation.

If the scope was not supplied, ask first:

```text
Where should this configuration apply?
- global: ~/.config/posthaste/config.toml
- project: <project-root>/.posthaste.toml
```

Then inspect whether the target file already exists. Never overwrite an existing
file without explicit confirmation; use `edit` semantics instead.

Ask only questions that produce persistent configuration. Prefer short,
concrete questions and accept free-form answers as well as listed choices.
Question order should normally be:

1. Which networks should `post` target by default when none are named?
2. Should the default dotenv path differ from `~/.env`?
3. Should the posted-log path differ from the consuming skill's default?
4. For configured networks, are any default environment variable names
   overridden?
5. Are there network- or skill-specific non-secret settings to add?

Skip questions whose answer is already known from the existing config or the
user's invocation. Do not ask the user to enter credential values.

Before writing, show the complete TOML that will be written and its destination,
then require explicit confirmation. Create parent directories when necessary
only after confirmation.

Write only values that differ from built-in defaults or that the user explicitly
wants persisted. This keeps global and project files small and makes future
changes to built-in defaults observable.

After writing, run the equivalent of `check` and report the resulting effective
configuration.

### `edit`

Load the selected config file and ask what the user wants to change. Preserve
unrelated keys and comments where the available editing mechanism permits it.
Apply the same secret-safety rules and require confirmation before writing.
Run `check` after the change.

## Questionnaire behaviour

Use the host agent's native interactive-question capability when available. If
no structured question UI exists, ask the same questions conversationally.
The skill must work in both environments.

Do not store questionnaire answers in agent memory as a substitute for writing
the requested config. Agent memory may help draft prose or recall preferences,
but operational Posthaste defaults come from explicit configuration.

## Use from other Posthaste skills

A consuming skill should use this sequence:

1. Define its own typed defaults internally.
2. Invoke or follow `posthaste-config` discovery and merge rules.
3. Select only the config keys that skill understands.
4. Validate those keys using its own rules.
5. Apply explicit command/request values last.
6. Read credential values only from the resulting environment-variable names.

Conceptually:

```text
effective = merge(
  skillDefaults,
  globalConfig,
  projectConfig,
  explicitConfig,
  explicitRequest,
)
```

When reporting configuration, distinguish the environment variable name from
whether that variable is currently set. Never expose its value.

## Failure handling

If config cannot be read or parsed, report the exact file path and actionable
error. Do not fall back past a malformed higher-precedence file as though it did
not exist.

If a configured project root cannot be determined, use the current working
directory as the project root and say so. Do not search arbitrary parent or home
directories for additional `.posthaste.toml` files.

If a write is requested outside the current workspace or repository, obtain any
confirmation required by the host environment before writing.
