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

interface CliConfig {
  clientId?: string;
  clientSecret?: string;
  redirectUri: string;
  redirectHost: string;
  redirectPort: number;
  callbackPath: string;
  explicitRedirectUri: boolean;
  scope: string;
  dotenvPath: string;
  userAgent?: string;
  subreddit?: string;
  writeEnv: boolean;
  fixPermissions: boolean;
  noOpen: boolean;
  timeoutMs: number;
}

interface TokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  refresh_token?: string;
  error?: string;
  message?: string;
}

interface AuthorizationServer {
  code: Promise<string>;
  ready: Promise<void>;
}

const DEFAULT_REDIRECT_HOST = "127.0.0.1";
const DEFAULT_REDIRECT_PORT = 8765;
const DEFAULT_CALLBACK_PATH = "/callback";
const DEFAULT_REDIRECT_URI = `http://${DEFAULT_REDIRECT_HOST}:${DEFAULT_REDIRECT_PORT}${DEFAULT_CALLBACK_PATH}`;
const DEFAULT_DOTENV_PATH = "~/.env";
const DEFAULT_SCOPE = "identity submit";
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const ENV_KEYS = [
  "REDDIT_CLIENT_ID",
  "REDDIT_CLIENT_SECRET",
  "REDDIT_REFRESH_TOKEN",
  "REDDIT_USER_AGENT",
  "REDDIT_SUBREDDIT",
] as const;

