#!/usr/bin/env node

import { getEnvValue, printJson, readDotenv } from "./direct-api-utils.ts";

const DEFAULT_DOTENV_PATH = "~/.env";
const DEFAULT_LOGIN_URL = "https://www.patreon.com/login";

interface PatreonConfigConfig {
  dotenvPath: string;
}

function printHelp(): void {
  console.log(`
Resolve and validate the environment configuration for browser-assisted
Patreon posting. This does not open a browser or post anything; it only
reads and validates PATREON_LOGIN_URL and the optional PATREON_DASHBOARD_URL
so a Playwright-driven session knows where to start.

Patreon has no stable "new post" composer URL: clicking the Post nav button
mints a brand-new draft with a fresh URL every time, so that URL can never be
stored or reused. The only stable target is the page the Post button lives
on, which this flow clicks rather than navigates to directly.

Usage:
  node patreon-config.ts

Options:
  --dotenv <path>   Dotenv path. Default: ${DEFAULT_DOTENV_PATH}.
  --help            Show this help text.

Output:
  JSON on stdout: { network: "patreon", loginUrl, dashboardUrl }

Optional environment:
  PATREON_LOGIN_URL      Overrides the default Patreon login URL.
  PATREON_DASHBOARD_URL  A stable creator-area page to open after confirming
                          login, if the post-login landing page does not
                          already show the Post nav button. Leave unset to
                          just use whatever page login lands on.
`);
}

function requireArg(argv: string[], index: number, flag: string): string {
  const value = argv[index];

  if (!value) {
    throw new Error(`${flag} needs a value.`);
  }

  return value;
}

function parseArgs(argv: string[]): PatreonConfigConfig {
  const config: PatreonConfigConfig = { dotenvPath: DEFAULT_DOTENV_PATH };
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

      case "--dotenv":
        config.dotenvPath = nextValue(arg);
        break;

      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return config;
}

function requireHttpsUrl(value: string, label: string): string {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} is not a valid URL: ${value}`);
  }

  if (parsed.protocol !== "https:") {
    throw new Error(`${label} must be an https URL: ${value}`);
  }

  return parsed.toString();
}

async function main(): Promise<void> {
  const config = parseArgs(process.argv.slice(2));
  const dotenvValues = await readDotenv(config.dotenvPath);

  const loginUrl = requireHttpsUrl(
    getEnvValue("PATREON_LOGIN_URL", dotenvValues) ?? DEFAULT_LOGIN_URL,
    "PATREON_LOGIN_URL",
  );
  const dashboardUrlRaw = getEnvValue("PATREON_DASHBOARD_URL", dotenvValues);
  const dashboardUrl = dashboardUrlRaw
    ? requireHttpsUrl(dashboardUrlRaw, "PATREON_DASHBOARD_URL")
    : undefined;

  printJson({
    network: "patreon",
    loginUrl,
    dashboardUrl,
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});
