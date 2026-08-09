import { constants as fsConstants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parse, TomlError, type TomlValue } from "smol-toml";

export type ConfigSource =
  | "default"
  | "global"
  | "project"
  | "environment"
  | "cli";

export const POSTHASTE_SHARED_NETWORKS = [
  "mastodon",
  "bluesky",
  "linkedin",
  "nostr",
  "reddit",
  "threads",
  "tumblr",
  "patreon",
] as const;

export interface NetworkConfigDefaults {
  enabled: boolean;
  env?: Record<string, string>;
}

export interface PosthasteConfigDefaults {
  posting?: {
    defaultNetworks?: string[];
  };
  paths?: {
    dotenv?: string;
    postedLog?: string;
  };
  networks?: Record<string, NetworkConfigDefaults>;
}

export interface ResolvedNetworkConfig {
  enabled: boolean;
  env: Record<string, string>;
}

export interface ResolvedPosthasteConfig {
  version: number;
  posting: {
    defaultNetworks: string[];
  };
  paths: {
    dotenv: string;
    postedLog: string;
  };
  networks: Record<string, ResolvedNetworkConfig>;
  sources: {
    globalConfigPath: string;
    globalConfigPresent: boolean;
    projectConfigPath: string;
    projectConfigPresent: boolean;
  };
  provenance: Record<string, ConfigSource>;
  warnings: string[];
}

export interface LoadPosthasteConfigOptions {
  cwd?: string;
  globalConfigPath?: string;
  projectConfigPath?: string;
  defaults?: PosthasteConfigDefaults;
  environment?: Partial<PosthasteConfigDefaults>;
  cli?: Partial<PosthasteConfigDefaults>;
  knownNetworks?: readonly string[];
}

type PlainRecord = Record<string, unknown>;

interface LoadedLayer {
  source: ConfigSource;
  values: PlainRecord;
}

const SUPPORTED_CONFIG_VERSION = 1;
const ENV_NAME_PATTERN = /^[A-Z_][A-Z0-9_]*$/u;
const SUSPICIOUS_SECRET_KEYS = [
  "access_token",
  "authorization_code",
  "client_secret",
  "password",
  "private_key",
  "refresh_token",
  "secret",
  "token",
] as const;

