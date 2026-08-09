import { constants as fsConstants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
  loadPosthasteConfig,
  type NetworkConfigDefaults,
  POSTHASTE_SHARED_NETWORKS,
  type ResolvedPosthasteConfig,
} from "../../posthaste-config/resources/config.ts";

export interface CommonDirectConfig {
  message?: string;
  messageFile?: string;
  dotenvPath: string;
  explicitDotenvPath?: boolean;
  dryRun: boolean;
}

export interface DirectRuntimeConfig {
  config: ResolvedPosthasteConfig;
  dotenvPath: string;
  dotenvValues: Record<string, string>;
}

export function expandHomePath(input: string): string {
  if (input === "~") {
    return homedir();
  }

  if (input.startsWith("~/")) {
    return join(homedir(), input.slice(2));
  }

  return input;
}

export async function readOptionalFile(
  filePath: string,
): Promise<string | undefined> {
  try {
    await access(filePath, fsConstants.R_OK);
  } catch {
    return undefined;
  }

  return readFile(filePath, "utf8");
}

export async function readDotenv(
  dotenvPath: string,
): Promise<Record<string, string>> {
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

export function getEnvValue(
  name: string,
  dotenvValues: Record<string, string>,
): string | undefined {
  return process.env[name] || dotenvValues[name];
}

export function getConfiguredEnvName(
  config: ResolvedPosthasteConfig,
  network: string,
  semanticKey: string,
  fallback: string,
): string {
  return config.networks[network]?.env[semanticKey] ?? fallback;
}

export function getConfiguredEnvValue(
  config: ResolvedPosthasteConfig,
  network: string,
  semanticKey: string,
  fallback: string,
  dotenvValues: Record<string, string>,
): string | undefined {
  return getEnvValue(
    getConfiguredEnvName(config, network, semanticKey, fallback),
    dotenvValues,
  );
}

export function requireEnvValue(
  name: string,
  dotenvValues: Record<string, string>,
): string {
  const value = getEnvValue(name, dotenvValues);

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function requireConfiguredEnvValue(
  config: ResolvedPosthasteConfig,
  network: string,
  semanticKey: string,
  fallback: string,
  dotenvValues: Record<string, string>,
): string {
  const envName = getConfiguredEnvName(config, network, semanticKey, fallback);
  const value = getEnvValue(envName, dotenvValues);

  if (!value) {
    throw new Error(`Missing required environment variable: ${envName}`);
  }

  return value;
}

export async function loadDirectRuntimeConfig(
  cliConfig: CommonDirectConfig,
  network: string,
  networkDefaults: NetworkConfigDefaults,
): Promise<DirectRuntimeConfig> {
  const config = await loadPosthasteConfig({
    defaults: {
      paths: {
        dotenv: cliConfig.dotenvPath,
      },
      networks: {
        [network]: networkDefaults,
      },
    },
    cli: cliConfig.explicitDotenvPath
      ? {
          paths: {
            dotenv: cliConfig.dotenvPath,
          },
        }
      : undefined,
    knownNetworks: POSTHASTE_SHARED_NETWORKS,
  });
  const dotenvPath = cliConfig.explicitDotenvPath
    ? cliConfig.dotenvPath
    : config.paths.dotenv;
  const dotenvValues = await readDotenv(dotenvPath);

  return { config, dotenvPath, dotenvValues };
}

export async function readMessage(config: CommonDirectConfig): Promise<string> {
  if (config.message && config.messageFile) {
    throw new Error("Use either --message or --message-file, not both.");
  }

  if (config.message) {
    return config.message.trim();
  }

  if (!config.messageFile) {
    throw new Error("Missing message. Use --message or --message-file.");
  }

  const filePath = resolve(expandHomePath(config.messageFile));
  const content = await readOptionalFile(filePath);

  if (content === undefined) {
    throw new Error(`Message file is not readable: ${filePath}`);
  }

  return content.trim();
}

export function redactSecrets(
  text: string,
  dotenvValues: Record<string, string>,
): string {
  let redacted = text;
  const values = [
    ...Object.values(dotenvValues),
    ...Object.values(process.env).filter(
      (value): value is string => typeof value === "string",
    ),
  ]
    .filter((value) => value.length >= 8)
    .sort((a, b) => b.length - a.length);

  for (const value of values) {
    redacted = redacted.split(value).join("[redacted]");
  }

  return redacted
    .replace(
      /("(?:access_token|refresh_token|private_key|client_secret)"\s*:\s*")([^"]+)(")/giu,
      "$1[redacted]$3",
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gu, "Bearer [redacted]");
}

function previewText(text: string): string {
  return text.length > 1000 ? `${text.slice(0, 1000)}...` : text;
}

export async function fetchJson(
  url: string,
  init: RequestInit,
  label: string,
  dotenvValues: Record<string, string>,
): Promise<unknown> {
  const response = await fetch(url, init);
  const body = await response.text();
  const safePreview = redactSecrets(previewText(body), dotenvValues);

  if (!response.ok) {
    throw new Error(
      `${label} failed with HTTP ${response.status}: ${safePreview}`,
    );
  }

  if (!body.trim()) {
    return {};
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`${label} returned non-JSON response: ${safePreview}`);
  }
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

export function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return undefined;
}

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value));
}
