#!/usr/bin/env node

import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import {
  access,
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadPosthasteConfig,
  type PosthasteConfigDefaults,
  provenanceFor,
  type ResolvedPosthasteConfig,
} from "../../posthaste-config/resources/config.ts";

type Network =
  | "mastodon"
  | "bluesky"
  | "linkedin"
  | "nostr"
  | "reddit"
  | "threads"
  | "tumblr";
type NetworkTransport = "crosspost" | "direct";
type RedditPostType = "link" | "self";

interface NetworkConfig {
  transport: NetworkTransport;
  flag?: string;
  directScript?: string;
  requiredEnv: string[];
  alternativeRequiredEnv?: string[][];
  maxChars: number;
  supportsImages: boolean;
  description: string;
}

interface CliConfig {
  message?: string;
  messageFile?: string;
  networkMessageFiles: Partial<Record<Network, string>>;
  title?: string;
  redditPostType?: RedditPostType;
  redditLinkUrl?: string;
  redditNoComment: boolean;
  image?: string;
  imageAlt?: string;
  dotenvPath: string;
  explicitDotenvPath: boolean;
  sourceUrl?: string;
  canonicalUrl?: string;
  logPath: string;
  explicitLogPath: boolean;
  noLog: boolean;
  dryRun: boolean;
  force: boolean;
  info: boolean;
  targetNetworks: Network[];
}

interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

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

interface PreparedMessage {
  network: Network;
  message: string;
  filePath: string;
  cleanup?: () => Promise<void>;
}

const SUPPORTED_NETWORKS: Record<Network, NetworkConfig> = {
  mastodon: {
    transport: "crosspost",
    flag: "--mastodon",
    requiredEnv: ["access_token", "host"],
    maxChars: 1000,
    supportsImages: true,
    description: "Crosspost Mastodon status with optional image attachment.",
  },
  bluesky: {
    transport: "crosspost",
    flag: "--bluesky",
    requiredEnv: ["host", "identifier", "password"],
    maxChars: 300,
    supportsImages: true,
    description: "Crosspost Bluesky post with optional image attachment.",
  },
  linkedin: {
    transport: "crosspost",
    flag: "--linkedin",
    requiredEnv: ["access_token"],
    maxChars: 3000,
    supportsImages: true,
    description: "Crosspost LinkedIn share with optional image attachment.",
  },
  nostr: {
    transport: "crosspost",
    flag: "--nostr",
    requiredEnv: ["private_key", "relays"],
    maxChars: 280,
    supportsImages: false,
    description: "Crosspost Nostr text note.",
  },
  reddit: {
    transport: "direct",
    directScript: "post-reddit.ts",
    requiredEnv: ["access_token", "user_agent", "subreddit"],
    alternativeRequiredEnv: [
      [
        "client_id",
        "client_secret",
        "refresh_token",
        "user_agent",
        "subreddit",
      ],
    ],
    maxChars: 40_000,
    supportsImages: false,
    description:
      "Direct Reddit link or self post via OAuth. Link posts add the message as a top-level comment.",
  },
  threads: {
    transport: "direct",
    directScript: "post-threads.ts",
    requiredEnv: ["access_token", "user_id"],
    maxChars: 500,
    supportsImages: false,
    description:
      "Direct Threads text post via the official two-step media container/publish API.",
  },
  tumblr: {
    transport: "direct",
    directScript: "post-tumblr.ts",
    requiredEnv: ["access_token", "blog_identifier"],
    maxChars: 4096,
    supportsImages: true,
    description:
      "Direct Tumblr Neue Post Format post via OAuth2 bearer token, with optional local image attachment.",
  },
};
const DEFAULT_DOTENV_PATH = "~/.env";
const DEFAULT_LOG_PATH = "~/.local/share/posthaste-prepare-link/posted.jsonl";
const LOGGED_MESSAGE_PREVIEW_LENGTH = 200;
const RESOURCE_DIR = dirname(fileURLToPath(import.meta.url));
const CROSSPOST_NETWORKS = (
  Object.keys(SUPPORTED_NETWORKS) as Network[]
).filter((network) => SUPPORTED_NETWORKS[network].transport === "crosspost");
const DIRECT_NETWORKS = (Object.keys(SUPPORTED_NETWORKS) as Network[]).filter(
  (network) => SUPPORTED_NETWORKS[network].transport === "direct",
);
const DEFAULT_NETWORK_ENV: Record<Network, Record<string, string>> = {
  mastodon: {
    access_token: "MASTODON_ACCESS_TOKEN",
    host: "MASTODON_HOST",
  },
  bluesky: {
    host: "BLUESKY_HOST",
    identifier: "BLUESKY_IDENTIFIER",
    password: "BLUESKY_PASSWORD",
  },
  linkedin: {
    access_token: "LINKEDIN_ACCESS_TOKEN",
  },
  nostr: {
    private_key: "NOSTR_PRIVATE_KEY",
    relays: "NOSTR_RELAYS",
  },
  reddit: {
    access_token: "REDDIT_ACCESS_TOKEN",
    client_id: "REDDIT_CLIENT_ID",
    client_secret: "REDDIT_CLIENT_SECRET",
    flair_id: "REDDIT_FLAIR_ID",
    refresh_token: "REDDIT_REFRESH_TOKEN",
    subreddit: "REDDIT_SUBREDDIT",
    user_agent: "REDDIT_USER_AGENT",
  },
  threads: {
    access_token: "THREADS_ACCESS_TOKEN",
    access_token_expires_at: "THREADS_ACCESS_TOKEN_EXPIRES_AT",
    user_id: "THREADS_USER_ID",
    username: "THREADS_USERNAME",
  },
  tumblr: {
    access_token: "TUMBLR_ACCESS_TOKEN",
    access_token_expires_at: "TUMBLR_ACCESS_TOKEN_EXPIRES_AT",
    blog_identifier: "TUMBLR_BLOG_IDENTIFIER",
  },
};
const PREPARE_LINK_DEFAULTS: PosthasteConfigDefaults = {
  paths: {
    dotenv: DEFAULT_DOTENV_PATH,
    postedLog: DEFAULT_LOG_PATH,
  },
  networks: Object.fromEntries(
    (Object.keys(SUPPORTED_NETWORKS) as Network[]).map((network) => [
      network,
      {
        enabled: true,
        env: DEFAULT_NETWORK_ENV[network],
      },
    ]),
  ),
};