export function expandHomePath(input: string): string {
  if (input === "~") {
    return homedir();
  }

  if (input.startsWith("~/")) {
    return join(homedir(), input.slice(2));
  }

  return input;
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export function defaultGlobalConfigPath(): string {
  return join(homedir(), ".config", "posthaste", "config.toml");
}

export function defaultProjectConfigPath(cwd = process.cwd()): string {
  return resolve(cwd, ".posthaste.toml");
}

export async function loadPosthasteConfig(
  options: LoadPosthasteConfigOptions = {},
): Promise<ResolvedPosthasteConfig> {
  const cwd = options.cwd ?? process.cwd();
  const globalConfigPath = resolve(
    expandHomePath(options.globalConfigPath ?? defaultGlobalConfigPath()),
  );
  const projectConfigPath = resolve(
    expandHomePath(options.projectConfigPath ?? defaultProjectConfigPath(cwd)),
  );
  const layers: LoadedLayer[] = [
    {
      source: "default",
      values: defaultsToRaw(options.defaults ?? {}),
    },
  ];
  const globalConfigPresent = await fileExists(globalConfigPath);

  if (globalConfigPresent) {
    layers.push({
      source: "global",
      values: await parseTomlFile(globalConfigPath),
    });
  }

  const projectConfigPresent = await fileExists(projectConfigPath);

  if (projectConfigPresent) {
    layers.push({
      source: "project",
      values: await parseTomlFile(projectConfigPath),
    });
  }

  if (options.environment) {
    layers.push({
      source: "environment",
      values: defaultsToRaw(options.environment),
    });
  }

  if (options.cli) {
    layers.push({
      source: "cli",
      values: defaultsToRaw(options.cli),
    });
  }

  const merged: PlainRecord = {};
  const provenance: Record<string, ConfigSource> = {};

  for (const layer of layers) {
    mergeLayer(merged, layer.values, layer.source, provenance);
  }

  const warnings = validateRawConfig(merged, options.knownNetworks);
  const resolved = rawToResolvedConfig(merged);

  validateResolvedConfig(resolved, options.knownNetworks);

  return {
    ...resolved,
    sources: {
      globalConfigPath,
      globalConfigPresent,
      projectConfigPath,
      projectConfigPresent,
    },
    provenance,
    warnings,
  };
}

function defaultsToRaw(
  defaults: Partial<PosthasteConfigDefaults>,
): PlainRecord {
  const raw: PlainRecord = {};

  if (defaults.posting?.defaultNetworks) {
    raw.posting = {
      default_networks: defaults.posting.defaultNetworks,
    };
  }

  if (defaults.paths) {
    raw.paths = {
      ...(defaults.paths.dotenv ? { dotenv: defaults.paths.dotenv } : {}),
      ...(defaults.paths.postedLog
        ? { posted_log: defaults.paths.postedLog }
        : {}),
    };
  }

  if (defaults.networks) {
    raw.networks = Object.fromEntries(
      Object.entries(defaults.networks).map(([network, config]) => [
        network,
        {
          enabled: config.enabled,
          ...(config.env ? { env: config.env } : {}),
        },
      ]),
    );
  }

  return raw;
}

async function parseTomlFile(filePath: string): Promise<PlainRecord> {
  const content = await readFile(filePath, "utf8");

  try {
    return asPlainRecord(parse(content) as TomlValue);
  } catch (error) {
    const detail =
      error instanceof TomlError || error instanceof Error
        ? error.message
        : String(error);
    throw new Error(
      `Malformed Posthaste TOML config at ${filePath}: ${detail}`,
    );
  }
}

function asPlainRecord(value: unknown): PlainRecord {
  return isPlainRecord(value) ? value : {};
}

function isPlainRecord(value: unknown): value is PlainRecord {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}

function mergeLayer(
  target: PlainRecord,
  source: PlainRecord,
  sourceName: ConfigSource,
  provenance: Record<string, ConfigSource>,
  path: string[] = [],
): void {
  for (const [key, value] of Object.entries(source)) {
    const nextPath = [...path, key];
    const provenanceKey = configPath(nextPath);
    const existing = target[key];

    if (isPlainRecord(existing) && isPlainRecord(value)) {
      mergeLayer(existing, value, sourceName, provenance, nextPath);
      continue;
    }

    target[key] = value;
    provenance[provenanceKey] = sourceName;

    if (isPlainRecord(value)) {
      markNestedProvenance(value, sourceName, provenance, nextPath);
    }
  }
}

function markNestedProvenance(
  value: PlainRecord,
  sourceName: ConfigSource,
  provenance: Record<string, ConfigSource>,
  path: string[],
): void {
  for (const [key, child] of Object.entries(value)) {
    const nextPath = [...path, key];
    provenance[configPath(nextPath)] = sourceName;

    if (isPlainRecord(child)) {
      markNestedProvenance(child, sourceName, provenance, nextPath);
    }
  }
}

function configPath(path: string[]): string {
  return path.join(".");
}

function validateRawConfig(
  raw: PlainRecord,
  knownNetworks: readonly string[] | undefined,
): string[] {
  const warnings: string[] = [];
  const allowedTopLevel = new Set([
    "version",
    "posting",
    "paths",
    "networks",
    "skills",
  ]);

  for (const key of Object.keys(raw)) {
    if (!allowedTopLevel.has(key)) {
      warnings.push(`Unknown top-level key: ${key}`);
    }
  }

  if (raw.version !== undefined) {
    if (
      !Number.isInteger(raw.version) ||
      raw.version !== SUPPORTED_CONFIG_VERSION
    ) {
      throw new Error(
        "Invalid Posthaste config key version: expected integer 1.",
      );
    }
  }

  validatePosting(raw.posting);
  validatePaths(raw.paths);
  validateNetworks(raw.networks, knownNetworks, warnings);
  validateNoInlineSecrets(raw);

  return warnings;
}

function validatePosting(value: unknown): void {
  if (value === undefined) {
    return;
  }

  if (!isPlainRecord(value)) {
    throw new Error("Invalid Posthaste config key posting: expected a table.");
  }

  if (value.default_networks === undefined) {
    return;
  }

  if (!Array.isArray(value.default_networks)) {
    throw new Error(
      "Invalid Posthaste config key posting.default_networks: expected an array of network names.",
    );
  }

  for (const network of value.default_networks) {
    if (typeof network !== "string" || network.trim().length === 0) {
      throw new Error(
        "Invalid Posthaste config key posting.default_networks: expected non-empty string network names.",
      );
    }
  }
}

function validatePaths(value: unknown): void {
  if (value === undefined) {
    return;
  }

  if (!isPlainRecord(value)) {
    throw new Error("Invalid Posthaste config key paths: expected a table.");
  }

  for (const key of ["dotenv", "posted_log"] as const) {
    const path = value[key];

    if (path !== undefined && (typeof path !== "string" || !path.trim())) {
      throw new Error(
        `Invalid Posthaste config key paths.${key}: expected a non-empty string.`,
      );
    }
  }
}

function validateNetworks(
  value: unknown,
  knownNetworks: readonly string[] | undefined,
  warnings: string[],
): void {
  if (value === undefined) {
    return;
  }

  if (!isPlainRecord(value)) {
    throw new Error("Invalid Posthaste config key networks: expected a table.");
  }

  const known = knownNetworks ? new Set(knownNetworks) : undefined;

  for (const [network, networkValue] of Object.entries(value)) {
    if (known && !known.has(network)) {
      warnings.push(`Unknown network table: networks.${network}`);
    }

    if (!isPlainRecord(networkValue)) {
      throw new Error(
        `Invalid Posthaste config key networks.${network}: expected a table.`,
      );
    }

    if (
      networkValue.enabled !== undefined &&
      typeof networkValue.enabled !== "boolean"
    ) {
      throw new Error(
        `Invalid Posthaste config key networks.${network}.enabled: expected a boolean.`,
      );
    }

    if (networkValue.env !== undefined) {
      validateEnvTable(network, networkValue.env);
    }
  }
}

function validateEnvTable(network: string, value: unknown): void {
  if (!isPlainRecord(value)) {
    throw new Error(
      `Invalid Posthaste config key networks.${network}.env: expected a table.`,
    );
  }

  for (const [key, envName] of Object.entries(value)) {
    if (typeof envName !== "string") {
      throw new Error(
        `Invalid Posthaste config key networks.${network}.env.${key}: expected an environment variable name string.`,
      );
    }

    if (!ENV_NAME_PATTERN.test(envName)) {
      throw new Error(
        `Invalid Posthaste config key networks.${network}.env.${key}: expected an uppercase environment variable name.`,
      );
    }
  }
}

function validateNoInlineSecrets(value: unknown, path: string[] = []): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      validateNoInlineSecrets(item, path);
    }
    return;
  }

  if (!isPlainRecord(value)) {
    return;
  }

  const isEnvTable = path.at(-1) === "env";

  for (const [key, child] of Object.entries(value)) {
    const childPath = [...path, key];

    if (
      !isEnvTable &&
      typeof child === "string" &&
      SUSPICIOUS_SECRET_KEYS.some((secretKey) =>
        key.toLowerCase().includes(secretKey),
      )
    ) {
      throw new Error(
        `Invalid Posthaste config key ${configPath(childPath)}: store only environment variable names in TOML, not credential values.`,
      );
    }

    validateNoInlineSecrets(child, childPath);
  }
}

