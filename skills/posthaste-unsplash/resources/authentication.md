# Unsplash authentication

Use this procedure before every Unsplash API operation.

## Required variable

The skill uses:

```text
UNSPLASH_ACCESS_KEY
```

Never use bundled, example, demo, testing, or fallback credentials.

Never print or log the key.

Whenever referring to an existing key in output, represent it only as:

```text
***
```

## Credential resolution

Resolve credentials in this order:

1. Check whether `UNSPLASH_ACCESS_KEY` is already available to the current process.
2. If unavailable, check whether the project root contains `.env`.
3. If `.env` exists, load it into the process environment.
4. Confirm only that `UNSPLASH_ACCESS_KEY` exists and is non-empty.
5. Ensure child Bash scripts inherit the resulting environment.
6. Continue only when a usable key is available.

Do not expose the credential while checking for it.

## Safe Bash loading

When a project `.env` must be loaded before invoking an existing script:

```bash
set -a
source .env
set +a

./scripts/search.sh "architecture"
```

This allows variables defined by `.env` to be inherited by the script.

Do not print the environment after loading it.

## Forbidden diagnostics

Do not use commands whose visible output could expose secrets, including:

```bash
env
printenv
cat .env
grep UNSPLASH_ACCESS_KEY .env
echo "$UNSPLASH_ACCESS_KEY"
```

A secret-presence check must reveal only whether the variable is configured, never its value.

## Missing credential

If no usable key can be found, stop before calling Unsplash.

Return:

```text
No Unsplash API key is configured.

I need UNSPLASH_ACCESS_KEY available in the environment or project .env before I can use Unsplash.

You can either:
1. configure an existing Unsplash API key, or
2. create an Unsplash developer application and obtain an API key at https://unsplash.com/developers
```

Let the user choose whether to configure an existing key or create an Unsplash application.

Do not create an account, application, or credential automatically.

Do not substitute another photo provider unless explicitly requested.

## Getting an Unsplash API key

If the user needs a new key, direct them to:

```text
https://unsplash.com/developers
```

Setup flow:

1. Sign in to Unsplash.
2. Open the developer page.
3. Create a new application.
4. Accept the API terms presented by Unsplash.
5. Open the application's Keys section.
6. Copy the application's **Access Key**.
7. Store it as `UNSPLASH_ACCESS_KEY` in the appropriate environment or project `.env`.

Example `.env` entry:

```dotenv
UNSPLASH_ACCESS_KEY=your_access_key_here
```

Do not ask the user to paste the key into chat unless they explicitly choose to do so.

Prefer that they configure it directly in their environment or `.env`.

If demonstrating a configured key, always mask it:

```text
UNSPLASH_ACCESS_KEY=***
```

## Invalid credential

If Unsplash rejects the configured credential:

```text
The configured Unsplash API key was rejected.

UNSPLASH_ACCESS_KEY is currently set to ***, but Unsplash did not accept it.
```

Do not reveal the actual value.

## Child-process requirement

Before reporting an authentication failure from `search.sh`, `random.sh`, or `track.sh`, verify that the script actually inherited `UNSPLASH_ACCESS_KEY`.

A key present only inside an unexported shell variable is insufficient.

## Secret handling

Treat both Unsplash Access Keys and Secret Keys as confidential.

This skill only needs the Access Key for its current public API operations.

Never:

- commit credentials;
- write them into `SKILL.md`;
- put real credentials in example configuration;
- return them in JSON;
- include them in URLs shown to the user;
- include them in logs or error messages;
- expose authorisation headers.
