---
id: posthaste-post-retrieve-hashtags
name: posthaste-post-retrieve-hashtags
title: Posthaste! Hashtag Retrieval
description: Generate topical hashtags for a URL or supplied text block. Use when Posthaste! needs hashtag candidates for social posts, when the user asks for hashtags for a link or passage, or when posthaste-prepare-link needs source-specific hashtag suggestions.
---

Generate hashtags that accurately describe the subject matter of a URL or supplied content block.

## Inputs

The caller may provide:

* `source`: A publicly accessible URL or a block of text.
* `count`: The exact number of hashtags to return.

If `count` is omitted, return 10 hashtags.

## Content analysis

1. Determine whether `source` is:

   * A URL that must be loaded and analysed.
   * A content block that can be analysed directly.

2. Read enough of the source to understand:

   * The primary topic.
   * Important secondary topics.
   * Relevant technologies, products, projects, organisations, methods, or concepts.
   * The intended domain or specialist field.

3. Treat every source as an independent resource.

4. Do not infer topical connections from:

   * Previously analysed sources.
   * The domain name alone.
   * The URL path alone.
   * The content format.
   * Prior conversation context that is not explicitly part of the supplied source.

## Hashtag selection

Return exactly `count` hashtags.

Choose hashtags based on what the source is substantively about, not how the content is published.

For example:

* Prefer `#systemadministration`, `#linux`, and `#serversecurity` for an article about securing Linux servers.
* Do not use `#article`, `#blogpost`, or `#website` merely because the source is an article or webpage.
* Prefer `#typescript`, `#staticanalysis`, and `#developerTools` for a GitHub repository implementing a TypeScript static-analysis tool.
* Do not use `#github`, `#repository`, or `#opensource` unless GitHub, repository management, or open-source development is itself an important topic of the content.

Prioritise:

1. The primary subject.
2. Important specialist concepts.
3. Relevant technologies or platforms.
4. Domain-specific terminology.
5. Named projects, products, standards, or organisations.
6. Important secondary topics.

Avoid:

* Content-format tags such as `#article`, `#blog`, `#blogpost`, `#tutorial`, `#documentation`, or `#video`, unless the content specifically discusses those formats.
* Hosting-platform tags such as `#github`, `#youtube`, or `#medium`, unless the platform is central to the topic.
* Generic promotional tags such as `#interesting`, `#useful`, `#innovation`, `#technology`, or `#trending` when more specific tags are available.
* Tags based only on the page title, URL, domain, visual style, or publication format.
* Near-duplicates, singular/plural duplicates, and redundant variations.
* Hashtags that are only weakly related to the source.

When more candidate hashtags are available than requested, select the most specific and important ones rather than returning broad filler tags.

## Formatting

* Include the leading `#`.
* Use lowercase unless established spelling, branding, or readability strongly favours camel case.
* Use readable multi-word hashtags without spaces or punctuation.
* Prefer established hashtag spelling where one exists.
* Return a comma-separated list.
* Return exactly the requested number of unique hashtags.
* Return only the hashtags.
* Do not include explanations, headings, bullets, confidence scores, or additional text.

Example output:

`#systemadministration, #linux, #serversecurity, #ssh, #devops`

## Inaccessible URL handling

Do not generate hashtags when the supplied URL cannot be accessed or its meaningful content cannot be read.

Do not guess from:

* The URL.
* The domain.
* The page title alone.
* Search-result snippets.
* Previous context.

Instead, return a concise error in this format:

`ERROR: <reason>. REQUIRED: <action needed to provide readable content>.`

Examples:

`ERROR: The page requires authentication. REQUIRED: Provide the relevant text or an accessible public URL.`

`ERROR: The page returned HTTP 404. REQUIRED: Provide a working URL or paste the content.`

`ERROR: The page contains no readable content without client-side execution. REQUIRED: Paste the relevant content or provide an accessible copy.`

Possible reasons include:

* Authentication required.
* Paywall.
* HTTP 403 or 404.
* Robots restriction.
* Network failure.
* JavaScript-only content with no readable page data.
* Empty or missing page content.
* Unsupported file or media format.