function rawToResolvedConfig(
  raw: PlainRecord,
): Omit<ResolvedPosthasteConfig, "sources" | "provenance" | "warnings"> {
  const posting = asPlainRecord(raw.posting);
  const paths = asPlainRecord(raw.paths);
  const networks = asPlainRecord(raw.networks);

  return {
    version:
      typeof raw.version === "number" && Number.isInteger(raw.version)
        ? raw.version
        : SUPPORTED_CONFIG_VERSION,
    posting: {
      defaultNetworks: Array.isArray(posting.default_networks)
        ? posting.default_networks.map(String)
        : [],
    },
    paths: {
      dotenv: typeof paths.dotenv === "string" ? paths.dotenv : "~/.env",
      postedLog:
        typeof paths.posted_log === "string"
          ? paths.posted_log
          : "~/.local/share/posthaste-prepare-link/posted.jsonl",
    },
    networks: Object.fromEntries(
      Object.entries(networks).map(([network, config]) => {
        const record = asPlainRecord(config);
        const env = asPlainRecord(record.env);

        return [
          network,
          {
            enabled:
              typeof record.enabled === "boolean" ? record.enabled : true,
            env: Object.fromEntries(
              Object.entries(env).filter(
                (entry): entry is [string, string] =>
                  typeof entry[1] === "string",
              ),
            ),
          },
        ];
      }),
    ),
  };
}

function validateResolvedConfig(
  resolved: Omit<
    ResolvedPosthasteConfig,
    "sources" | "provenance" | "warnings"
  >,
  knownNetworks: readonly string[] | undefined,
): void {
  const known = knownNetworks ? new Set(knownNetworks) : undefined;

  if (known) {
    for (const network of resolved.posting.defaultNetworks) {
      if (!known.has(network)) {
        throw new Error(
          `Invalid Posthaste config key posting.default_networks: unknown network ${network}.`,
        );
      }
    }
  }

  for (const network of resolved.posting.defaultNetworks) {
    if (resolved.networks[network]?.enabled === false) {
      throw new Error(
        `Invalid Posthaste config: posting.default_networks includes disabled network ${network}.`,
      );
    }
  }
}

export function provenanceFor(
  config: ResolvedPosthasteConfig,
  path: string,
): ConfigSource {
  return config.provenance[path] ?? "default";
}

export function envNameFor(
  config: ResolvedPosthasteConfig,
  network: string,
  semanticKey: string,
  fallback: string,
): string {
  return config.networks[network]?.env[semanticKey] ?? fallback;
}
