#!/usr/bin/env node

import { spawn } from "node:child_process";
import { platform } from "node:os";
import { resolve } from "node:path";
import twitterTextPkg from "twitter-text";
import {
  expandHomePath,
  printJson,
  readOptionalFile,
} from "./direct-api-utils.ts";

const { parseTweet, extractUrlsWithIndices } = twitterTextPkg;

const DEFAULT_MAX_CHARS = 280;
const INTENT_BASE_URL = "https://x.com/intent/post";

interface TwitterIntentConfig {
  message?: string;
  messageFile?: string;
  maxChars: number;
  open: boolean;
}

function printHelp(): void {
  console.log(`
Build (and optionally open) an X/Twitter web-intent link so a post can be
published manually in the browser. This never calls the X API and never
publishes anything by itself; it only prepares a link a human clicks and
confirms themselves.

Validation uses X's own weighted-length algorithm (the official twitter-text
library), not a raw character count. That algorithm auto-detects any
domain-like substring as a link and counts it as 23 characters regardless of
its real length, even a bare product name that happens to read like a domain
(e.g. "Foo.design"). A naive character count misses this and can pass text
that X itself would reject.

Usage:
  node post-twitter-intent.ts --message-file ./message.twitter.md
  node post-twitter-intent.ts --message "Hello world https://example.com" --open

Options:
  --message <text>        Post text to prefill. Include the URL in the text
                           itself so X can render its Open Graph image as a
                           card preview; there is no way to attach a local
                           image file through this link.
  --message-file <path>   File containing the post text.
  --max-chars <n>         Weighted-length limit to validate against. Default: ${DEFAULT_MAX_CHARS}.
  --open                  Try to open the link in the default browser.
  --help                  Show this help text.

Output:
  JSON on stdout: { network, intentUrl, characters, weightedLength, maxChars, detectedUrls, opened }
`);
}

function requireArg(argv: string[], index: number, flag: string): string {
  const value = argv[index];

  if (!value) {
    throw new Error(`${flag} needs a value.`);
  }

  return value;
}

function parseArgs(argv: string[]): TwitterIntentConfig {
  const config: TwitterIntentConfig = {
    maxChars: DEFAULT_MAX_CHARS,
    open: false,
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

      case "--max-chars": {
        const value = Number(nextValue(arg));

        if (!Number.isFinite(value) || value <= 0) {
          throw new Error("--max-chars must be a positive number.");
        }

        config.maxChars = value;
        break;
      }

      case "--open":
        config.open = true;
        break;

      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (config.message && config.messageFile) {
    throw new Error("Use either --message or --message-file, not both.");
  }

  if (!config.message && !config.messageFile) {
    throw new Error("Missing message. Use --message or --message-file.");
  }

  return config;
}

async function readMessageText(config: TwitterIntentConfig): Promise<string> {
  if (config.message) {
    return config.message.trim();
  }

  const filePath = resolve(expandHomePath(config.messageFile as string));
  const content = await readOptionalFile(filePath);

  if (content === undefined) {
    throw new Error(`Message file is not readable: ${filePath}`);
  }

  return content.trim();
}

function buildIntentUrl(message: string): string {
  const params = new URLSearchParams({ text: message });
  return `${INTENT_BASE_URL}?${params.toString()}`;
}

function openCommandForPlatform(): { command: string; args: string[] } {
  switch (platform()) {
    case "darwin":
      return { command: "open", args: [] };
    case "win32":
      return { command: "cmd", args: ["/c", "start", ""] };
    default:
      return { command: "xdg-open", args: [] };
  }
}

async function tryOpen(url: string): Promise<boolean> {
  const openCommand = openCommandForPlatform();

  return new Promise((resolvePromise) => {
    const child = spawn(openCommand.command, [...openCommand.args, url], {
      stdio: "ignore",
      detached: true,
    });

    child.on("error", () => resolvePromise(false));
    child.on("spawn", () => {
      child.unref();
      resolvePromise(true);
    });
  });
}

async function main(): Promise<void> {
  const config = parseArgs(process.argv.slice(2));
  const message = await readMessageText(config);
  const parsed = parseTweet(message);
  const detectedUrls = extractUrlsWithIndices(message).map(
    (entity) => entity.url,
  );

  if (parsed.weightedLength > config.maxChars) {
    throw new Error(
      [
        `Message is ${parsed.weightedLength} weighted characters, over the ${config.maxChars} limit X actually enforces.`,
        detectedUrls.length > 0
          ? `X auto-detects these substrings as links and counts each as 23 characters regardless of its real length, which can inflate or shrink the total unexpectedly: ${detectedUrls.join(", ")}.`
          : undefined,
        "Shorten or reword the text (a <slug>.twitter.md variant) and rerun rather than trusting a raw character count.",
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  const intentUrl = buildIntentUrl(message);
  const opened = config.open ? await tryOpen(intentUrl) : false;

  printJson({
    network: "twitter",
    intentUrl,
    characters: [...message].length,
    weightedLength: parsed.weightedLength,
    maxChars: config.maxChars,
    detectedUrls,
    opened,
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});