function printHelp(): void {
  console.log(`
Post a confirmed message using @humanwhocodes/crosspost or direct network APIs,
and record each network in the shared "Posthaste! posted" log.

Usage:
  node post-crosspost.ts --message-file ./message.txt --image ./shot.png --image-alt "..." --source-url https://example.com/post
  node post-crosspost.ts --message-file ./message.txt --message-file-bluesky ./message.bluesky.txt --message-file-nostr ./message.nostr.txt --to mastodon,bluesky,nostr
  node post-crosspost.ts --info

Options:
  --info                             Print configuration info and exit.
  --message <text>                   Message text to publish.
  --message-file <path>              File containing the default message text.
  --message-file-mastodon <path>     Mastodon-specific message text.
  --message-file-bluesky <path>      Bluesky-specific message text.
  --message-file-linkedin <path>     LinkedIn-specific message text.
  --message-file-nostr <path>        Nostr-specific message text.
  --message-file-reddit <path>       Reddit-specific message text.
  --message-file-threads <path>      Threads-specific message text.
  --message-file-tumblr <path>       Tumblr-specific message text.
  --title <text>                     Optional post title for networks that require one, currently Reddit.
  --reddit-post-type <link|self>     Reddit post type. Default: link when a URL is available, otherwise self.
  --reddit-link-url <url>            Reddit link-post URL. Default: canonical/source URL.
  --reddit-no-comment                For Reddit link posts, skip commenting with the message text.
  --to <networks>                    Comma-separated networks. Default: all configured supported networks.
  --image <path>                     Optional image path.
  --image-alt <text>                 Required when --image is used.
  --dotenv <path>                    Dotenv path for posting credentials. Default: ${DEFAULT_DOTENV_PATH}.
  --source-url <url>                 Original link this post is about. Enables log tracking.
  --canonical-url <url>              Canonical form of the source URL, if different.
  --log-path <path>                  Posted-log file path. Default: ${DEFAULT_LOG_PATH}.
  --force                            Repost even if the target network is already logged.
  --no-log                           Publish without recording to the posted log.
  --dry-run                          Validate and print the commands without publishing.
  --help                             Show this help text.

Supported Crosspost networks in this helper:
  ${CROSSPOST_NETWORKS.join(", ")}

Supported direct API networks in this helper:
  ${DIRECT_NETWORKS.join(", ")}

Required environment by network:
  Mastodon: MASTODON_ACCESS_TOKEN, MASTODON_HOST
  Bluesky: BLUESKY_HOST, BLUESKY_IDENTIFIER, BLUESKY_PASSWORD
  LinkedIn: LINKEDIN_ACCESS_TOKEN
  Nostr: NOSTR_PRIVATE_KEY, NOSTR_RELAYS
  Reddit: REDDIT_ACCESS_TOKEN, REDDIT_USER_AGENT, REDDIT_SUBREDDIT
    or REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_REFRESH_TOKEN, REDDIT_USER_AGENT, REDDIT_SUBREDDIT
  Threads: THREADS_ACCESS_TOKEN, THREADS_USER_ID
  Tumblr: TUMBLR_ACCESS_TOKEN, TUMBLR_BLOG_IDENTIFIER

Notes:
  - CROSSPOST_DOTENV is set to ~/.env unless already present.
  - Reddit defaults to link posts for URL shares. Use --reddit-post-type self
    to create a self/text post instead. Link posts add the message as a comment
    unless --reddit-no-comment is used.
  - Nostr and Threads posts are text-only in this helper.
  - Threads image posts require publicly hosted image URLs and are not wired here.
  - Threads does not reliably auto-detect a URL inside the message text via
    the API, so --canonical-url (falling back to --source-url) is passed
    through as the Threads link_attachment, producing a link preview card.
  - Tumblr supports --image as a local file upload via NPF multipart, added
    to the post as its own image content block ahead of the text block.
  - When --source-url is given, each successful network publish appends one JSON
    line to the log so future runs can post only to missing networks.
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

async function resolveRuntimeConfig(
  config: CliConfig,
): Promise<ResolvedPosthasteConfig> {
  return loadPosthasteConfig({
    defaults: PREPARE_LINK_DEFAULTS,
    environment: process.env.CROSSPOST_DOTENV
      ? {
          paths: {
            dotenv:
              process.env.CROSSPOST_DOTENV === "1"
                ? ".env"
                : process.env.CROSSPOST_DOTENV,
          },
        }
      : undefined,
    cli: {
      ...(config.explicitDotenvPath
        ? { paths: { dotenv: config.dotenvPath } }
        : {}),
      ...(config.explicitLogPath
        ? { paths: { postedLog: config.logPath } }
        : {}),
      ...(config.targetNetworks.length > 0
        ? { posting: { defaultNetworks: config.targetNetworks } }
        : {}),
    },
    knownNetworks: Object.keys(SUPPORTED_NETWORKS),
  });
}

function configuredEnvName(
  config: ResolvedPosthasteConfig,
  network: Network,
  semanticKey: string,
): string {
  return (
    config.networks[network]?.env[semanticKey] ??
    DEFAULT_NETWORK_ENV[network][semanticKey] ??
    semanticKey
  );
}

function normaliseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "").toLowerCase();
}

function isNetwork(value: string): value is Network {
  return Object.hasOwn(SUPPORTED_NETWORKS, value);
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
        `Unknown network: ${network}. Supported networks here: ${Object.keys(SUPPORTED_NETWORKS).join(", ")}.`,
      );
    }

    if (!result.includes(network)) {
      result.push(network);
    }
  }

  return result;
}

function parseRedditPostType(value: string): RedditPostType {
  const normalised = value.trim().toLowerCase();

  if (normalised === "link" || normalised === "self") {
    return normalised;
  }

  throw new Error("--reddit-post-type must be either link or self.");
}

function requireArg(argv: string[], index: number, flag: string): string {
  const value = argv[index];

  if (!value) {
    throw new Error(`${flag} needs a value.`);
  }

  return value;
}

function parseArgs(argv: string[]): CliConfig {
  const config: CliConfig = {
    networkMessageFiles: {},
    targetNetworks: [],
    dotenvPath: DEFAULT_DOTENV_PATH,
    explicitDotenvPath: false,
    logPath: DEFAULT_LOG_PATH,
    explicitLogPath: false,
    redditNoComment: false,
    noLog: false,
    dryRun: false,
    force: false,
    info: false,
  };
  let index = 0;
  const nextValue = (flag: string): string => {
    index += 1;
    return requireArg(argv, index, flag);
  };

  for (; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";

    switch (arg) {
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;

      case "--info":
        config.info = true;
        break;

      case "--message":
        config.message = nextValue(arg);
        break;

      case "--message-file":
        config.messageFile = nextValue(arg);
        break;

      case "--message-file-mastodon":
        config.networkMessageFiles.mastodon = nextValue(arg);
        break;

      case "--message-file-bluesky":
        config.networkMessageFiles.bluesky = nextValue(arg);
        break;

      case "--message-file-linkedin":
        config.networkMessageFiles.linkedin = nextValue(arg);
        break;

      case "--message-file-nostr":
        config.networkMessageFiles.nostr = nextValue(arg);
        break;

      case "--message-file-reddit":
        config.networkMessageFiles.reddit = nextValue(arg);
        break;

      case "--message-file-threads":
        config.networkMessageFiles.threads = nextValue(arg);
        break;

      case "--message-file-tumblr":
        config.networkMessageFiles.tumblr = nextValue(arg);
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

      case "--to":
        config.targetNetworks = parseNetworks(nextValue(arg));
        break;

      case "--image":
        config.image = nextValue(arg);
        break;

      case "--image-alt":
        config.imageAlt = nextValue(arg);
        break;

      case "--dotenv":
        config.dotenvPath = nextValue(arg);
        config.explicitDotenvPath = true;
        break;

      case "--source-url":
        config.sourceUrl = nextValue(arg);
        break;

      case "--canonical-url":
        config.canonicalUrl = nextValue(arg);
        break;

      case "--log-path":
        config.logPath = nextValue(arg);
        config.explicitLogPath = true;
        break;

      case "--force":
        config.force = true;
        break;

      case "--no-log":
        config.noLog = true;
        break;

      case "--dry-run":
        config.dryRun = true;
        break;

      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (config.info) {
    return config;
  }

  if (config.message && config.messageFile) {
    throw new Error("Use either --message or --message-file, not both.");
  }

  if (!config.message && !config.messageFile) {
    throw new Error("Missing message. Use --message or --message-file.");
  }

  return config;
}

async function assertReadableFile(
  filePath: string,
  label: string,
): Promise<void> {
  try {
    await access(filePath, fsConstants.R_OK);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} is not readable: ${filePath}\n${message}`);
  }
}