function printHelp(): void {
  console.log(`
Create a Reddit OAuth refresh token using a loopback-only local callback server.

Usage:
  node create-reddit-refresh-token.ts --write-env --user-agent "app/1.0 by u/name" --subreddit example

Options:
  --client-id <id>           Reddit app client ID. Default: REDDIT_CLIENT_ID.
  --client-secret <secret>   Reddit app client secret. Default: REDDIT_CLIENT_SECRET.
  --host <host>              Loopback callback host. Default: ${DEFAULT_REDIRECT_HOST}
  --port <port>              Loopback callback port. Default: ${DEFAULT_REDIRECT_PORT}
  --callback-path <path>     Loopback callback path. Default: ${DEFAULT_CALLBACK_PATH}
  --redirect-uri <uri>       Loopback redirect URI registered on Reddit.
                             Overrides --host/--port/--callback-path.
                             Default: ${DEFAULT_REDIRECT_URI}
  --scope <scopes>           Space-separated Reddit OAuth scopes.
                             Default: "${DEFAULT_SCOPE}"
  --dotenv <path>            Dotenv file to update. Default: ${DEFAULT_DOTENV_PATH}
  --user-agent <value>       Reddit API user agent. Default: REDDIT_USER_AGENT.
  --subreddit <name>         Optional subreddit name to store as REDDIT_SUBREDDIT.
  --write-env                Required. Store the refresh token in the dotenv file.
  --fix-permissions          chmod the dotenv file to 0600 before writing if needed.
  --no-open                  Print the authorization URL instead of opening a browser.
  --timeout-ms <ms>          Callback wait timeout. Default: ${DEFAULT_TIMEOUT_MS}
  --help                     Show this help.

Security:
  - The refresh token is never printed to stdout/stderr.
  - Only loopback redirect hosts are accepted.
  - The OAuth state parameter is generated per run and verified on callback.
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
    fixPermissions: false,
    noOpen: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;

      case "--client-id":
        config.clientId = argv[++index];
        break;

      case "--client-secret":
        config.clientSecret = argv[++index];
        break;

      case "--host":
        config.redirectHost = argv[++index] ?? DEFAULT_REDIRECT_HOST;
        break;

      case "--port":
        config.redirectPort = Number(argv[++index] ?? DEFAULT_REDIRECT_PORT);
        break;

      case "--callback-path":
        config.callbackPath = normaliseCallbackPath(
          argv[++index] ?? DEFAULT_CALLBACK_PATH,
        );
        break;

      case "--redirect-uri":
        config.redirectUri = argv[++index] ?? DEFAULT_REDIRECT_URI;
        config.explicitRedirectUri = true;
        break;

      case "--scope":
        config.scope = argv[++index] ?? DEFAULT_SCOPE;
        break;

      case "--dotenv":
        config.dotenvPath = argv[++index] ?? DEFAULT_DOTENV_PATH;
        break;

      case "--user-agent":
        config.userAgent = argv[++index];
        break;

      case "--subreddit":
        config.subreddit = argv[++index];
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
        config.timeoutMs = Number(argv[++index] ?? DEFAULT_TIMEOUT_MS);
        break;

      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  config.clientId ??= process.env.REDDIT_CLIENT_ID;
  config.clientSecret ??= process.env.REDDIT_CLIENT_SECRET;
  config.userAgent ??= process.env.REDDIT_USER_AGENT;
  config.subreddit ??= process.env.REDDIT_SUBREDDIT;

  if (!Number.isInteger(config.redirectPort) || config.redirectPort <= 0) {
    throw new Error("--port must be a positive integer.");
  }

  if (!config.explicitRedirectUri) {
    config.redirectUri = buildLoopbackRedirectUri(config);
  }

  if (!config.writeEnv) {
    throw new Error(
      "Refusing to request a refresh token without --write-env. Tokens are never printed, so choose explicit secure storage first.",
    );
  }

  if (!config.clientId) {
    throw new Error("Missing --client-id or REDDIT_CLIENT_ID.");
  }

  if (!config.clientSecret) {
    throw new Error("Missing --client-secret or REDDIT_CLIENT_SECRET.");
  }

  if (!config.userAgent) {
    throw new Error(
      "Missing --user-agent or REDDIT_USER_AGENT. Use a descriptive value such as posthaste-prepare-link/1.0 by u/yourname.",
    );
  }

  if (!Number.isFinite(config.timeoutMs) || config.timeoutMs <= 0) {
    throw new Error("--timeout-ms must be a positive number.");
  }

  return config;
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

function assertLoopbackRedirect(redirectUri: string): URL {
  const url = new URL(redirectUri);
  const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

  if (url.protocol !== "http:") {
    throw new Error("Redirect URI must use http:// for local loopback OAuth.");
  }

  if (!loopbackHosts.has(url.hostname)) {
    throw new Error(
      "Redirect URI must use a loopback host: 127.0.0.1, localhost, or ::1.",
    );
  }

  if (!url.port) {
    throw new Error("Redirect URI must include an explicit local port.");
  }

  return url;
}

function buildAuthorizationUrl(config: CliConfig, state: string): string {
  const url = new URL("https://www.reddit.com/api/v1/authorize");
  url.searchParams.set("client_id", config.clientId as string);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("duration", "permanent");
  url.searchParams.set("scope", config.scope);

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
      finish(new Error("Timed out waiting for Reddit OAuth callback."));
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
              "Reddit returned an OAuth error. You can close this tab.",
            );
            finish(new Error(`Reddit returned OAuth error: ${error}`));
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
              "Reddit did not include an authorization code. You can close this tab.",
            );
            finish(new Error("OAuth callback did not include a code."));
            return;
          }

          sendHtml(
            response,
            200,
            "Reddit authorization received",
            "The refresh token was stored securely. You can close this tab.",
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

async function exchangeCodeForRefreshToken(
  config: CliConfig,
  code: string,
): Promise<{ refreshToken: string; scope?: string }> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
  });
  const response = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": config.userAgent as string,
    },
    body,
  });
  const text = await response.text();
  let json: TokenResponse;

  try {
    json = JSON.parse(text) as TokenResponse;
  } catch {
    throw new Error(
      `Reddit token endpoint returned non-JSON response with HTTP ${response.status}.`,
    );
  }

  if (!response.ok || json.error) {
    throw new Error(
      `Reddit token exchange failed with HTTP ${response.status}: ${json.error ?? json.message ?? "unknown error"}`,
    );
  }

  if (!json.refresh_token) {
    throw new Error(
      "Reddit did not return a refresh token. Confirm duration=permanent was accepted and the app type supports this flow.",
    );
  }

  return {
    refreshToken: json.refresh_token,
    scope: json.scope,
  };
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

async function main(): Promise<void> {
  const config = parseArgs(process.argv.slice(2));
  const redirectUrl = assertLoopbackRedirect(config.redirectUri);
  const state = randomBytes(24).toString("base64url");
  const authorizationUrl = buildAuthorizationUrl(config, state);
  const authorizationServer = startAuthorizationServer(
    redirectUrl,
    state,
    config.timeoutMs,
  );

  await authorizationServer.ready;

  if (config.noOpen) {
    console.log("Open this Reddit authorization URL in your browser:");
    console.log(authorizationUrl);
  } else {
    openBrowser(authorizationUrl);
    console.log("Opened Reddit authorization in your browser.");
  }

  console.log(
    `Waiting for callback on ${redirectUrl.origin}${redirectUrl.pathname}. No tokens will be printed.`,
  );

  const code = await authorizationServer.code;
  const token = await exchangeCodeForRefreshToken(config, code);
  await writeDotenvValues(
    config.dotenvPath,
    {
      REDDIT_CLIENT_ID: config.clientId,
      REDDIT_CLIENT_SECRET: config.clientSecret,
      REDDIT_REFRESH_TOKEN: token.refreshToken,
      REDDIT_USER_AGENT: config.userAgent,
      REDDIT_SUBREDDIT: config.subreddit,
    },
    config.fixPermissions,
  );

  const savedKeys = [
    "REDDIT_CLIENT_ID",
    "REDDIT_CLIENT_SECRET",
    "REDDIT_REFRESH_TOKEN",
    "REDDIT_USER_AGENT",
    config.subreddit ? "REDDIT_SUBREDDIT" : undefined,
  ].filter(Boolean);

  console.log(
    `Stored Reddit OAuth values in ${resolve(expandHomePath(config.dotenvPath))}.`,
  );
  console.log(`Updated keys: ${savedKeys.join(", ")}.`);

  if (token.scope) {
    console.log(`Granted scopes: ${token.scope}.`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});
