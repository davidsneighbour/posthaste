#!/usr/bin/env node

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  chmod,
  mkdir,
  readFile,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import {
  envNameFor,
  loadPosthasteConfig,
  POSTHASTE_SHARED_NETWORKS,
  type ResolvedPosthasteConfig,
} from "../../posthaste-config/resources/config.ts";

interface CliConfig {
  consumerKey?: string;
  consumerSecret?: string;
  redirectUri: string;
  redirectHost: string;
  redirectPort: number;
  callbackPath: string;
  explicitRedirectUri: boolean;
  scope: string;
  blogIdentifier?: string;
  dotenvPath: string;
  explicitDotenvPath: boolean;
  writeEnv: boolean;
  refreshExisting: boolean;
  fixPermissions: boolean;
  noOpen: boolean;
  timeoutMs: number;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
  message?: string;
}

interface TumblrBlog {
  name?: string;
  uuid?: string;
  url?: string;
  primary?: boolean;
}

interface TumblrUserInfoResponse {
  response?: {
    user?: {
      blogs?: TumblrBlog[];
    };
  };
}

interface AuthorizationServer {
  code: Promise<string>;
  ready: Promise<void>;
}

const DEFAULT_REDIRECT_HOST = "127.0.0.1";
const DEFAULT_REDIRECT_PORT = 8767;
const DEFAULT_CALLBACK_PATH = "/callback";
const DEFAULT_REDIRECT_URI = `http://${DEFAULT_REDIRECT_HOST}:${DEFAULT_REDIRECT_PORT}${DEFAULT_CALLBACK_PATH}`;
const DEFAULT_DOTENV_PATH = "~/.env";
const DEFAULT_SCOPE = "basic write offline_access";
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const ENV_KEYS = [
  "TUMBLR_CONSUMER_KEY",
  "TUMBLR_CONSUMER_SECRET",
  "TUMBLR_ACCESS_TOKEN",
  "TUMBLR_REFRESH_TOKEN",
  "TUMBLR_ACCESS_TOKEN_EXPIRES_AT",
  "TUMBLR_BLOG_IDENTIFIER",
] as const;
const TUMBLR_ENV_DEFAULTS = {
  access_token: "TUMBLR_ACCESS_TOKEN",
  access_token_expires_at: "TUMBLR_ACCESS_TOKEN_EXPIRES_AT",
  blog_identifier: "TUMBLR_BLOG_IDENTIFIER",
  consumer_key: "TUMBLR_CONSUMER_KEY",
  consumer_secret: "TUMBLR_CONSUMER_SECRET",
  refresh_token: "TUMBLR_REFRESH_TOKEN",
};

