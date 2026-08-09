#!/usr/bin/env node

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { homedir, platform, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";

interface CliConfig {
  appId?: string;
  appSecret?: string;
  redirectUri: string;
  redirectHost: string;
  redirectPort: number;
  callbackPath: string;
  explicitRedirectUri: boolean;
  httpsKey?: string;
  httpsCert?: string;
  scope: string;
  dotenvPath: string;
  writeEnv: boolean;
  refreshExisting: boolean;
  fixPermissions: boolean;
  noOpen: boolean;
  timeoutMs: number;
}

interface TokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  user_id?: string | number;
  error?: string | { message?: string; type?: string; code?: number };
  error_message?: string;
  message?: string;
}

interface ThreadsUserResponse {
  id?: string | number;
  username?: string;
  error?: { message?: string; type?: string; code?: number };
}

interface AuthorizationServer {
  code: Promise<string>;
  ready: Promise<void>;
}

interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const DEFAULT_REDIRECT_HOST = "127.0.0.1";
const DEFAULT_REDIRECT_PORT = 8766;
const DEFAULT_CALLBACK_PATH = "/callback";
const DEFAULT_REDIRECT_URI = `https://${DEFAULT_REDIRECT_HOST}:${DEFAULT_REDIRECT_PORT}${DEFAULT_CALLBACK_PATH}`;
const DEFAULT_DOTENV_PATH = "~/.env";
const DEFAULT_SCOPE = "threads_basic,threads_content_publish";
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const ENV_KEYS = [
  "THREADS_APP_ID",
  "THREADS_APP_SECRET",
  "THREADS_CLIENT_TOKEN",
  "THREADS_ACCESS_TOKEN",
  "THREADS_USER_ID",
  "THREADS_ACCESS_TOKEN_EXPIRES_AT",
  "THREADS_USERNAME",
] as const;

