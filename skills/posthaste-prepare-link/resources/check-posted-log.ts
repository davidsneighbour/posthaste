#!/usr/bin/env node

import { constants as fsConstants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

interface CliConfig {
  url?: string;
  targetNetworks: Network[];
  logPath: string;
}

type Network =
  | "mastodon"
  | "bluesky"
  | "linkedin"
  | "nostr"
  | "reddit"
  | "threads"
  | "tumblr";

interface NetworkPostRecord {
  url: string;
  postedAt: string;
}

interface PostedRecord {
  url: string;
  canonicalUrl?: string;
  mastodonUrl?: string;
  postedAt?: string;
  message?: string;
  networks?: Partial<Record<Network, NetworkPostRecord>>;
  messages?: Partial<Record<Network, string>>;
}

const DEFAULT_LOG_PATH = "~/.local/share/posthaste-prepare-link/posted.jsonl";
const SUPPORTED_NETWORKS = [
  "mastodon",
  "bluesky",
  "linkedin",
  "nostr",
  "reddit",
  "threads",
  "tumblr",
] as const;

function printHelp(): void {
  console.log(`
Check whether a URL has already been posted, using the shared post log.

Usage:
  node check-posted-log.ts --url https://example.com/post

Options:
  --url <url>         URL to check. Required.
  --to <networks>     Optional comma-separated networks to report against.
  --log-path <path>   Log file path. Default: ${DEFAULT_LOG_PATH}.
  --help               Show this help text.

Output:
  JSON on stdout: { alreadyPosted: boolean, postedNetworks: string[], ... }
`);
}

function expandHomePath(input: string): string {
  if (input === "~") {
    return homedir();
  }

  if (input.startsWith("~/")) {
    return join(homedir(), input.slice(2));
  }

  return input;
}

function normaliseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "").toLowerCase();
}

function isNetwork(value: string): value is Network {
  return (SUPPORTED_NETWORKS as readonly string[]).includes(value);
}

function parseNetworks(value: string): Network[] {
  const networks = value
    .split(",")
    .map((network) => network.trim().toLowerCase())
    .filter(Boolean);

  if (networks.length === 0) {
    throw new Error("--to must name at least one network.");
  }

  const result: Network[] = [];

  for (const network of networks) {
    if (!isNetwork(network)) {
      throw new Error(
        `Unknown network: ${network}. Supported networks here: ${SUPPORTED_NETWORKS.join(", ")}.`,
      );
    }

    if (!result.includes(network)) {
      result.push(network);
    }
  }

  return result;
}

function parseArgs(argv: string[]): CliConfig {
  const config: CliConfig = { logPath: DEFAULT_LOG_PATH, targetNetworks: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;

      case "--url":
        config.url = argv[++index];
        break;

      case "--to":
        config.targetNetworks = parseNetworks(argv[++index] ?? "");
        break;

      case "--log-path":
        config.logPath = argv[++index] ?? DEFAULT_LOG_PATH;
        break;

      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!config.url) {
    throw new Error("Missing required --url.");
  }

  return config;
}

async function readLog(logPath: string): Promise<PostedRecord[]> {
  try {
    await access(logPath, fsConstants.R_OK);
  } catch {
    return [];
  }

  const content = await readFile(logPath, "utf8");
  const records: PostedRecord[] = [];

  for (const line of content.split("\n")) {
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      continue;
    }

    try {
      records.push(JSON.parse(trimmed) as PostedRecord);
    } catch {
      // Skip a malformed line rather than fail the whole check.
    }
  }

  return records;
}

function hasPostedNetwork(record: PostedRecord, network: Network): boolean {
  if (record.networks?.[network]) {
    return true;
  }

  return network === "mastodon" && Boolean(record.mastodonUrl);
}

async function main(): Promise<void> {
  const config = parseArgs(process.argv.slice(2));
  const logPath = resolve(expandHomePath(config.logPath));
  const records = await readLog(logPath);
  const target = normaliseUrl(config.url as string);

  const matches = records.filter(
    (record) =>
      normaliseUrl(record.url) === target ||
      (record.canonicalUrl !== undefined &&
        normaliseUrl(record.canonicalUrl) === target),
  );
  const networksToCheck =
    config.targetNetworks.length > 0
      ? config.targetNetworks
      : [...SUPPORTED_NETWORKS];
  const postedNetworks = networksToCheck.filter((network) =>
    matches.some((record) => hasPostedNetwork(record, network)),
  );
  const missingNetworks = networksToCheck.filter(
    (network) => !postedNetworks.includes(network),
  );

  if (matches.length > 0) {
    console.log(
      JSON.stringify(
        {
          alreadyPosted: postedNetworks.length > 0,
          postedNetworks,
          missingNetworks,
          records: matches,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(
    JSON.stringify(
      {
        alreadyPosted: false,
        postedNetworks,
        missingNetworks,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});