async function readOptionalFile(filePath: string): Promise<string | undefined> {
  try {
    await access(filePath, fsConstants.R_OK);
  } catch {
    return undefined;
  }

  return readFile(filePath, "utf8");
}

async function readDotenv(dotenvPath: string): Promise<Record<string, string>> {
  const resolved = resolve(expandHomePath(dotenvPath));
  const content = await readOptionalFile(resolved);

  if (!content) {
    return {};
  }

  const values: Record<string, string> = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const withoutExport = trimmed.startsWith("export ")
      ? trimmed.slice("export ".length).trim()
      : trimmed;
    const separatorIndex = withoutExport.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = withoutExport.slice(0, separatorIndex).trim();
    let value = withoutExport.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key) {
      values[key] = value;
    }
  }

  return values;
}

function envHasValue(
  name: string,
  dotenvValues: Record<string, string>,
): boolean {
  return Boolean(process.env[name] || dotenvValues[name]);
}

function envRequirementGroups(
  config: ResolvedPosthasteConfig,
  network: Network,
): string[][] {
  const networkConfig = SUPPORTED_NETWORKS[network];

  return [
    networkConfig.requiredEnv,
    ...(networkConfig.alternativeRequiredEnv ?? []),
  ].map((group) =>
    group.map((semanticKey) => configuredEnvName(config, network, semanticKey)),
  );
}

