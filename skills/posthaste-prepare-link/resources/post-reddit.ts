#!/usr/bin/env node

import type { ResolvedPosthasteConfig } from "../../posthaste-config/resources/config.ts";
import {
  asRecord,
  type CommonDirectConfig,
  fetchJson,
  firstString,
  getConfiguredEnvValue,
  loadDirectRuntimeConfig,
  printJson,
  readMessage,
  redactSecrets,
  requireConfiguredEnvValue,
} from "./direct-api-utils.ts";

type RedditPostType = "link" | "self";

interface RedditConfig extends CommonDirectConfig {
  title?: string;
  sourceUrl?: string;
  canonicalUrl?: string;
  redditPostType?: RedditPostType;
  redditLinkUrl?: string;
  redditNoComment: boolean;
}

const DEFAULT_DOTENV_PATH = "~/.env";
const REDDIT_DEFAULTS = {
  enabled: true,
  env: {
    access_token: "REDDIT_ACCESS_TOKEN",
    client_id: "REDDIT_CLIENT_ID",
    client_secret: "REDDIT_CLIENT_SECRET",
    flair_id: "REDDIT_FLAIR_ID",
    refresh_token: "REDDIT_REFRESH_TOKEN",
    subreddit: "REDDIT_SUBREDDIT",
    user_agent: "REDDIT_USER_AGENT",
  },
};

function printHelp(): void {
  console.log(`
Post to Reddit using the direct Reddit OAuth API.

Usage:
  node post-reddit.ts --message-file ./message.md --source-url https://example.com

Options:
  --message <text>                   Message text to publish or comment.
  --message-file <path>              File containing message text.
  --title <text>                     Reddit title. Default: first non-empty message line.
  --reddit-post-type <link|self>     Default: link when a URL is available, otherwise self.
  --reddit-link-url <url>            Link-post target URL. Default: canonical/source URL.
  --reddit-no-comment                For link posts, skip commenting with the message text.
  --source-url <url>                 Original link this post is about.
  --canonical-url <url>              Canonical link this post is about.
  --dotenv <path>                    Dotenv path. Default: ${DEFAULT_DOTENV_PATH}.
  --dry-run                          Print JSON describing the post without publishing.
  --help                             Show this help text.
`);
}

function requireArg(argv: string[], index: number, flag: string): string {
  const value = argv[index];

  if (!value) {
    throw new Error(`${flag} needs a value.`);
  }

  return value;
}

function parseRedditPostType(value: string): RedditPostType {
  const normalised = value.trim().toLowerCase();

  if (normalised === "link" || normalised === "self") {
    return normalised;
  }

  throw new Error("--reddit-post-type must be either link or self.");
}

function parseArgs(argv: string[]): RedditConfig {
  const config: RedditConfig = {
    dotenvPath: DEFAULT_DOTENV_PATH,
    explicitDotenvPath: false,
    dryRun: false,
    redditNoComment: false,
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

      case "--title":
        config.title = nextValue(arg);
        break;

      case "--reddit-post-type":
        config.redditPostType = parseRedditPostType(nextValue(arg));
        break;

      case "--reddit-link-url":
        config.redditLinkUrl = nextValue(arg);
        break;

      case "--reddit-no-comment":
        config.redditNoComment = true;
        break;

      case "--source-url":
        config.sourceUrl = nextValue(arg);
        break;

      case "--canonical-url":
        config.canonicalUrl = nextValue(arg);
        break;

      case "--dotenv":
        config.dotenvPath = nextValue(arg);
        config.explicitDotenvPath = true;
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

function deriveTitle(
  message: string,
  explicitTitle: string | undefined,
): string {
  const title =
    explicitTitle?.trim() ??
    message
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean) ??
    "Shared link";

  return [...title].slice(0, 300).join("");
}

function determinePostType(config: RedditConfig): RedditPostType {
  if (config.redditPostType) {
    return config.redditPostType;
  }

  return config.redditLinkUrl || config.canonicalUrl || config.sourceUrl
    ? "link"
    : "self";
}

function redditLinkUrl(config: RedditConfig): string {
  const url = config.redditLinkUrl ?? config.canonicalUrl ?? config.sourceUrl;

  if (!url) {
    throw new Error(
      "Reddit link posts need a URL. Pass --source-url, --canonical-url, --reddit-link-url, or use --reddit-post-type self.",
    );
  }

  return url;
}

function redditPostFullName(data: Record<string, unknown>): string | undefined {
  const name = firstString(data.name);

  if (name) {
    return name;
  }

  const id = firstString(data.id);

  if (id) {
    return id.startsWith("t3_") ? id : `t3_${id}`;
  }

  const permalink = firstString(data.permalink);
  const postId = permalink?.match(/\/comments\/([^/]+)/u)?.[1];

  return postId ? `t3_${postId}` : undefined;
}

async function getAccessToken(
  config: ResolvedPosthasteConfig,
  dotenvValues: Record<string, string>,
): Promise<string> {
  const accessToken = getConfiguredEnvValue(
    config,
    "reddit",
    "access_token",
    "REDDIT_ACCESS_TOKEN",
    dotenvValues,
  );

  if (accessToken) {
    return accessToken;
  }

  const clientId = requireConfiguredEnvValue(
    config,
    "reddit",
    "client_id",
    "REDDIT_CLIENT_ID",
    dotenvValues,
  );
  const clientSecret = requireConfiguredEnvValue(
    config,
    "reddit",
    "client_secret",
    "REDDIT_CLIENT_SECRET",
    dotenvValues,
  );
  const refreshToken = requireConfiguredEnvValue(
    config,
    "reddit",
    "refresh_token",
    "REDDIT_REFRESH_TOKEN",
    dotenvValues,
  );
  const userAgent = requireConfiguredEnvValue(
    config,
    "reddit",
    "user_agent",
    "REDDIT_USER_AGENT",
    dotenvValues,
  );
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const json = asRecord(
    await fetchJson(
      "https://www.reddit.com/api/v1/access_token",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": userAgent,
        },
        body,
      },
      "Reddit access-token refresh",
      dotenvValues,
    ),
  );
  const refreshedToken = firstString(json.access_token);

  if (!refreshedToken) {
    throw new Error("Reddit access-token refresh did not return access_token.");
  }

  return refreshedToken;
}