function printHelp(): void {
  console.log(`
Create or refresh Tumblr OAuth2 credentials, either via a loopback-only local
callback server or a hosted HTTPS callback page (see auth-site/). Tumblr does
not accept localhost/127.0.0.1 redirect URIs for hosted apps, so pass
--redirect-uri pointing at the hosted callback microsite.

Usage:
  node create-tumblr-refresh-token.ts --write-env --redirect-uri "https://<site>.netlify.app/callback"
  node create-tumblr-refresh-token.ts --write-env --refresh-existing

Options:
  --consumer-key <key>       Tumblr consumer key. Default: TUMBLR_CONSUMER_KEY.
  --consumer-secret <secret> Tumblr consumer secret. Default: TUMBLR_CONSUMER_SECRET.
  --redirect-uri <uri>       Redirect URI registered in the Tumblr app.
                             A non-loopback https:// URI (e.g. the hosted
                             auth-site callback) switches to the paste flow:
                             after authorizing, paste the callback URL or code
                             when prompted. Overrides --host/--port/--callback-path.
                             Default: ${DEFAULT_REDIRECT_URI}
  --host <host>              Loopback callback host (loopback flow only).
                             Default: ${DEFAULT_REDIRECT_HOST}
  --port <port>              Loopback callback port (loopback flow only).
                             Default: ${DEFAULT_REDIRECT_PORT}
  --callback-path <path>     Loopback callback path (loopback flow only).
                             Default: ${DEFAULT_CALLBACK_PATH}
  --scope <scopes>           Space-separated Tumblr OAuth scopes.
                             Default: "${DEFAULT_SCOPE}"
  --blog-identifier <value>  Blog name or UUID to store. Default: primary blog.
  --dotenv <path>            Dotenv file to read and update. Default: ${DEFAULT_DOTENV_PATH}
  --refresh-existing         Refresh TUMBLR_ACCESS_TOKEN without opening a browser.
  --write-env                Required. Store token values in the dotenv file.
  --fix-permissions          chmod the dotenv file to 0600 before writing if needed.
  --no-open                  Print the authorization URL instead of opening a browser.
  --timeout-ms <ms>          Loopback callback wait timeout. Default: ${DEFAULT_TIMEOUT_MS}
  --help                     Show this help.

Security:
  - Tokens and authorization codes are never printed to stdout/stderr; the
    hosted paste flow only echoes back what you paste in, interactively.
  - Redirect URIs must be http(s)://; hosted (non-loopback) URIs must be https.
  - The OAuth state parameter is generated per run and verified on callback,
    in both the local-server and hosted paste flows.
  - The dotenv file must be private (0600) unless --fix-permissions is used.
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

function requireArg(argv: string[], index: number, flag: string): string {
  const value = argv[index];

  if (!value) {
    throw new Error(`${flag} needs a value.`);
  }

  return value;
}

function parseArgs(argv: string[]): CliConfig {
  const config: CliConfig = {
    redirectUri: DEFAULT_REDIRECT_URI,
    redirectHost: DEFAULT_REDIRECT_HOST,
    redirectPort: DEFAULT_REDIRECT_PORT,
    callbackPath: DEFAULT_CALLBACK_PATH,
    explicitRedirectUri: false,
    scope: DEFAULT_SCOPE,
    dotenvPath: DEFAULT_DOTENV_PATH,
    explicitDotenvPath: false,
    writeEnv: false,
    refreshExisting: false,
    fixPermissions: false,
    noOpen: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
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

      case "--consumer-key":
        config.consumerKey = nextValue(arg);
        break;

      case "--consumer-secret":
        config.consumerSecret = nextValue(arg);
        break;

      case "--host":
        config.redirectHost = nextValue(arg);
        break;

      case "--port":
        config.redirectPort = Number(nextValue(arg));
        break;

      case "--callback-path":
        config.callbackPath = normaliseCallbackPath(nextValue(arg));
        break;

      case "--redirect-uri":
        config.redirectUri = nextValue(arg);
        config.explicitRedirectUri = true;
        break;

      case "--scope":
        config.scope = nextValue(arg);
        break;

      case "--blog-identifier":
        config.blogIdentifier = nextValue(arg);
        break;

      case "--dotenv":
        config.dotenvPath = nextValue(arg);
        config.explicitDotenvPath = true;
        break;

      case "--refresh-existing":
        config.refreshExisting = true;
        break;

      case "--write-env":
        config.writeEnv = true;
        break;

      case "--fix-permissions":
        config.fixPermissions = true;
        break;

      case "--no-open":
        config.noOpen = true;
        break;

      case "--timeout-ms":
        config.timeoutMs = Number(nextValue(arg));
        break;

      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return config;
}

async function readDotenv(dotenvPath: string): Promise<Record<string, string>> {
  const resolved = resolve(expandHomePath(dotenvPath));
  let content = "";

  try {
    content = await readFile(resolved, "utf8");
  } catch (error) {
    if (
      !(
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      )
    ) {
      throw error;
    }
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

function hydrateConfig(
  config: CliConfig,
  dotenvValues: Record<string, string>,
  runtimeConfig: ResolvedPosthasteConfig,
): void {
  const consumerKeyName = envNameFor(
    runtimeConfig,
    "tumblr",
    "consumer_key",
    "TUMBLR_CONSUMER_KEY",
  );
  const consumerSecretName = envNameFor(
    runtimeConfig,
    "tumblr",
    "consumer_secret",
    "TUMBLR_CONSUMER_SECRET",
  );
  const blogIdentifierName = envNameFor(
    runtimeConfig,
    "tumblr",
    "blog_identifier",
    "TUMBLR_BLOG_IDENTIFIER",
  );
  const consumerKey =
    process.env[consumerKeyName] ?? dotenvValues[consumerKeyName];
  const consumerSecret =
    process.env[consumerSecretName] ?? dotenvValues[consumerSecretName];
  const blogIdentifier =
    process.env[blogIdentifierName] ?? dotenvValues[blogIdentifierName];

  if (!config.consumerKey && consumerKey) {
    config.consumerKey = consumerKey;
  }

  if (!config.consumerSecret && consumerSecret) {
    config.consumerSecret = consumerSecret;
  }

  if (!config.blogIdentifier && blogIdentifier) {
    config.blogIdentifier = blogIdentifier;
  }

  if (!Number.isInteger(config.redirectPort) || config.redirectPort <= 0) {
    throw new Error("--port must be a positive integer.");
  }

  if (!config.explicitRedirectUri) {
    config.redirectUri = buildLoopbackRedirectUri(config);
  }

  if (!config.writeEnv) {
    throw new Error(
      "Refusing to request or refresh a Tumblr token without --write-env. Tokens are never printed, so choose explicit secure storage first.",
    );
  }

  if (!config.consumerKey) {
    throw new Error(`Missing --consumer-key or ${consumerKeyName}.`);
  }

  if (!config.consumerSecret) {
    throw new Error(`Missing --consumer-secret or ${consumerSecretName}.`);
  }

  if (!Number.isFinite(config.timeoutMs) || config.timeoutMs <= 0) {
    throw new Error("--timeout-ms must be a positive number.");
  }
}

async function loadRuntimeConfig(
  config: CliConfig,
): Promise<ResolvedPosthasteConfig> {
  const runtimeConfig = await loadPosthasteConfig({
    defaults: {
      paths: {
        dotenv: DEFAULT_DOTENV_PATH,
      },
      networks: {
        tumblr: {
          enabled: true,
          env: TUMBLR_ENV_DEFAULTS,
        },
      },
    },
    cli: config.explicitDotenvPath
      ? {
          paths: {
            dotenv: config.dotenvPath,
          },
        }
      : undefined,
    knownNetworks: POSTHASTE_SHARED_NETWORKS,
  });

  config.dotenvPath = runtimeConfig.paths.dotenv;
  return runtimeConfig;
}

function normaliseCallbackPath(input: string): string {
  const trimmed = input.trim();

  if (!trimmed) {
    return DEFAULT_CALLBACK_PATH;
  }

  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function buildLoopbackRedirectUri(config: CliConfig): string {
  return `http://${config.redirectHost}:${config.redirectPort}${config.callbackPath}`;
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname);
}