function missingEnvForGroup(
  group: string[],
  dotenvValues: Record<string, string>,
): string[] {
  return group.filter((name) => !envHasValue(name, dotenvValues));
}

function bestMissingEnv(
  config: ResolvedPosthasteConfig,
  network: Network,
  dotenvValues: Record<string, string>,
): string[] {
  const missingGroups = envRequirementGroups(config, network).map((group) =>
    missingEnvForGroup(group, dotenvValues),
  );

  return missingGroups.sort((a, b) => a.length - b.length)[0] ?? [];
}

function isNetworkConfigured(
  config: ResolvedPosthasteConfig,
  network: Network,
  dotenvValues: Record<string, string>,
): boolean {
  return envRequirementGroups(config, network).some(
    (group) => missingEnvForGroup(group, dotenvValues).length === 0,
  );
}

function getConfiguredNetworks(
  config: ResolvedPosthasteConfig,
  dotenvValues: Record<string, string>,
): Network[] {
  return (Object.keys(SUPPORTED_NETWORKS) as Network[]).filter(
    (network) =>
      config.networks[network]?.enabled !== false &&
      isNetworkConfigured(config, network, dotenvValues),
  );
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function printInfo(
  cliConfig: CliConfig,
  config: ResolvedPosthasteConfig,
  dotenvValues: Record<string, string>,
): Promise<void> {
  const logPath = resolve(expandHomePath(config.paths.postedLog));
  const dotenvPath = resolve(expandHomePath(config.paths.dotenv));
  const configuredNetworks = getConfiguredNetworks(config, dotenvValues);
  const networkInfo = Object.fromEntries(
    (Object.keys(SUPPORTED_NETWORKS) as Network[]).map((network) => {
      const networkConfig = SUPPORTED_NETWORKS[network];
      const missingEnv = bestMissingEnv(config, network, dotenvValues);
      const env = config.networks[network]?.env ?? {};

      return [
        network,
        {
          enabled: config.networks[network]?.enabled !== false,
          enabledProvenance: provenanceFor(
            config,
            `networks.${network}.enabled`,
          ),
          configured: missingEnv.length === 0,
          transport: networkConfig.transport,
          flag: networkConfig.flag,
          directScript: networkConfig.directScript,
          maxChars: networkConfig.maxChars,
          supportsImages: networkConfig.supportsImages,
          description: networkConfig.description,
          env,
          envProvenance: Object.fromEntries(
            Object.keys(env).map((key) => [
              key,
              provenanceFor(config, `networks.${network}.env.${key}`),
            ]),
          ),
          requiredEnvOptions: envRequirementGroups(config, network),
          missingEnv,
          networkSpecificDraftSuffix: `.${network}.md`,
        },
      ];
    }),
  );

  console.log(
    JSON.stringify(
      {
        globalConfigPath: config.sources.globalConfigPath,
        globalConfigPresent: config.sources.globalConfigPresent,
        projectConfigPath: config.sources.projectConfigPath,
        projectConfigPresent: config.sources.projectConfigPresent,
        warnings: config.warnings,
        dotenvPath,
        dotenvPathProvenance: provenanceFor(config, "paths.dotenv"),
        logPath,
        logPathProvenance: provenanceFor(config, "paths.posted_log"),
        logExists: await fileExists(logPath),
        effectiveDefaultNetworks: config.posting.defaultNetworks,
        effectiveDefaultNetworksProvenance: provenanceFor(
          config,
          "posting.default_networks",
        ),
        cliSelectedNetworks:
          cliConfig.targetNetworks.length > 0
            ? cliConfig.targetNetworks
            : undefined,
        configuredNetworks,
        supportedNetworks: networkInfo,
        crosspostNetworks: CROSSPOST_NETWORKS,
        directApiNetworks: DIRECT_NETWORKS,
        unsupportedNetworks: [],
        defaults: {
          messageFile: "<slug>.md",
          networkSpecificDraftPattern: "<slug>.<network>.md",
          crosspostDotenvEnv: "CROSSPOST_DOTENV",
        },
      },
      null,
      2,
    ),
  );
}

function validateNetworkConfiguration(
  config: ResolvedPosthasteConfig,
  networks: Network[],
  dotenvValues: Record<string, string>,
): void {
  const disabled = networks.filter(
    (network) => config.networks[network]?.enabled === false,
  );

  if (disabled.length > 0) {
    throw new Error(
      `Requested network is disabled by Posthaste! config: ${disabled.join(", ")}`,
    );
  }

  const missingByNetwork = networks
    .map((network) => {
      const missing = bestMissingEnv(config, network, dotenvValues);
      return { network, missing };
    })
    .filter(({ missing }) => missing.length > 0);

  if (missingByNetwork.length === 0) {
    return;
  }

  throw new Error(
    [
      "Some requested networks are not configured:",
      ...missingByNetwork.map(
        ({ network, missing }) => `- ${network}: missing ${missing.join(", ")}`,
      ),
    ].join("\n"),
  );
}

async function createTempMessageFile(
  message: string,
  network: Network,
): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const directory = await mkdtemp(
    join(tmpdir(), `posthaste-crosspost-${network}-`),
  );
  const filePath = join(directory, "message.txt");

  await writeFile(filePath, message, "utf8");

  return {
    path: filePath,
    cleanup: async () => {
      await rm(directory, {
        recursive: true,
        force: true,
      });
    },
  };
}

