#!/usr/bin/env node

import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

interface CliConfig {
  url?: string;
  output?: string;
  width: number;
  height: number;
  fullPage: boolean;
  waitMs: number;
}

interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 800;
const DEFAULT_WAIT_MS = 1500;

function printHelp(): void {
  console.log(`
Capture a screenshot of a web page using Playwright.

Usage:
  node screenshot-site.ts --url https://example.com --output ./shot.png

Options:
  --url <url>          Page to capture. Required.
  --output <path>      PNG output path. Required.
  --width <number>     Viewport width. Default: ${DEFAULT_WIDTH}.
  --height <number>    Viewport height. Default: ${DEFAULT_HEIGHT}.
  --full-page          Capture the full scrollable page instead of one viewport.
  --wait-ms <number>   Extra time to wait after load, in milliseconds. Default: ${DEFAULT_WAIT_MS}.
  --help                Show this help text.

Notes:
  - Uses npx --yes playwright screenshot under the hood. No local dependency is required.
`);
}

function parseArgs(argv: string[]): CliConfig {
  const config: CliConfig = {
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    fullPage: false,
    waitMs: DEFAULT_WAIT_MS,
  };

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

      case "--output":
        config.output = argv[++index];
        break;

      case "--width":
        config.width = Number.parseInt(argv[++index] ?? "", 10);
        break;

      case "--height":
        config.height = Number.parseInt(argv[++index] ?? "", 10);
        break;

      case "--full-page":
        config.fullPage = true;
        break;

      case "--wait-ms":
        config.waitMs = Number.parseInt(argv[++index] ?? "", 10);
        break;

      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!config.url) {
    throw new Error("Missing required --url.");
  }

  if (!config.output) {
    throw new Error("Missing required --output.");
  }

  if (!Number.isSafeInteger(config.width) || config.width <= 0) {
    throw new Error("Invalid --width value.");
  }

  if (!Number.isSafeInteger(config.height) || config.height <= 0) {
    throw new Error("Invalid --height value.");
  }

  if (!Number.isSafeInteger(config.waitMs) || config.waitMs < 0) {
    throw new Error("Invalid --wait-ms value.");
  }

  return config;
}

function runCommand(command: string, args: string[]): Promise<CommandResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
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
      resolvePromise({ exitCode: exitCode ?? 1, stdout, stderr });
    });
  });
}

async function main(): Promise<void> {
  const config = parseArgs(process.argv.slice(2));
  const outputPath = resolve(config.output as string);
  await mkdir(dirname(outputPath), { recursive: true });

  const args = [
    "--yes",
    "playwright",
    "screenshot",
    `--viewport-size=${config.width},${config.height}`,
    `--wait-for-timeout=${config.waitMs}`,
  ];

  if (config.fullPage) {
    args.push("--full-page");
  }

  args.push(config.url as string, outputPath);

  const result = await runCommand("npx", args);
  const combinedOutput = [result.stdout, result.stderr]
    .filter(Boolean)
    .join("\n")
    .trim();

  if (result.exitCode !== 0) {
    throw new Error(
      `Screenshot capture failed with exit code ${result.exitCode}.\n${combinedOutput}`,
    );
  }

  await access(outputPath, fsConstants.R_OK).catch(() => {
    throw new Error(
      `Screenshot was not created at: ${outputPath}\n${combinedOutput}`,
    );
  });

  const stats = await stat(outputPath);

  if (stats.size === 0) {
    throw new Error(`Screenshot file was created but is empty: ${outputPath}`);
  }

  console.log(`Screenshot saved: ${outputPath}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});