function parseRedirectUri(redirectUri: string): URL {
  const url = new URL(redirectUri);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Redirect URI must use http:// or https://.");
  }

  if (isLoopbackHost(url.hostname)) {
    if (!url.port) {
      throw new Error(
        "A loopback redirect URI must include an explicit local port.",
      );
    }

    return url;
  }

  if (url.protocol !== "https:") {
    throw new Error("A hosted (non-loopback) redirect URI must use https://.");
  }

  return url;
}

function buildAuthorizationUrl(config: CliConfig, state: string): string {
  const url = new URL("https://www.tumblr.com/oauth2/authorize");
  url.searchParams.set("client_id", config.consumerKey as string);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scope);
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", config.redirectUri);

  return url.toString();
}

function sendHtml(
  response: ServerResponse,
  statusCode: number,
  title: string,
  message: string,
): void {
  response.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(message)}</p>
</body>
</html>`);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function startAuthorizationServer(
  redirectUrl: URL,
  expectedState: string,
  timeoutMs: number,
): AuthorizationServer {
  let resolveReady: () => void;
  let rejectReady: (error: Error) => void;
  const ready = new Promise<void>((resolvePromise, rejectPromise) => {
    resolveReady = resolvePromise;
    rejectReady = rejectPromise;
  });
  const code = new Promise<string>((resolvePromise, rejectPromise) => {
    let settled = false;
    const timeout = setTimeout(() => {
      finish(new Error("Timed out waiting for Tumblr OAuth callback."));
    }, timeoutMs);
    const server = createServer(
      (request: IncomingMessage, response: ServerResponse) => {
        try {
          const requestUrl = new URL(
            request.url ?? "/",
            `${redirectUrl.protocol}//${redirectUrl.host}`,
          );

          if (requestUrl.pathname !== redirectUrl.pathname) {
            sendHtml(
              response,
              404,
              "Not found",
              "This OAuth helper only handles the configured callback path.",
            );
            return;
          }

          const error = requestUrl.searchParams.get("error");

          if (error) {
            sendHtml(
              response,
              400,
              "Authorization failed",
              "Tumblr returned an OAuth error. You can close this tab.",
            );
            finish(new Error(`Tumblr returned OAuth error: ${error}`));
            return;
          }

          const state = requestUrl.searchParams.get("state");

          if (state !== expectedState) {
            sendHtml(
              response,
              400,
              "State mismatch",
              "The OAuth state did not match. You can close this tab.",
            );
            finish(new Error("OAuth state mismatch. Refusing to continue."));
            return;
          }

          const code = requestUrl.searchParams.get("code");

          if (!code) {
            sendHtml(
              response,
              400,
              "Missing code",
              "Tumblr did not include an authorization code. You can close this tab.",
            );
            finish(new Error("OAuth callback did not include a code."));
            return;
          }

          sendHtml(
            response,
            200,
            "Tumblr authorization received",
            "The Tumblr token was stored securely. You can close this tab.",
          );
          finish(undefined, code);
        } catch (error) {
          sendHtml(
            response,
            500,
            "Callback error",
            "The local OAuth helper failed. You can close this tab.",
          );
          finish(error instanceof Error ? error : new Error(String(error)));
        }
      },
    );

    function finish(error?: Error, code?: string): void {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      server.close();

      if (error) {
        rejectPromise(error);
        return;
      }

      resolvePromise(code as string);
    }

    server.once("error", (error) => {
      rejectReady(error);
      finish(error);
    });

    server.listen(Number(redirectUrl.port), redirectUrl.hostname, () => {
      resolveReady();
    });
  });

  return { code, ready };
}