function inferredNetworkMessagePath(
  defaultMessageFile: string,
  network: Network,
): string {
  const resolved = resolve(expandHomePath(defaultMessageFile));
  const extension = extname(resolved);
  const stem = extension ? basename(resolved, extension) : basename(resolved);

  return join(dirname(resolved), `${stem}.${network}${extension || ".txt"}`);
}

async function readMessageFile(filePath: string): Promise<string> {
  const resolved = resolve(expandHomePath(filePath));
  await assertReadableFile(resolved, "Message file");
  const content = await readFile(resolved, "utf8");
  return content.trim();
}

async function prepareMessages(
  config: CliConfig,
  networks: Network[],
): Promise<PreparedMessage[]> {
  const prepared: PreparedMessage[] = [];

  for (const network of networks) {
    const networkFile = config.networkMessageFiles[network];

    if (networkFile) {
      const filePath = resolve(expandHomePath(networkFile));
      prepared.push({
        network,
        filePath,
        message: await readMessageFile(filePath),
      });
      continue;
    }

    if (config.messageFile) {
      const inferredPath = inferredNetworkMessagePath(
        config.messageFile,
        network,
      );
      const inferredContent = await readOptionalFile(inferredPath);

      if (inferredContent !== undefined) {
        prepared.push({
          network,
          filePath: inferredPath,
          message: inferredContent.trim(),
        });
        continue;
      }

      const filePath = resolve(expandHomePath(config.messageFile));
      prepared.push({
        network,
        filePath,
        message: await readMessageFile(filePath),
      });
      continue;
    }

    const tempMessage = await createTempMessageFile(
      config.message?.trim() ?? "",
      network,
    );
    prepared.push({
      network,
      filePath: tempMessage.path,
      message: config.message?.trim() ?? "",
      cleanup: tempMessage.cleanup,
    });
  }

  return prepared;
}