function printHelp(): void {
  console.log(`
Create or refresh a long-lived Threads API access token, either via a
loopback-only local callback server or a hosted HTTPS callback page (see
auth-site/). Meta rejects loopback redirect URIs for this app, so pass
--redirect-uri pointing at the hosted callback microsite.

Usage:
  node create-threads-refresh-token.ts --write-env --redirect-uri "https://<site>.netlify.app/callback"
  node create-threads-refresh-token.ts --write-env --refresh-existing

Options:
  --app-id <id>            Threads app ID. Default: THREADS_APP_ID.
  --app-secret <secret>    Threads app secret. Default: THREADS_APP_SECRET.
  --redirect-uri <uri>     Redirect URI registered in the Threads app.
                           A non-loopback https:// URI (e.g. the hosted
                           auth-site callback) switches to the paste flow:
                           after authorizing, paste the callback URL or code
                           when prompted. Overrides --host/--port/--callback-path.
                           Default: ${DEFAULT_REDIRECT_URI}
  --host <host>            Loopback callback host (loopback flow only).
                           Default: ${DEFAULT_REDIRECT_HOST}
  --port <port>            Loopback callback port (loopback flow only).
                           Default: ${DEFAULT_REDIRECT_PORT}
  --callback-path <path>   Loopback callback path (loopback flow only).
                           Default: ${DEFAULT_CALLBACK_PATH}
  --https-key <path>       Private key for an HTTPS loopback callback server.
  --https-cert <path>      Certificate for an HTTPS loopback callback server.
                           Defaults to a temporary self-signed certificate.
  --scope <scopes>         Comma-separated Threads OAuth scopes.
                           Default: "${DEFAULT_SCOPE}"
  --dotenv <path>          Dotenv file to read and update. Default: ${DEFAULT_DOTENV_PATH}
  --refresh-existing       Refresh THREADS_ACCESS_TOKEN without opening a browser.
  --write-env              Required. Store token values in the dotenv file.
  --fix-permissions        chmod the dotenv file to 0600 before writing if needed.
  --no-open                Print the authorization URL instead of opening a browser.
  --timeout-ms <ms>        Loopback callback wait timeout. Default: ${DEFAULT_TIMEOUT_MS}
  --help                   Show this help.

Security:
  - Tokens and authorization codes are never printed to stdout/stderr; the
    hosted paste flow only echoes back what you paste in, interactively.
  - Redirect URIs must be http(s)://; hosted (non-loopback) URIs must be https.
  - HTTPS loopback is the default for the local-server flow because Threads
    blocks insecure login pages.
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

      case "--app-id":
        config.appId = nextValue(arg);
        break;

      case "--app-secret":
        config.appSecret = nextValue(arg);
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

      case "--https-key":
        config.httpsKey = nextValue(arg);
        break;

      case "--https-cert":
        config.httpsCert = nextValue(arg);
        break;

      case "--scope":
        config.scope = nextValue(arg);
        break;

      case "--dotenv":
        config.dotenvPath = nextValue(arg);
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
): void {
  const appId = process.env.THREADS_APP_ID ?? dotenvValues.THREADS_APP_ID;
  const appSecret =
    process.env.THREADS_APP_SECRET ?? dotenvValues.THREADS_APP_SECRET;

  if (!config.appId && appId) {
    config.appId = appId;
  }

  if (!config.appSecret && appSecret) {
    config.appSecret = appSecret;
  }

  if (!Number.isInteger(config.redirectPort) || config.redirectPort <= 0) {
    throw new Error("--port must be a positive integer.");
  }

  if (!config.explicitRedirectUri) {
    config.redirectUri = buildLoopbackRedirectUri(config);
  }

  if (!config.writeEnv) {
    throw new Error(
      "Refusing to request or refresh a Threads token without --write-env. Tokens are never printed, so choose explicit secure storage first.",
    );
  }

  if (!config.appId && !config.refreshExisting) {
    throw new Error("Missing --app-id or THREADS_APP_ID.");
  }

  if (!config.appSecret && !config.refreshExisting) {
    throw new Error("Missing --app-secret or THREADS_APP_SECRET.");
  }

  if (!Number.isFinite(config.timeoutMs) || config.timeoutMs <= 0) {
    throw new Error("--timeout-ms must be a positive number.");
  }
}

function normaliseCallbackPath(input: string): string {
  const trimmed = input.trim();

  if (!trimmed) {
    return DEFAULT_CALLBACK_PATH;
  }

  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function buildLoopbackRedirectUri(config: CliConfig): string {
  return `https://${config.redirectHost}:${config.redirectPort}${config.callbackPath}`;
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

function runCommand(command: string, args: string[]): Promise<CommandResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
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

async function generateSelfSignedCertificate(
  host: string,
): Promise<{ key: string; cert: string }> {
  const directory = await mkdtemp(join(tmpdir(), "posthaste-threads-oauth-"));
  const keyPath = join(directory, "key.pem");
  const certPath = join(directory, "cert.pem");
  const subjectAltName =
    host === "localhost" ? "DNS:localhost,IP:127.0.0.1" : `IP:${host}`;
  const result = await runCommand("openssl", [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    keyPath,
    "-out",
    certPath,
    "-days",
    "1",
    "-subj",
    `/CN=${host}`,
    "-addext",
    `subjectAltName=${subjectAltName}`,
  ]);

  if (result.exitCode !== 0) {
    await rm(directory, { recursive: true, force: true });
    throw new Error(
      `Failed to create a temporary HTTPS certificate with openssl.\n${result.stderr.trim()}`,
    );
  }

  const [key, cert] = await Promise.all([
    readFile(keyPath, "utf8"),
    readFile(certPath, "utf8"),
  ]);
  await rm(directory, { recursive: true, force: true });

  return { key, cert };
}

async function localServerOptions(
  config: CliConfig,
  redirectUrl: URL,
): Promise<{ key: string; cert: string } | undefined> {
  if (redirectUrl.protocol !== "https:") {
    return undefined;
  }

  if (config.httpsKey || config.httpsCert) {
    if (!config.httpsKey || !config.httpsCert) {
      throw new Error("Use --https-key and --https-cert together.");
    }

    const [key, cert] = await Promise.all([
      readFile(resolve(expandHomePath(config.httpsKey)), "utf8"),
      readFile(resolve(expandHomePath(config.httpsCert)), "utf8"),
    ]);

    return { key, cert };
  }

  return generateSelfSignedCertificate(redirectUrl.hostname);
}

function buildAuthorizationUrl(config: CliConfig, state: string): string {
  const url = new URL("https://threads.net/oauth/authorize");
  url.searchParams.set("client_id", config.appId as string);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", config.scope);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);

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

async function startAuthorizationServer(
  config: CliConfig,
  redirectUrl: URL,
  expectedState: string,
  timeoutMs: number,
): Promise<AuthorizationServer> {
  const tlsOptions = await localServerOptions(config, redirectUrl);
  let resolveReady: () => void;
  let rejectReady: (error: Error) => void;
  const ready = new Promise<void>((resolvePromise, rejectPromise) => {
    resolveReady = resolvePromise;
    rejectReady = rejectPromise;
  });
  const code = new Promise<string>((resolvePromise, rejectPromise) => {
    let settled = false;
    const timeout = setTimeout(() => {
      finish(new Error("Timed out waiting for Threads OAuth callback."));
    }, timeoutMs);
    const requestHandler = (
      request: IncomingMessage,
      response: ServerResponse,
    ) => {
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
            "Threads returned an OAuth error. You can close this tab.",
          );
          finish(new Error(`Threads returned OAuth error: ${error}`));
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
            "Threads did not include an authorization code. You can close this tab.",
          );
          finish(new Error("OAuth callback did not include a code."));
          return;
        }

        sendHtml(
          response,
          200,
          "Threads authorization received",
          "The Threads token was stored securely. You can close this tab.",
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
    };
    const server = tlsOptions
      ? createHttpsServer(tlsOptions, requestHandler)
      : createHttpServer(requestHandler);

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
  if (typeof json.error === "string") {
    return json.error;
  }

  if (json.error && typeof json.error === "object") {
    return json.error.message ?? json.error.type ?? "unknown error";
  }

  return json.error_message ?? json.message ?? "unknown error";
}

async function fetchThreadsJson(
  url: string,
  init: RequestInit,
  label: string,
): Promise<TokenResponse> {
  const response = await fetch(url, init);
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

async function exchangeCodeForShortLivedToken(
  config: CliConfig,
  code: string,
): Promise<{ accessToken: string; userId: string }> {
  const body = new URLSearchParams({
    client_id: config.appId as string,
    client_secret: config.appSecret as string,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
    code,
  });
  const json = await fetchThreadsJson(
    "https://graph.threads.net/oauth/access_token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
    "Threads short-lived token exchange",
  );

  if (!json.access_token) {
    throw new Error("Threads token exchange did not return access_token.");
  }

  if (json.user_id === undefined) {
    throw new Error("Threads token exchange did not return user_id.");
  }

  return {
    accessToken: json.access_token,
    userId: String(json.user_id),
  };
}

async function exchangeForLongLivedToken(
  config: CliConfig,
  shortLivedToken: string,
): Promise<{ accessToken: string; expiresAt?: string }> {
  const url = new URL("https://graph.threads.net/access_token");
  url.searchParams.set("grant_type", "th_exchange_token");
  url.searchParams.set("client_secret", config.appSecret as string);
  url.searchParams.set("access_token", shortLivedToken);
  const json = await fetchThreadsJson(
    url.toString(),
    { method: "GET" },
    "Threads long-lived token exchange",
  );

  if (!json.access_token) {
    throw new Error(
      "Threads long-lived token exchange did not return access_token.",
    );
  }

  const result: { accessToken: string; expiresAt?: string } = {
    accessToken: json.access_token,
  };
  const expiresAt = expiresAtFromSeconds(json.expires_in);

  if (expiresAt) {
    result.expiresAt = expiresAt;
  }

  return result;
}

async function refreshLongLivedToken(
  accessToken: string,
): Promise<{ accessToken: string; expiresAt?: string }> {
  const url = new URL("https://graph.threads.net/refresh_access_token");
  url.searchParams.set("grant_type", "th_refresh_token");
  url.searchParams.set("access_token", accessToken);
  const json = await fetchThreadsJson(
    url.toString(),
    { method: "GET" },
    "Threads long-lived token refresh",
  );

  if (!json.access_token) {
    throw new Error("Threads token refresh did not return access_token.");
  }

  const result: { accessToken: string; expiresAt?: string } = {
    accessToken: json.access_token,
  };
  const expiresAt = expiresAtFromSeconds(json.expires_in);

  if (expiresAt) {
    result.expiresAt = expiresAt;
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

async function getThreadsUser(
  accessToken: string,
): Promise<{ userId?: string; username?: string }> {
  const url = new URL("https://graph.threads.net/v1.0/me");
  url.searchParams.set("fields", "id,username");
  url.searchParams.set("access_token", accessToken);
  const response = await fetch(url);
  const text = await response.text();

  if (!response.ok) {
    return {};
  }

  try {
    const json = JSON.parse(text) as ThreadsUserResponse;
    const result: { userId?: string; username?: string } = {};

    if (json.id !== undefined) {
      result.userId = String(json.id);
    }

    if (json.username) {
      result.username = json.username;
    }

    return result;
  } catch {
    return {};
  }
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
  values: Partial<Record<(typeof ENV_KEYS)[number], string>>,
): string {
  const lines = content.length > 0 ? content.split("\n") : [];
  const seen = new Set<string>();
  const updated = lines.map((line) => {
    for (const key of ENV_KEYS) {
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

  for (const key of ENV_KEYS) {
    const value = values[key];

    if (value !== undefined && !seen.has(key)) {
      updated.push(`${key}=${shellQuote(value)}`);
    }
  }

  return `${updated.join("\n").replace(/\n*$/u, "")}\n`;
}

async function writeDotenvValues(
  dotenvPath: string,
  values: Partial<Record<(typeof ENV_KEYS)[number], string>>,
  fixPermissions: boolean,
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

  const next = updateDotenvContent(existing, values);
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
      const description =
        callbackUrl.searchParams.get("error_description") ??
        callbackUrl.searchParams.get("error_message");
      throw new Error(
        `Threads returned OAuth error: ${error}${description ? ` (${description})` : ""}`,
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

async function createNewToken(
  config: CliConfig,
): Promise<{ accessToken: string; userId: string; expiresAt?: string }> {
  const redirectUrl = parseRedirectUri(config.redirectUri);
  const hosted = !isLoopbackHost(redirectUrl.hostname);
  const state = randomBytes(24).toString("base64url");
  const authorizationUrl = buildAuthorizationUrl(config, state);
  const authorizationServer = hosted
    ? undefined
    : await startAuthorizationServer(
        config,
        redirectUrl,
        state,
        config.timeoutMs,
      );

  if (authorizationServer) {
    await authorizationServer.ready;
  }

  if (config.noOpen) {
    console.log("Open this Threads authorization URL in your browser:");
    console.log(authorizationUrl);
  } else {
    openBrowser(authorizationUrl);
    console.log("Opened Threads authorization in your browser.");
  }

  const code = hosted
    ? await (async () => {
        console.log(
          `After authorizing, Threads will redirect to ${redirectUrl.origin}${redirectUrl.pathname}. No tokens will be printed.`,
        );
        return promptForHostedCallbackCode(state);
      })()
    : await (async () => {
        console.log(
          `Waiting for callback on ${redirectUrl.origin}${redirectUrl.pathname}. No tokens will be printed.`,
        );
        return (authorizationServer as AuthorizationServer).code;
      })();
  const shortLived = await exchangeCodeForShortLivedToken(config, code);
  const longLived = await exchangeForLongLivedToken(
    config,
    shortLived.accessToken,
  );

  const result: { accessToken: string; userId: string; expiresAt?: string } = {
    accessToken: longLived.accessToken,
    userId: shortLived.userId,
  };

  if (longLived.expiresAt) {
    result.expiresAt = longLived.expiresAt;
  }

  return result;
}

async function main(): Promise<void> {
  const config = parseArgs(process.argv.slice(2));
  const dotenvValues = await readDotenv(config.dotenvPath);
  hydrateConfig(config, dotenvValues);

  const existingUserId =
    process.env.THREADS_USER_ID ?? dotenvValues.THREADS_USER_ID;
  let token: { accessToken: string; userId?: string; expiresAt?: string };

  if (config.refreshExisting) {
    const existingToken =
      process.env.THREADS_ACCESS_TOKEN ?? dotenvValues.THREADS_ACCESS_TOKEN;

    if (!existingToken) {
      throw new Error(
        "Missing THREADS_ACCESS_TOKEN. Run the browser OAuth flow without --refresh-existing first.",
      );
    }

    token = await refreshLongLivedToken(existingToken);

    if (existingUserId) {
      token.userId = existingUserId;
    }
  } else {
    token = await createNewToken(config);
  }

  const user = await getThreadsUser(token.accessToken);
  const userId = token.userId ?? user.userId ?? existingUserId;

  if (!userId) {
    throw new Error(
      "Could not determine THREADS_USER_ID from the token response or /me endpoint.",
    );
  }

  const dotenvUpdates: Partial<Record<(typeof ENV_KEYS)[number], string>> = {
    THREADS_ACCESS_TOKEN: token.accessToken,
    THREADS_USER_ID: userId,
  };

  if (config.appId) {
    dotenvUpdates.THREADS_APP_ID = config.appId;
  }

  if (config.appSecret) {
    dotenvUpdates.THREADS_APP_SECRET = config.appSecret;
  }

  if (token.expiresAt) {
    dotenvUpdates.THREADS_ACCESS_TOKEN_EXPIRES_AT = token.expiresAt;
  }

  if (user.username) {
    dotenvUpdates.THREADS_USERNAME = user.username;
  }

  await writeDotenvValues(
    config.dotenvPath,
    dotenvUpdates,
    config.fixPermissions,
  );

  const savedKeys = [
    config.appId ? "THREADS_APP_ID" : undefined,
    config.appSecret ? "THREADS_APP_SECRET" : undefined,
    "THREADS_ACCESS_TOKEN",
    "THREADS_USER_ID",
    token.expiresAt ? "THREADS_ACCESS_TOKEN_EXPIRES_AT" : undefined,
    user.username ? "THREADS_USERNAME" : undefined,
  ].filter(Boolean);

  console.log(
    `Stored Threads OAuth values in ${resolve(expandHomePath(config.dotenvPath))}.`,
  );
  console.log(`Updated keys: ${savedKeys.join(", ")}.`);
  console.log(`Threads user id: ${userId}.`);

  if (token.expiresAt) {
    console.log(`Token expires at: ${token.expiresAt}.`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});
