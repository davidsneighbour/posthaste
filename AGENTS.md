# Repository Guidelines

AGENTS.md is the single source of truth for repository instructions. Tool- or
assistant-specific files may add narrow overrides, but shared workflow,
structure, security, and editing rules belong here.

## Project Structure & Module Organization

Posthaste! is a collection of standalone AI skills for drafting, adapting,
reviewing, and publishing social media content. There is no app, build output,
or central test suite; the repository product is the Markdown and scripts under
`skills/`. Each `skills/<skill-name>/` directory is independently loadable and
uses `SKILL.md` as its entrypoint. Supporting files belong inside the owning
skill directory, commonly in `resources/`, `scripts/`, or `auth-site/`. Shared
README assets live in `.github/assets/`.

## Skill Map

- `posthaste`: placeholder root skill; `SKILL.md` is currently empty.
- `posthaste-prepare-link`: main link-to-social workflow. It fetches metadata,
  screenshots pages, drafts Patrick-voice posts with topical hashtags, posts
  only after explicit confirmation, and logs posted networks to avoid repeats.
- `posthaste-post-retrieve-hashtags`: prompt-only topical hashtag generation
  from a URL or text block.
- `posthaste-unsplash`: searches, previews, selects, and tracks Unsplash photos
  with mandatory attribution, download tracking on final selection, and
  credentials from `UNSPLASH_ACCESS_KEY`.
- `posthaste-voice`: prose editing skill. For substantial edits, use
  `skills/posthaste-voice/tropes-and-rules.md` as the diagnostic checklist.
- `posthaste-reddit-refresh-token`, `posthaste-threads-refresh-token`, and
  `posthaste-tumblr-refresh-token`: OAuth setup helpers that must never expose
  token values.

## Build, Test, and Development Commands

Run helper scripts directly from the repository root:

```bash
node skills/posthaste-prepare-link/resources/fetch-link-metadata.ts --help
node skills/posthaste-reddit-refresh-token/scripts/create-reddit-refresh-token.ts --help
bash skills/posthaste-unsplash/scripts/search.sh "topic"
```

TypeScript resource scripts are run with `node <path>.ts`; do not assume
compiled JavaScript, `tsx`, a root `package.json`, or a build step exists. Some
ported `SKILL.md` examples still contain the stale prefix
`skills/70-content-design-and-voice/<skill-name>/...`. When running or citing
those examples, substitute the real path: `skills/<skill-name>/...`. Fix stale
references when already touching the affected file.

## Coding Style & Naming Conventions

Use plain Markdown for skill documentation. Keep `SKILL.md` frontmatter
specific and actionable, especially `id`, `name`, `title`, and `description`.
Skill directories use lowercase hyphenated names such as
`posthaste-prepare-link`; resource scripts use action-oriented names such as
`post-reddit.ts` or `create-tumblr-refresh-token.ts`. Prefer ASCII punctuation
unless quoting existing text.

## Testing Guidelines

No coverage threshold is defined. Validate changed scripts with targeted
`--help`, dry-run, or non-writing modes before handoff. For publishing, OAuth,
and browser-assisted flows, never perform real posting, credential writes, login
automation, or final publish clicks without explicit user confirmation. When a
skill's behaviour changes, update its `SKILL.md` in the same change.

## Commit & Pull Request Guidelines

The current history uses Conventional Commit-style subjects, for example
`chore: initial commit, reposetup`. Always work on `main`. Do not create
branches unless the user explicitly asks for a feature branch.

Every commit must refer to a GitHub issue. If no fitting issue exists, or the
work did not start from an issue, create one before committing. Apply fitting
GitHub labels for type, priority, status, and affected area, using existing
repository labels. Close issues only through `closes #123` in commit messages;
do not close issues manually.

When reporting, reviewing, or documenting repository work, link references to
commits, pull requests, and issues whenever they are mentioned. If the referenced
object is not available locally yet but will have a stable GitHub URL after the
repository state is pushed, use that URL form anyway.

Use conventional changelog subjects for all commits:
`type(optional-scope): imperative summary`. For skill changes, use
`feat(<skill-name>): ...` for new or changed capabilities and
`fix(<skill-name>): ...` for corrections. Write verbose commit bodies that
explain what changed, why it changed, validation performed, and the issue
reference. Commit when the change is complete. If open questions remain or the
change is not done, do not commit; explain what remains and offer to commit once
resolved. Push when stopping work if one or more commits were added.

Pull requests should explain the affected skill, list validation performed, and
link the related issue or task. Include screenshots only for asset or README
visual changes.

## Credentials and Secrets

Publishing and auth skills read credentials from `~/.env` by default, or from
an explicit dotenv path such as `CROSSPOST_DOTENV` or `--dotenv`. Do not read
from or write to a project-local `.env` for these skills. Refresh-token scripts
must require explicit write flags before persisting values and must refuse
unsafe dotenv permissions unless the user requests a permissions fix.

Never print, paste, summarize, or commit real token, secret, authorization code,
or credential values. The Unsplash skill must not use bundled, demo, testing,
or fallback credentials; use a caller-provided `UNSPLASH_ACCESS_KEY`.

## Agent Workflow

Before starting repository work, agents must check for project-root
`RESUME.md`. If it exists, read it first, resolve or explicitly abandon the
unfinished work, and remove `RESUME.md` before starting unrelated work.

Keep edits scoped to the requested skill or document. Preserve existing user
changes in this dirty worktree unless the user explicitly asks to include,
replace, or remove them.