function openBrowser(url: string): boolean {
  const opener =
    platform() === "darwin"
      ? "open"
      : platform() === "win32"
        ? "cmd"
        : "xdg-open";
  const args = platform() === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(opener, args, {
    detached: true,
    stdio: "ignore",
  });

  child.unref();
  return true;
}

function tokenErrorMessage(json: TokenResponse): string {
  return (
    json.error_description ?? json.error ?? json.message ?? "unknown error"
  );
}

async function fetchTumblrToken(
  body: URLSearchParams,
  label: string,
): Promise<TokenResponse> {
  const response = await fetch("https://api.tumblr.com/v2/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const text = await response.text();
  let json: TokenResponse;

  try {
    json = JSON.parse(text) as TokenResponse;
  } catch {
    throw new Error(
      `${label} returned non-JSON response with HTTP ${response.status}.`,
    );
  }

  if (!response.ok || json.error) {
    throw new Error(
      `${label} failed with HTTP ${response.status}: ${tokenErrorMessage(json)}`,
    );
  }

  return json;
}

async function exchangeCodeForToken(
  config: CliConfig,
  code: string,
): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  scope?: string;
}> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: config.consumerKey as string,
    client_secret: config.consumerSecret as string,
    redirect_uri: config.redirectUri,
  });
  const json = await fetchTumblrToken(
    body,
    "Tumblr authorization-code exchange",
  );

  return tokenResult(json);
}

async function refreshExistingToken(
  config: CliConfig,
  refreshToken: string,
): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  scope?: string;
}> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.consumerKey as string,
    client_secret: config.consumerSecret as string,
  });
  const json = await fetchTumblrToken(body, "Tumblr refresh-token exchange");

  return tokenResult(json);
}

function tokenResult(json: TokenResponse): {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  scope?: string;
} {
  if (!json.access_token) {
    throw new Error("Tumblr token endpoint did not return access_token.");
  }

  const result: {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: string;
    scope?: string;
  } = {
    accessToken: json.access_token,
  };
  const expiresAt = expiresAtFromSeconds(json.expires_in);

  if (json.refresh_token) {
    result.refreshToken = json.refresh_token;
  }

  if (expiresAt) {
    result.expiresAt = expiresAt;
  }

  if (json.scope) {
    result.scope = json.scope;
  }

  return result;
}

function expiresAtFromSeconds(
  expiresIn: number | undefined,
): string | undefined {
  if (!Number.isFinite(expiresIn)) {
    return undefined;
  }

  return new Date(Date.now() + (expiresIn as number) * 1000).toISOString();
}

