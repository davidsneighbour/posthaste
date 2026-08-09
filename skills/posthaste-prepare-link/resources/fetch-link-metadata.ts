#!/usr/bin/env node

interface CliConfig {
  url?: string;
  timeoutMs: number;
}

interface MetaTag {
  name: string;
  property: string;
  content: string;
}

interface LinkMetadata {
  requestedUrl: string;
  finalUrl: string;
  title: string | undefined;
  description: string | undefined;
  siteName: string | undefined;
  canonicalUrl: string;
  ogImage: string | undefined;
  tags: string[];
}

const DEFAULT_TIMEOUT_MS = 15000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; posthaste-prepare-link/1.0; +https://github.com/davidsneighbour)";

function printHelp(): void {
  console.log(`
Fetch title, description, tags, and canonical URL from a web page.

Usage:
  node fetch-link-metadata.ts --url https://example.com/post

Options:
  --url <url>            Page to fetch. Required.
  --timeout-ms <number>  Request timeout in milliseconds. Default: ${DEFAULT_TIMEOUT_MS}.
  --help                 Show this help text.

Output:
  JSON on stdout: { requestedUrl, finalUrl, title, description, siteName, canonicalUrl, ogImage, tags }
`);
}

function parseArgs(argv: string[]): CliConfig {
  const config: CliConfig = { timeoutMs: DEFAULT_TIMEOUT_MS };

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

      case "--timeout-ms":
        config.timeoutMs = Number.parseInt(argv[++index] ?? "", 10);
        break;

      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!config.url) {
    throw new Error("Missing required --url.");
  }

  if (!Number.isSafeInteger(config.timeoutMs) || config.timeoutMs <= 0) {
    throw new Error("Invalid --timeout-ms value.");
  }

  return config;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchAttr(tag: string, attr: string): string | undefined {
  const pattern = new RegExp(`${attr}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i");
  const match = pattern.exec(tag);
  return match?.[2] ?? match?.[3];
}

function extractMetaTags(html: string): MetaTag[] {
  const tags: MetaTag[] = [];
  const metaPattern = /<meta\b[^>]*>/gi;
  let match: RegExpExecArray | null = metaPattern.exec(html);

  while (match !== null) {
    const tag = match[0];
    const content = matchAttr(tag, "content");

    if (content !== undefined) {
      tags.push({
        name: (matchAttr(tag, "name") ?? "").toLowerCase(),
        property: (matchAttr(tag, "property") ?? "").toLowerCase(),
        content: decodeHtmlEntities(content),
      });
    }

    match = metaPattern.exec(html);
  }

  return tags;
}

function extractTitle(html: string): string | undefined {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = match?.[1];
  return title ? decodeHtmlEntities(title) : undefined;
}

function extractCanonical(html: string): string | undefined {
  const linkPattern = /<link\b[^>]*>/gi;
  let match: RegExpExecArray | null = linkPattern.exec(html);

  while (match !== null) {
    const tag = match[0];
    const rel = (matchAttr(tag, "rel") ?? "").toLowerCase();

    if (rel === "canonical") {
      return matchAttr(tag, "href");
    }

    match = linkPattern.exec(html);
  }

  return undefined;
}

function firstMeta(metas: MetaTag[], keys: string[]): string | undefined {
  for (const key of keys) {
    const found = metas.find(
      (meta) => meta.name === key || meta.property === key,
    );

    if (found) {
      return found.content;
    }
  }

  return undefined;
}

function collectTags(metas: MetaTag[]): string[] {
  const tags = new Set<string>();
  const keywords = firstMeta(metas, ["keywords"]);

  if (keywords) {
    for (const item of keywords.split(",")) {
      const trimmed = item.trim();

      if (trimmed.length > 0) {
        tags.add(trimmed);
      }
    }
  }

  for (const meta of metas) {
    if (meta.property === "article:tag" && meta.content.trim().length > 0) {
      tags.add(meta.content.trim());
    }
  }

  return [...tags];
}

async function main(): Promise<void> {
  const config = parseArgs(process.argv.slice(2));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(config.url as string, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Request failed: ${response.status} ${response.statusText}`,
      );
    }

    const html = await response.text();
    const metas = extractMetaTags(html);
    const finalUrl =
      response.url.length > 0 ? response.url : (config.url as string);

    const result: LinkMetadata = {
      requestedUrl: config.url as string,
      finalUrl,
      title: firstMeta(metas, ["og:title"]) ?? extractTitle(html),
      description: firstMeta(metas, ["og:description", "description"]),
      siteName: firstMeta(metas, ["og:site_name"]),
      canonicalUrl: extractCanonical(html) ?? finalUrl,
      ogImage: firstMeta(metas, ["og:image"]),
      tags: collectTags(metas),
    };

    console.log(JSON.stringify(result, null, 2));
  } finally {
    clearTimeout(timeout);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});
