import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { loadPosthasteConfig, type PosthasteConfigDefaults } from "./config.ts";

const DEFAULTS: PosthasteConfigDefaults = {
  posting: {
    defaultNetworks: ["mastodon", "bluesky"],
  },
  paths: {
    dotenv: "~/.env",
    postedLog: "~/.local/share/posthaste-prepare-link/posted.jsonl",
  },
  networks: {
    mastodon: {
      enabled: true,
      env: {
        access_token: "MASTODON_ACCESS_TOKEN",
        host: "MASTODON_HOST",
      },
    },
    bluesky: {
      enabled: true,
      env: {
        password: "BLUESKY_PASSWORD",
      },
    },
    reddit: {
      enabled: true,
      env: {
        access_token: "REDDIT_ACCESS_TOKEN",
        subreddit: "REDDIT_SUBREDDIT",
      },
    },
  },
};

const KNOWN_NETWORKS = ["mastodon", "bluesky", "reddit"] as const;

async function tempConfigPaths(): Promise<{
  cwd: string;
  globalConfigPath: string;
  projectConfigPath: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "posthaste-config-test-"));
  const cwd = join(root, "project");
  await mkdir(cwd, { recursive: true });

  return {
    cwd,
    globalConfigPath: join(root, "home", ".config", "posthaste", "config.toml"),
    projectConfigPath: join(cwd, ".posthaste.toml"),
  };
}

async function writeToml(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

async function loadWithTempConfig(globalToml?: string, projectToml?: string) {
  const paths = await tempConfigPaths();

  if (globalToml) {
    await writeToml(paths.globalConfigPath, globalToml);
  }

  if (projectToml) {
    await writeToml(paths.projectConfigPath, projectToml);
  }

  return loadPosthasteConfig({
    ...paths,
    defaults: DEFAULTS,
    knownNetworks: KNOWN_NETWORKS,
  });
}

test("no config files uses built-in defaults", async () => {
  const config = await loadWithTempConfig();

  assert.deepEqual(config.posting.defaultNetworks, ["mastodon", "bluesky"]);
  assert.equal(config.paths.dotenv, "~/.env");
  assert.equal(config.sources.globalConfigPresent, false);
  assert.equal(config.sources.projectConfigPresent, false);
});

test("global config overrides defaults", async () => {
  const config = await loadWithTempConfig(`
[posting]
default_networks = ["reddit"]
`);

  assert.deepEqual(config.posting.defaultNetworks, ["reddit"]);
  assert.equal(config.provenance["posting.default_networks"], "global");
});

test("project config overrides global config", async () => {
  const config = await loadWithTempConfig(
    `
[paths]
dotenv = "~/.global.env"
`,
    `
[paths]
dotenv = "~/.project.env"
`,
  );

  assert.equal(config.paths.dotenv, "~/.project.env");
  assert.equal(config.provenance["paths.dotenv"], "project");
});

test("nested config tables merge recursively", async () => {
  const config = await loadWithTempConfig(`
[networks.reddit.env]
access_token = "POSTHASTE_REDDIT_TOKEN"
`);

  assert.ok(config.networks.reddit);
  assert.equal(
    config.networks.reddit.env.access_token,
    "POSTHASTE_REDDIT_TOKEN",
  );
  assert.equal(config.networks.reddit.env.subreddit, "REDDIT_SUBREDDIT");
});

test("arrays replace rather than concatenate", async () => {
  const config = await loadWithTempConfig(`
[posting]
default_networks = ["reddit"]
`);

  assert.deepEqual(config.posting.defaultNetworks, ["reddit"]);
});

test("custom environment variable names are resolved", async () => {
  const config = await loadWithTempConfig(`
[networks.mastodon.env]
access_token = "POSTHASTE_MASTODON_TOKEN"
`);

  assert.ok(config.networks.mastodon);
  assert.equal(
    config.networks.mastodon.env.access_token,
    "POSTHASTE_MASTODON_TOKEN",
  );
});

test("malformed TOML includes the file path", async () => {
  const paths = await tempConfigPaths();
  await writeToml(paths.globalConfigPath, "[posting");

  await assert.rejects(
    loadPosthasteConfig({
      ...paths,
      defaults: DEFAULTS,
      knownNetworks: KNOWN_NETWORKS,
    }),
    new RegExp(`Malformed Posthaste! TOML config at ${paths.globalConfigPath}`),
  );
});

test("invalid network is rejected", async () => {
  await assert.rejects(
    loadWithTempConfig(`
[posting]
default_networks = ["made-up-network"]
`),
    /posting\.default_networks: unknown network made-up-network/u,
  );
});

test("invalid value types are rejected", async () => {
  await assert.rejects(
    loadWithTempConfig(`
[networks.reddit]
enabled = "yes"
`),
    /networks\.reddit\.enabled: expected a boolean/u,
  );
});

test("CLI network selection overrides configured defaults", async () => {
  const paths = await tempConfigPaths();
  await writeToml(
    paths.globalConfigPath,
    `
[posting]
default_networks = ["mastodon"]
`,
  );
  const config = await loadPosthasteConfig({
    ...paths,
    defaults: DEFAULTS,
    cli: {
      posting: {
        defaultNetworks: ["reddit"],
      },
    },
    knownNetworks: KNOWN_NETWORKS,
  });

  assert.deepEqual(config.posting.defaultNetworks, ["reddit"]);
  assert.equal(config.provenance["posting.default_networks"], "cli");
});

test("disabled default networks are rejected", async () => {
  await assert.rejects(
    loadWithTempConfig(`
[posting]
default_networks = ["reddit"]

[networks.reddit]
enabled = false
`),
    /default_networks includes disabled network reddit/u,
  );
});

test("diagnostic data does not include secret environment values", async () => {
  process.env.POSTHASTE_MASTODON_TOKEN = "super-secret-token-value";
  const config = await loadWithTempConfig(`
[networks.mastodon.env]
access_token = "POSTHASTE_MASTODON_TOKEN"
`);
  const diagnostic = JSON.stringify({
    env: config.networks.mastodon?.env,
    sources: config.sources,
    provenance: config.provenance,
  });

  assert.match(diagnostic, /POSTHASTE_MASTODON_TOKEN/u);
  assert.doesNotMatch(diagnostic, /super-secret-token-value/u);
  delete process.env.POSTHASTE_MASTODON_TOKEN;
});
