#!/usr/bin/env node

import {
  asRecord,
  type CommonDirectConfig,
  fetchJson,
  firstString,
  getEnvValue,
  printJson,
  readDotenv,
  readMessage,
  requireEnvValue,
} from "./direct-api-utils.ts";

const DEFAULT_DOTENV_PATH = "~/.env";

interface ThreadsConfig extends CommonDirectConfig {
  linkAttachment?: string;
}

function printHelp(): void {
  console.log(`
Post to Threads using the official media-container and publish API.

Usage:
  node post-threads.ts --message-file ./message.md
  node post-threads.ts --message-file ./message.md --link-attachment "https://example.com/"

Options:
  --message <text>            Message text to publish.
  --message-file <path>       File containing message text.
  --link-attachment <url>     URL to attach as a link preview card. Threads
                               does not reliably auto-detect URLs inside
                               --message text via the API, so pass the post's
                               source/canonical URL explicitly to get a
                               preview card.
  --dotenv <path>             Dotenv path. Default: ${DEFAULT_DOTENV_PATH}.
  --dry-run                   Print JSON describing the post without publishing.
  --help                      Show this help text.
`);
}

function requireArg(argv: string[], index: number, flag: string): string {
  const value = argv[index];

  if (!value) {
    throw new Error(`${flag} needs a value.`);
  }

  return value;
}

function parseArgs(argv: string[]): ThreadsConfig {
  const config: ThreadsConfig = {
    dotenvPath: DEFAULT_DOTENV_PATH,
    dryRun: false,
  };
  let index = 0;
  const nextValue = (flag: string): string => {
    index += 1;
    return requireArg(argv, index, flag);
  };

  for (; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;

      case "--message":
        config.message = nextValue(arg);
        break;

      case "--message-file":
        config.messageFile = nextValue(arg);
        break;

      case "--link-attachment":
        config.linkAttachment = nextValue(arg);
        break;

      case "--dotenv":
        config.dotenvPath = nextValue(arg);
        break;

      case "--dry-run":
        config.dryRun = true;
        break;

      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return config;
}

function assertThreadsTokenNotExpired(
  dotenvValues: Record<string, string>,
): void {
  const expiresAt = getEnvValue(
    "THREADS_ACCESS_TOKEN_EXPIRES_AT",
    dotenvValues,
  );

  if (!expiresAt) {
    return;
  }

  const timestamp = Date.parse(expiresAt);

  if (!Number.isFinite(timestamp)) {
    return;
  }

  if (timestamp <= Date.now()) {
    throw new Error(
      "THREADS_ACCESS_TOKEN_EXPIRES_AT is in the past. Refresh Threads credentials with posthaste-threads-refresh-token before posting.",
    );
  }
}

async function postThreads(): Promise<void> {
  const config = parseArgs(process.argv.slice(2));
  const message = await readMessage(config);
  const dotenvValues = await readDotenv(config.dotenvPath);

  if (config.dryRun) {
    printJson({
      network: "threads",
      dryRun: true,
      characters: [...message].length,
      linkAttachment: config.linkAttachment,
    });
    return;
  }

  const userId = requireEnvValue("THREADS_USER_ID", dotenvValues);
  const accessToken = requireEnvValue("THREADS_ACCESS_TOKEN", dotenvValues);
  assertThreadsTokenNotExpired(dotenvValues);
  const createBody = new URLSearchParams({
    access_token: accessToken,
    media_type: "TEXT",
    text: message,
  });

  if (config.linkAttachment) {
    createBody.set("link_attachment", config.linkAttachment);
  }
  const created = asRecord(
    await fetchJson(
      `https://graph.threads.net/v1.0/${encodeURIComponent(userId)}/threads`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: createBody,
      },
      "Threads media container creation",
      dotenvValues,
    ),
  );
  const creationId = firstString(created.id);

  if (!creationId) {
    throw new Error("Threads media container creation did not return id.");
  }

  const publishBody = new URLSearchParams({
    access_token: accessToken,
    creation_id: creationId,
  });
  const published = asRecord(
    await fetchJson(
      `https://graph.threads.net/v1.0/${encodeURIComponent(userId)}/threads_publish`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: publishBody,
      },
      "Threads publish",
      dotenvValues,
    ),
  );
  const username = getEnvValue("THREADS_USERNAME", dotenvValues);
  const postId = firstString(published.id);
  const url =
    username && postId
      ? `https://www.threads.net/@${username}/post/${postId}`
      : postId
        ? `threads:${postId}`
        : "unknown";

  printJson({
    network: "threads",
    url,
    id: postId,
  });
}

postThreads().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});