function assertNoRedditErrors(
  label: string,
  json: Record<string, unknown>,
  dotenvValues: Record<string, string>,
): void {
  const responseJson = asRecord(json.json);
  const errors = responseJson.errors;

  if (Array.isArray(errors) && errors.length > 0) {
    throw new Error(
      `${label} returned errors: ${redactSecrets(JSON.stringify(errors), dotenvValues)}`,
    );
  }
}

async function commentOnPost(
  token: string,
  userAgent: string,
  thingId: string,
  message: string,
  dotenvValues: Record<string, string>,
): Promise<string> {
  const body = new URLSearchParams({
    api_type: "json",
    text: message,
    thing_id: thingId,
  });
  const json = asRecord(
    await fetchJson(
      "https://oauth.reddit.com/api/comment",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": userAgent,
        },
        body,
      },
      "Reddit comment",
      dotenvValues,
    ),
  );

  assertNoRedditErrors("Reddit comment", json, dotenvValues);

  const responseJson = asRecord(json.json);
  const data = asRecord(responseJson.data);
  const things = Array.isArray(data.things) ? data.things : [];
  const comment = asRecord(asRecord(things[0]).data);
  const permalink = firstString(comment.permalink);

  return permalink?.startsWith("/")
    ? `https://www.reddit.com${permalink}`
    : (permalink ?? "unknown");
}

async function postReddit(): Promise<void> {
  const cliConfig = parseArgs(process.argv.slice(2));
  const message = await readMessage(cliConfig);
  const runtime = await loadDirectRuntimeConfig(
    cliConfig,
    "reddit",
    REDDIT_DEFAULTS,
  );
  const redditPostType = determinePostType(cliConfig);
  const title = deriveTitle(message, cliConfig.title);

  if (cliConfig.dryRun) {
    printJson({
      network: "reddit",
      dryRun: true,
      postType: redditPostType,
      title,
      linkUrl: redditPostType === "link" ? redditLinkUrl(cliConfig) : undefined,
      willComment:
        redditPostType === "link" &&
        !cliConfig.redditNoComment &&
        Boolean(message),
      characters: [...message].length,
    });
    return;
  }

  const token = await getAccessToken(runtime.config, runtime.dotenvValues);
  const subreddit = requireConfiguredEnvValue(
    runtime.config,
    "reddit",
    "subreddit",
    "REDDIT_SUBREDDIT",
    runtime.dotenvValues,
  );
  const userAgent = requireConfiguredEnvValue(
    runtime.config,
    "reddit",
    "user_agent",
    "REDDIT_USER_AGENT",
    runtime.dotenvValues,
  );
  const body = new URLSearchParams({
    api_type: "json",
    kind: redditPostType,
    resubmit: "true",
    sendreplies: "true",
    sr: subreddit,
    title,
  });
  const flairId = getConfiguredEnvValue(
    runtime.config,
    "reddit",
    "flair_id",
    "REDDIT_FLAIR_ID",
    runtime.dotenvValues,
  );

  if (redditPostType === "link") {
    body.set("url", redditLinkUrl(cliConfig));
  } else {
    body.set("text", message);
  }

  if (flairId) {
    body.set("flair_id", flairId);
  }

  const json = asRecord(
    await fetchJson(
      "https://oauth.reddit.com/api/submit",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": userAgent,
        },
        body,
      },
      "Reddit submit",
      runtime.dotenvValues,
    ),
  );

  assertNoRedditErrors("Reddit submit", json, runtime.dotenvValues);

  const data = asRecord(asRecord(json.json).data);
  const url = firstString(data.permalink, data.url);
  const postUrl = url?.startsWith("/") ? `https://www.reddit.com${url}` : url;
  let commentUrl: string | undefined;

  if (
    redditPostType === "link" &&
    !cliConfig.redditNoComment &&
    message.trim()
  ) {
    const thingId = redditPostFullName(data);

    if (!thingId) {
      throw new Error(
        `Reddit link post succeeded at ${postUrl ?? "unknown"}, but the API response did not include a post id for commenting.`,
      );
    }

    commentUrl = await commentOnPost(
      token,
      userAgent,
      thingId,
      message,
      runtime.dotenvValues,
    );
  }

  printJson({
    network: "reddit",
    url: postUrl ?? "unknown",
    postUrl: postUrl ?? "unknown",
    commentUrl,
  });
}

postReddit().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});
