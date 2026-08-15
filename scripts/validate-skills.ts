#!/usr/bin/env node
// Checks each skill against the Agent Skills spec <https://agentskills.io/specification>
// and against the skills.sh manifest:
//
//   - SKILL.md exists and its front matter parses
//   - `name` is 1-64 chars, kebab-case, and matches its directory
//   - `description` is present and at most 1024 chars
//   - skills/ and skills.sh.json entries are 1:1

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MANIFEST = "skills.sh.json";

const NAME_MAX = 64;
const DESCRIPTION_MAX = 1024;
// Lowercase alphanumerics in hyphen-separated groups: no leading, trailing or
// doubled hyphen, which is every rule the spec puts on `name` bar its length.
const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

type Frontmatter = {
  description?: string;
  name?: string;
};

type SkillsManifest = {
  groupings?: Array<{
    skills?: unknown;
    title?: unknown;
  }>;
};

const errors: string[] = [];
const fail = (where: string, message: string): void => {
  errors.push(`${where}: ${message}`);
};

// Enough YAML for two quoted-or-plain scalars, which saves a dependency.
const frontmatterOf = (source: string): Frontmatter | null => {
  const match = /^---\n(.*?)\n---(?:\n|$)/s.exec(source);
  if (!match) return null;

  const body = match[1];
  if (body === undefined) return null;

  const fields: Record<string, string> = {};
  for (const line of body.split("\n")) {
    const field = /^([A-Za-z][\w-]*):[ \t]*(.*)$/.exec(line);
    if (!field) continue;
    const key = field[1];
    const rawValue = field[2];
    if (key === undefined || rawValue === undefined) continue;
    const value = rawValue.trim();
    const quoted = /^'(.*)'$|^"(.*)"$/s.exec(value);
    fields[key] = quoted ? (quoted[1] ?? quoted[2] ?? "") : value;
  }
  return fields;
};

const unique = <Value>(values: Value[]): Value[] => [...new Set(values)];

const readJson = <Value>(path: string): Value | null => {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Value;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(path, `unreadable or invalid JSON: ${message}`);
    return null;
  }
};

const slugs = readdirSync("skills", { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
  .map((entry) => entry.name)
  .sort();

for (const slug of slugs) {
  const path = join("skills", slug, "SKILL.md");
  if (!existsSync(path)) {
    fail(path, "missing SKILL.md");
    continue;
  }

  const frontmatter = frontmatterOf(readFileSync(path, "utf8"));
  if (!frontmatter) {
    fail(path, "missing YAML front matter (--- name / description ---)");
    continue;
  }

  const { name = "", description = "" } = frontmatter;

  if (name !== slug) {
    fail(path, `\`name: ${name}\` must match its directory (${slug})`);
  } else if (!NAME_PATTERN.test(name)) {
    fail(
      path,
      `\`name: ${name}\` must be lowercase a–z, 0–9 and single hyphens, ` +
        "not leading, trailing or doubled",
    );
  } else if (name.length > NAME_MAX) {
    fail(path, `\`name\` is ${name.length} characters (max ${NAME_MAX})`);
  }

  // An agent reads the description to decide whether the skill is relevant, so
  // without one the skill never fires.
  if (!description) {
    fail(path, "front matter is missing `description`");
  } else if (description.length > DESCRIPTION_MAX) {
    fail(
      path,
      `\`description\` is ${description.length} characters (max ${DESCRIPTION_MAX})`,
    );
  }
}

const manifest = readJson<SkillsManifest>(MANIFEST);

if (manifest) {
  const groupings = Array.isArray(manifest.groupings) ? manifest.groupings : [];
  const listed = groupings.flatMap((grouping, index) => {
    if (!Array.isArray(grouping.skills)) {
      fail(`${MANIFEST} groupings[${index}]`, "`skills` must be an array");
      return [];
    }

    return grouping.skills.flatMap((skill) => {
      if (typeof skill === "string") return skill;
      fail(
        `${MANIFEST} groupings[${index}]`,
        "`skills` entries must be strings",
      );
      return [];
    });
  });

  // A skill with no manifest entry cannot be installed through the repo manifest,
  // and a stale manifest entry points users at a skill that is not present.
  for (const slug of slugs)
    if (!listed.includes(slug))
      fail(MANIFEST, `skills/${slug} has no manifest entry`);
  for (const name of listed)
    if (!slugs.includes(name))
      fail(MANIFEST, `entry \`${name}\` has no skills/${name}`);
  for (const name of unique(listed))
    if (listed.filter((entry) => entry === name).length > 1)
      fail(MANIFEST, `entry \`${name}\` is listed more than once`);
}

if (errors.length > 0) {
  console.error(`✗ ${errors.length} problem(s):\n`);
  for (const error of errors) console.error(`  ${error}`);
  process.exit(1);
}

console.log(`✓ ${slugs.length} skill(s) valid: ${slugs.join(", ")}`);