async function getBlogIdentifier(
  accessToken: string,
  explicitBlogIdentifier: string | undefined,
): Promise<string> {
  if (explicitBlogIdentifier) {
    return explicitBlogIdentifier;
  }

  const response = await fetch("https://api.tumblr.com/v2/user/info", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Could not determine Tumblr blog identifier from /user/info; pass --blog-identifier explicitly. HTTP ${response.status}.`,
    );
  }

  const json = JSON.parse(text) as TumblrUserInfoResponse;
  const blogs = json.response?.user?.blogs ?? [];
  const blog = blogs.find((candidate) => candidate.primary) ?? blogs[0];
  const identifier = blog?.name ?? blog?.uuid;

  if (!identifier) {
    throw new Error(
      "Could not determine Tumblr blog identifier from /user/info; pass --blog-identifier explicitly.",
    );
  }

  return identifier;
}

async function assertPrivateDotenv(
  dotenvPath: string,
  fixPermissions: boolean,
): Promise<void> {
  try {
    const details = await stat(dotenvPath);
    const publicBits = details.mode & 0o077;

    if (publicBits === 0) {
      return;
    }

    if (!fixPermissions) {
      throw new Error(
        `${dotenvPath} is readable by group/others. Run chmod 600 ${dotenvPath} first, or rerun with --fix-permissions.`,
      );
    }

    await chmod(dotenvPath, 0o600);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return;
    }

    throw error;
  }
}

function shellQuote(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("$", "\\$").replaceAll("`", "\\`")}"`;
}

function updateDotenvContent(
  content: string,
  values: Partial<Record<string, string>>,
  envKeys: readonly string[],
): string {
  const lines = content.length > 0 ? content.split("\n") : [];
  const seen = new Set<string>();
  const updated = lines.map((line) => {
    for (const key of envKeys) {
      if (values[key] === undefined) {
        continue;
      }

      const pattern = new RegExp(`^(\\s*(?:export\\s+)?${key}\\s*=).*$`);

      if (pattern.test(line)) {
        seen.add(key);
        return line.replace(pattern, `$1${shellQuote(values[key] as string)}`);
      }
    }

    return line;
  });

  for (const key of envKeys) {
    const value = values[key];

    if (value !== undefined && !seen.has(key)) {
      updated.push(`${key}=${shellQuote(value)}`);
    }
  }

  return `${updated.join("\n").replace(/\n*$/u, "")}\n`;
}

async function writeDotenvValues(
  dotenvPath: string,
  values: Partial<Record<string, string>>,
  fixPermissions: boolean,
  envKeys: readonly string[] = ENV_KEYS,
): Promise<void> {
  const resolved = resolve(expandHomePath(dotenvPath));
  await assertPrivateDotenv(resolved, fixPermissions);
  await mkdir(dirname(resolved), { recursive: true, mode: 0o700 });

  let existing = "";

  try {
    existing = await readFile(resolved, "utf8");
  } catch (error) {
    if (
      !(
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      )
    ) {
      throw error;
    }
  }

  const next = updateDotenvContent(existing, values, envKeys);
  const tempPath = `${resolved}.${process.pid}.tmp`;
  await writeFile(tempPath, next, { encoding: "utf8", mode: 0o600 });
  await chmod(tempPath, 0o600);
  await rename(tempPath, resolved);
  await chmod(resolved, 0o600);
}

async function promptForHostedCallbackCode(
  expectedState: string,
): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    const pasted = (
      await rl.question(
        "Paste the full callback URL shown on the hosted page (or just the code): ",
      )
    ).trim();

    if (!pasted) {
      throw new Error("No callback URL or code was entered.");
    }

    if (!pasted.includes("://")) {
      // Bare code paste: no state to verify against, trust the operator.
      return pasted;
    }

    const callbackUrl = new URL(pasted);
    const error = callbackUrl.searchParams.get("error");

    if (error) {
      const description = callbackUrl.searchParams.get("error_description");
      throw new Error(
        `Tumblr returned OAuth error: ${error}${description ? ` (${description})` : ""}`,
      );
    }

    const state = callbackUrl.searchParams.get("state");

    if (state !== expectedState) {
      throw new Error("OAuth state mismatch. Refusing to continue.");
    }

    const code = callbackUrl.searchParams.get("code");

    if (!code) {
      throw new Error("The pasted callback URL did not include a code.");
    }

    return code;
  } finally {
    rl.close();
  }
}