function validateMessageLengths(messages: PreparedMessage[]): void {
  const failures = messages
    .map((prepared) => {
      const length = [...prepared.message].length;
      const maxChars = SUPPORTED_NETWORKS[prepared.network].maxChars;
      return {
        ...prepared,
        length,
        maxChars,
      };
    })
    .filter(({ length, maxChars }) => length > maxChars);

  if (failures.length === 0) {
    return;
  }

  throw new Error(
    [
      "Message length exceeds one or more network limits:",
      ...failures.map(
        ({ network, length, maxChars, filePath }) =>
          `- ${network}: ${length}/${maxChars} characters in ${filePath}`,
      ),
      "Create a network-specific variant such as <slug>.bluesky.md or <slug>.nostr.md, or pass --message-file-<network>.",
    ].join("\n"),
  );
}

async function validateImage(config: CliConfig): Promise<void> {
  if (!config.image) {
    return;
  }

  if (!config.imageAlt || config.imageAlt.trim().length === 0) {
    throw new Error("--image-alt is required when --image is used.");
  }

  const imagePath = resolve(expandHomePath(config.image));
  await assertReadableFile(imagePath, "Image file");
}

function runCommand(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<CommandResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });

    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      rejectPromise(new Error(`Failed to start ${command}: ${error.message}`));
    });

    child.on("close", (exitCode) => {
      resolvePromise({
        exitCode: exitCode ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

function extractFirstUrl(output: string): string | undefined {
  const urlMatch = output.match(/https?:\/\/[^\s"'<>]+/u);
  return urlMatch?.[0];
}

function messagePreview(message: string): string {
  return message.length > LOGGED_MESSAGE_PREVIEW_LENGTH
    ? `${message.slice(0, LOGGED_MESSAGE_PREVIEW_LENGTH)}...`
    : message;
}

async function readLog(logPath: string): Promise<PostedRecord[]> {
  const content = await readOptionalFile(logPath);

  if (!content) {
    return [];
  }

  const records: PostedRecord[] = [];

  for (const line of content.split("\n")) {
    const trimmed = line.trim();

    if (!trimmed) {
      continue;
    }

    try {
      records.push(JSON.parse(trimmed) as PostedRecord);
    } catch {
      // Skip malformed lines; this log is append-only and should remain usable.
    }
  }

  return records;
}

function recordMatchesUrl(record: PostedRecord, url: string): boolean {
  const target = normaliseUrl(url);

  return (
    normaliseUrl(record.url) === target ||
    (record.canonicalUrl !== undefined &&
      normaliseUrl(record.canonicalUrl) === target)
  );
}

function hasPostedNetwork(record: PostedRecord, network: Network): boolean {
  if (record.networks?.[network]) {
    return true;
  }

  return network === "mastodon" && Boolean(record.mastodonUrl);
}

function alreadyPostedNetworks(
  records: PostedRecord[],
  url: string | undefined,
  networks: Network[],
): Network[] {
  if (!url) {
    return [];
  }

  return networks.filter((network) =>
    records.some(
      (record) =>
        recordMatchesUrl(record, url) && hasPostedNetwork(record, network),
    ),
  );
}

async function recordPostedNetwork(
  config: CliConfig,
  prepared: PreparedMessage,
  publishedUrl: string,
): Promise<void> {
  if (config.noLog || !config.sourceUrl) {
    return;
  }

  const logPath = resolve(expandHomePath(config.logPath));
  await mkdir(dirname(logPath), { recursive: true });

  const postedAt = new Date().toISOString();
  const record: PostedRecord = {
    url: config.sourceUrl,
    postedAt,
    message: messagePreview(prepared.message),
    networks: {
      [prepared.network]: {
        url: publishedUrl,
        postedAt,
      },
    },
    messages: {
      [prepared.network]: messagePreview(prepared.message),
    },
  };

  if (config.canonicalUrl) {
    record.canonicalUrl = config.canonicalUrl;
  }

  if (prepared.network === "mastodon") {
    record.mastodonUrl = publishedUrl;
  }

  await appendFile(logPath, `${JSON.stringify(record)}\n`, "utf8");
}

function commandForNetwork(
  prepared: PreparedMessage,
  config: CliConfig,
): string[] {
  const networkConfig = SUPPORTED_NETWORKS[prepared.network];

  if (networkConfig.transport !== "crosspost" || !networkConfig.flag) {
    throw new Error(`${prepared.network} is not a Crosspost network.`);
  }

  const args = [
    "--yes",
    "@humanwhocodes/crosspost",
    networkConfig.flag,
    "--file",
    prepared.filePath,
  ];

  if (config.image && SUPPORTED_NETWORKS[prepared.network].supportsImages) {
    args.push("--image", resolve(expandHomePath(config.image)));
    args.push("--image-alt", config.imageAlt ?? "");
  }

  return args;
}

interface DirectScriptResult {
  url?: string;
  postUrl?: string;
  commentUrl?: string;
  id?: string;
  dryRun?: boolean;
}

function directScriptPath(network: Network): string {
  const script = SUPPORTED_NETWORKS[network].directScript;

  if (!script) {
    throw new Error(`${network} does not have a direct API script.`);
  }

  return join(RESOURCE_DIR, script);
}

function addOptionalArg(
  args: string[],
  flag: string,
  value: string | undefined,
): void {
  if (value) {
    args.push(flag, value);
  }
}

function commandForDirectNetwork(
  prepared: PreparedMessage,
  config: CliConfig,
  effectiveDotenvPath: string,
): string[] {
  const args = [
    directScriptPath(prepared.network),
    "--message-file",
    prepared.filePath,
    "--dotenv",
    resolve(expandHomePath(effectiveDotenvPath)),
  ];

  if (config.dryRun) {
    args.push("--dry-run");
  }

  switch (prepared.network) {
    case "reddit":
      addOptionalArg(args, "--title", config.title);
      addOptionalArg(args, "--source-url", config.sourceUrl);
      addOptionalArg(args, "--canonical-url", config.canonicalUrl);
      addOptionalArg(args, "--reddit-link-url", config.redditLinkUrl);

      if (config.redditPostType) {
        args.push("--reddit-post-type", config.redditPostType);
      }

      if (config.redditNoComment) {
        args.push("--reddit-no-comment");
      }
      break;

    case "threads":
      addOptionalArg(
        args,
        "--link-attachment",
        config.canonicalUrl ?? config.sourceUrl,
      );
      break;

    case "tumblr":
      if (config.image) {
        addOptionalArg(args, "--image", resolve(expandHomePath(config.image)));
        addOptionalArg(args, "--image-alt", config.imageAlt);
      }
      break;

    default:
      throw new Error(`${prepared.network} is not a direct API network.`);
  }

  return args;
}

function parseDirectScriptResult(output: string): DirectScriptResult {
  const jsonLine = output
    .split("\n")
    .map((line) => line.trim())
    .reverse()
    .find((line) => line.startsWith("{") && line.endsWith("}"));

  if (!jsonLine) {
    throw new Error(`Direct API script did not return JSON:\n${output.trim()}`);
  }

  return JSON.parse(jsonLine) as DirectScriptResult;
}

function directResultUrl(result: DirectScriptResult): string {
  const primary = result.url ?? result.postUrl ?? result.id ?? "unknown";

  if (result.commentUrl) {
    return `${primary} (comment: ${result.commentUrl})`;
  }

  return primary;
}

async function main(): Promise<void> {
  const config = parseArgs(process.argv.slice(2));
  const resolvedConfig = await resolveRuntimeConfig(config);
  const effectiveDotenvPath = resolvedConfig.paths.dotenv;
  const dotenvValues = await readDotenv(effectiveDotenvPath);

  if (config.info) {
    await printInfo(config, resolvedConfig, dotenvValues);
    return;
  }

  const configuredNetworks = getConfiguredNetworks(
    resolvedConfig,
    dotenvValues,
  );
  const configuredDefaultNetworks =
    provenanceFor(resolvedConfig, "posting.default_networks") === "default"
      ? []
      : (resolvedConfig.posting.defaultNetworks as Network[]);
  const selectedNetworks =
    config.targetNetworks.length > 0
      ? config.targetNetworks
      : configuredDefaultNetworks.length > 0
        ? configuredDefaultNetworks
        : configuredNetworks;

  if (selectedNetworks.length === 0) {
    throw new Error(
      `No supported networks are configured. Add env vars for one of: ${Object.keys(SUPPORTED_NETWORKS).join(", ")}.`,
    );
  }

  validateNetworkConfiguration(resolvedConfig, selectedNetworks, dotenvValues);
  await validateImage(config);

  const logPath = resolve(expandHomePath(resolvedConfig.paths.postedLog));
  config.logPath = resolvedConfig.paths.postedLog;
  const records = await readLog(logPath);
  const loggedNetworks = config.force
    ? []
    : alreadyPostedNetworks(
        records,
        config.canonicalUrl ?? config.sourceUrl,
        selectedNetworks,
      );
  const networksToPost = selectedNetworks.filter(
    (network) => !loggedNetworks.includes(network),
  );

  if (networksToPost.length === 0) {
    console.log(
      `Already posted to all requested networks: ${selectedNetworks.join(", ")}`,
    );
    return;
  }

  const preparedMessages = await prepareMessages(config, networksToPost);
  validateMessageLengths(preparedMessages);

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CROSSPOST_DOTENV:
      process.env.CROSSPOST_DOTENV ??
      resolve(expandHomePath(effectiveDotenvPath)),
  };
  const published: string[] = [];

  try {
    if (loggedNetworks.length > 0) {
      console.log(
        `Skipping already-posted networks: ${loggedNetworks.join(", ")}`,
      );
    }

    for (const prepared of preparedMessages) {
      const networkConfig = SUPPORTED_NETWORKS[prepared.network];

      if (config.dryRun) {
        console.log(`Dry run for ${prepared.network}. No post was published.`);
        console.log(`Transport: ${networkConfig.transport}`);
        if (networkConfig.transport === "crosspost") {
          const args = commandForNetwork(prepared, config);
          console.log(
            `Command: npx ${args.map((arg) => JSON.stringify(arg)).join(" ")}`,
          );
        } else {
          const args = commandForDirectNetwork(
            prepared,
            config,
            effectiveDotenvPath,
          );
          console.log(
            `Command: node ${args.map((arg) => JSON.stringify(arg)).join(" ")}`,
          );
        }
        console.log(`Characters: ${[...prepared.message].length}`);
        console.log(`CROSSPOST_DOTENV: ${env.CROSSPOST_DOTENV}`);
        continue;
      }

      let url: string;

      if (networkConfig.transport === "crosspost") {
        const args = commandForNetwork(prepared, config);
        const result = await runCommand("npx", args, env);
        const combinedOutput = [result.stdout, result.stderr]
          .filter(Boolean)
          .join("\n")
          .trim();

        if (result.exitCode !== 0) {
          throw new Error(
            `Crosspost failed for ${prepared.network} with exit code ${result.exitCode}.\n${combinedOutput}`,
          );
        }

        url = extractFirstUrl(combinedOutput) ?? "unknown";
      } else {
        const args = commandForDirectNetwork(
          prepared,
          config,
          effectiveDotenvPath,
        );
        const result = await runCommand("node", args, env);
        const combinedOutput = [result.stdout, result.stderr]
          .filter(Boolean)
          .join("\n")
          .trim();

        if (result.exitCode !== 0) {
          throw new Error(
            `Direct API script failed for ${prepared.network} with exit code ${result.exitCode}.\n${combinedOutput}`,
          );
        }

        url = directResultUrl(parseDirectScriptResult(combinedOutput));
      }

      await recordPostedNetwork(config, prepared, url);
      published.push(`${prepared.network}: ${url}`);
    }
  } finally {
    await Promise.all(preparedMessages.map((prepared) => prepared.cleanup?.()));
  }

  if (config.dryRun) {
    return;
  }

  if (published.length === 0) {
    console.log("No networks were published.");
    return;
  }

  console.log("Published:");

  for (const line of published) {
    console.log(`- ${line}`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});
