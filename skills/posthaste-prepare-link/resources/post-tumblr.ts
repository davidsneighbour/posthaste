#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import {
  asRecord,
  type CommonDirectConfig,
  expandHomePath,
  fetchJson,
  firstString,
  printJson,
  readDotenv,
  readMessage,
  requireEnvValue,
} from "./direct-api-utils.ts";

const DEFAULT_DOTENV_PATH = "~/.env";

const IMAGE_MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

interface TumblrConfig extends CommonDirectConfig {
  imagePath?: string;
  imageAlt?: string;
}

function printHelp(): void {
  console.log(`
Post to Tumblr using the Tumblr OAuth2 API (Neue Post Format).

Usage:
  node post-tumblr.ts --message-file ./message.md
  node post-tumblr.ts --message-file ./message.md --image ./shot.png --image-alt "..."

Options:
  --message <text>       Message text to publish.
  --message-file <path>  File containing message text.
  --image <path>         Optional local image file to attach (png, jpg, gif, webp).
                          Uploaded via NPF multipart, not a hosted URL.
  --image-alt <text>     Required when --image is used. Alt text for the image.
  --dotenv <path>        Dotenv path. Default: ${DEFAULT_DOTENV_PATH}.
  --dry-run              Print JSON describing the post without publishing.
  --help                 Show this help text.
`);
}

function requireArg(argv: string[], index: number, flag: string): string {
  const value = argv[index];

  if (!value) {
    throw new Error(`${flag} needs a value.`);
  }

  return value;
}

function parseArgs(argv: string[]): TumblrConfig {
  const config: TumblrConfig = {
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

      case "--image":
        config.imagePath = nextValue(arg);
        break;

      case "--image-alt":
        config.imageAlt = nextValue(arg);
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

function assertTumblrTokenNotExpired(
  dotenvValues: Record<string, string>,
): void {
  const expiresAt = dotenvValues.TUMBLR_ACCESS_TOKEN_EXPIRES_AT;

  if (!expiresAt) {
    return;
  }

  const timestamp = Date.parse(expiresAt);

  if (!Number.isFinite(timestamp)) {
    return;
  }

  if (timestamp <= Date.now()) {
    throw new Error(
      "TUMBLR_ACCESS_TOKEN_EXPIRES_AT is in the past. Refresh Tumblr credentials with posthaste-tumblr-refresh-token before posting.",
    );
  }
}

function imageMimeType(imagePath: string): string {
  const mimeType = IMAGE_MIME_TYPES[extname(imagePath).toLowerCase()];

  if (!mimeType) {
    throw new Error(
      `Unsupported image extension for ${imagePath}. Supported: ${Object.keys(IMAGE_MIME_TYPES).join(", ")}.`,
    );
  }

  return mimeType;
}

function buildContentBlocks(
  message: string,
  config: TumblrConfig,
): Record<string, unknown>[] {
  const content: Record<string, unknown>[] = [];

  if (config.imagePath) {
    content.push({
      type: "image",
      media: [{ type: imageMimeType(config.imagePath), identifier: "image-0" }],
      alt_text: config.imageAlt,
    });
  }

  content.push({ text: message, type: "text" });

  return content;
}

async function buildMultipartRequest(
  postBody: { content: Record<string, unknown>[]; state: string },
  imagePath: string,
  accessToken: string,
): Promise<RequestInit> {
  const resolvedPath = resolve(expandHomePath(imagePath));
  const imageBuffer = await readFile(resolvedPath);
  const form = new FormData();

  // A Blob part always gets an implicit filename="blob", which Tumblr's
  // multipart parser rejects. The "json" field must be a plain string part
  // with no filename, matching the NPF multipart spec exactly.
  form.append("json", JSON.stringify(postBody));
  form.append(
    "image-0",
    new Blob([imageBuffer], { type: imageMimeType(imagePath) }),
    basename(resolvedPath),
  );

  return {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: form,
  };
}

async function postTumblr(): Promise<void> {
  const config = parseArgs(process.argv.slice(2));
  const message = await readMessage(config);
  const dotenvValues = await readDotenv(config.dotenvPath);

  if (config.imagePath && !config.imageAlt) {
    throw new Error("--image-alt is required when --image is used.");
  }

  if (config.dryRun) {
    printJson({
      network: "tumblr",
      dryRun: true,
      characters: [...message].length,
      image: config.imagePath,
    });
    return;
  }

  const accessToken = requireEnvValue("TUMBLR_ACCESS_TOKEN", dotenvValues);
  const blogIdentifier = requireEnvValue(
    "TUMBLR_BLOG_IDENTIFIER",
    dotenvValues,
  );
  assertTumblrTokenNotExpired(dotenvValues);
  const content = buildContentBlocks(message, config);
  const postBody = { content, state: "published" };
  const requestInit: RequestInit = config.imagePath
    ? await buildMultipartRequest(postBody, config.imagePath, accessToken)
    : {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(postBody),
      };
  const json = asRecord(
    await fetchJson(
      `https://api.tumblr.com/v2/blog/${encodeURIComponent(blogIdentifier)}/posts`,
      requestInit,
      "Tumblr post creation",
      dotenvValues,
    ),
  );
  const response = asRecord(json.response);
  const url = firstString(response.post_url, response.url);
  const id = firstString(response.id, json.id);

  printJson({
    network: "tumblr",
    url:
      url ??
      (id ? `https://www.tumblr.com/${blogIdentifier}/${id}` : "unknown"),
    id,
  });
}

postTumblr().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});