async function createNewToken(config: CliConfig): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  scope?: string;
}> {
  const redirectUrl = parseRedirectUri(config.redirectUri);
  const hosted = !isLoopbackHost(redirectUrl.hostname);
  const state = randomBytes(24).toString("base64url");
  const authorizationUrl = buildAuthorizationUrl(config, state);
  const authorizationServer = hosted
    ? undefined
    : startAuthorizationServer(redirectUrl, state, config.timeoutMs);

  if (authorizationServer) {
    await authorizationServer.ready;
  }

  if (config.noOpen) {
    console.log("Open this Tumblr authorization URL in your browser:");
    console.log(authorizationUrl);
  } else {
    openBrowser(authorizationUrl);
    console.log("Opened Tumblr authorization in your browser.");
  }

  const code = hosted
    ? await (async () => {
        console.log(
          `After authorizing, Tumblr will redirect to ${redirectUrl.origin}${redirectUrl.pathname}. No tokens will be printed.`,
        );
        return promptForHostedCallbackCode(state);
      })()
    : await (async () => {
        console.log(
          `Waiting for callback on ${redirectUrl.origin}${redirectUrl.pathname}. No tokens will be printed.`,
        );
        return (authorizationServer as AuthorizationServer).code;
      })();
  return exchangeCodeForToken(config, code);
}

async function main(): Promise<void> {
  const config = parseArgs(process.argv.slice(2));
  const runtimeConfig = await loadRuntimeConfig(config);
  const dotenvValues = await readDotenv(config.dotenvPath);
  hydrateConfig(config, dotenvValues, runtimeConfig);
  const accessTokenKey = envNameFor(
    runtimeConfig,
    "tumblr",
    "access_token",
    "TUMBLR_ACCESS_TOKEN",
  );
  const blogIdentifierKey = envNameFor(
    runtimeConfig,
    "tumblr",
    "blog_identifier",
    "TUMBLR_BLOG_IDENTIFIER",
  );
  const consumerKeyKey = envNameFor(
    runtimeConfig,
    "tumblr",
    "consumer_key",
    "TUMBLR_CONSUMER_KEY",
  );
  const consumerSecretKey = envNameFor(
    runtimeConfig,
    "tumblr",
    "consumer_secret",
    "TUMBLR_CONSUMER_SECRET",
  );
  const refreshTokenKey = envNameFor(
    runtimeConfig,
    "tumblr",
    "refresh_token",
    "TUMBLR_REFRESH_TOKEN",
  );
  const expiresAtKey = envNameFor(
    runtimeConfig,
    "tumblr",
    "access_token_expires_at",
    "TUMBLR_ACCESS_TOKEN_EXPIRES_AT",
  );

  let token: {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: string;
    scope?: string;
  };

  if (config.refreshExisting) {
    const refreshToken =
      process.env[refreshTokenKey] ?? dotenvValues[refreshTokenKey];

    if (!refreshToken) {
      throw new Error(
        `Missing ${refreshTokenKey}. Run the browser OAuth flow without --refresh-existing first.`,
      );
    }

    token = await refreshExistingToken(config, refreshToken);
  } else {
    token = await createNewToken(config);
  }

  const blogIdentifier = await getBlogIdentifier(
    token.accessToken,
    config.blogIdentifier,
  );
  const dotenvUpdates: Partial<Record<string, string>> = {
    [accessTokenKey]: token.accessToken,
    [blogIdentifierKey]: blogIdentifier,
  };

  if (config.consumerKey) {
    dotenvUpdates[consumerKeyKey] = config.consumerKey;
  }

  if (config.consumerSecret) {
    dotenvUpdates[consumerSecretKey] = config.consumerSecret;
  }

  if (token.refreshToken) {
    dotenvUpdates[refreshTokenKey] = token.refreshToken;
  }

  if (token.expiresAt) {
    dotenvUpdates[expiresAtKey] = token.expiresAt;
  }

  const savedKeys = [
    config.consumerKey ? consumerKeyKey : undefined,
    config.consumerSecret ? consumerSecretKey : undefined,
    accessTokenKey,
    token.refreshToken ? refreshTokenKey : undefined,
    token.expiresAt ? expiresAtKey : undefined,
    blogIdentifierKey,
  ].filter((key): key is string => typeof key === "string");

  await writeDotenvValues(
    config.dotenvPath,
    dotenvUpdates,
    config.fixPermissions,
    savedKeys,
  );

  console.log(
    `Stored Tumblr OAuth values in ${resolve(expandHomePath(config.dotenvPath))}.`,
  );
  console.log(`Updated keys: ${savedKeys.join(", ")}.`);
  console.log(`Tumblr blog identifier: ${blogIdentifier}.`);

  if (token.expiresAt) {
    console.log(`Token expires at: ${token.expiresAt}.`);
  }

  if (token.scope) {
    console.log(`Granted scopes: ${token.scope}.`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});
