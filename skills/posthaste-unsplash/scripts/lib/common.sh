#!/bin/bash
# Shared functions for all Unsplash scripts

UNSPLASH_API_BASE="${UNSPLASH_API_BASE:-https://api.unsplash.com}"

require_command() {
    local command_name="$1"

    if ! command -v "$command_name" >/dev/null 2>&1; then
        printf 'ERROR: required command not found: %s\n' "$command_name" >&2
        return 1
    fi
}

# Validate API key exists
validate_api_key() {
    if [[ -z "${UNSPLASH_ACCESS_KEY:-}" ]]; then
        printf 'ERROR: UNSPLASH_ACCESS_KEY not set\n' >&2
        printf 'Get your key from: https://unsplash.com/developers\n' >&2
        printf 'Then: export UNSPLASH_ACCESS_KEY=your_key\n' >&2
        return 1
    fi

    return 0
}

# Make API request with error handling
# Usage: api_request "endpoint" "query_params"
api_request() {
    local endpoint="$1"
    local params="$2"
    local url="${UNSPLASH_API_BASE}${endpoint}"

    [[ -n "$params" ]] && url="${url}?${params}"

    require_command curl || return 1

    local body
    local http_code
    local response

    if ! response=$(curl -sS -w "\n%{http_code}" \
        -H "Accept-Version: v1" \
        -H "Authorization: Client-ID $UNSPLASH_ACCESS_KEY" \
        --max-time 30 \
        "$url" 2>&1); then
        printf 'ERROR: API request failed before receiving an HTTP response\n' >&2
        return 1
    fi

    http_code=$(printf '%s\n' "$response" | tail -n 1)
    body=$(printf '%s\n' "$response" | sed '$d')

    case "$http_code" in
        200)
            printf '%s\n' "$body"
            ;;
        401)
            printf 'ERROR: Invalid API key\n' >&2
            return 1
            ;;
        403)
            printf 'ERROR: Rate limit exceeded (50/hour in demo mode)\n' >&2
            return 1
            ;;
        404)
            printf 'ERROR: Resource not found\n' >&2
            return 1
            ;;
        *)
            printf 'ERROR: API request failed (%s)\n' "$http_code" >&2
            return 1
            ;;
    esac
}

# Format photo JSON with attribution
# Converts raw Unsplash API response to our standardized format
format_photos() {
    require_command jq || return 1

    jq -c 'if type == "array" then . else [.] end | .[] | {
        id: .id,
        description: .description,
        alt_description: .alt_description,
        urls: .urls,
        width: .width,
        height: .height,
        color: .color,
        blur_hash: .blur_hash,
        photographer_name: .user.name,
        photographer_username: .user.username,
        photographer_url: ("https://unsplash.com/@" + .user.username + "?utm_source=claude_skill&utm_medium=referral"),
        photo_url: (.links.html + "?utm_source=claude_skill&utm_medium=referral"),
        attribution_text: ("Photo by " + .user.name + " on Unsplash"),
        attribution_html: ("Photo by <a href=\"https://unsplash.com/@" + .user.username + "?utm_source=claude_skill&utm_medium=referral\">" + .user.name + "</a> on <a href=\"https://unsplash.com/?utm_source=claude_skill&utm_medium=referral\">Unsplash</a>")
    }'
}

# Format photo JSON as a Markdown result table with hotlinked previews.
format_photos_table() {
    require_command jq || return 1

    jq -r '
        def md_text:
            if . == null or . == "" then "No description"
            else tostring | gsub("\\|"; "\\|") | gsub("[\r\n]+"; " ")
            end;
        def photo_url:
            .links.html + "?utm_source=claude_skill&utm_medium=referral";
        def photographer_url:
            "https://unsplash.com/@" + .user.username + "?utm_source=claude_skill&utm_medium=referral";
        def preview_url:
            .urls.thumb // .urls.small;

        "| Preview | Photo | Photographer | Dimensions | Description | Attribution |",
        "| --- | --- | --- | --- | --- | --- |",
        ((if type == "array" then . else [.] end)[] |
            "| [![preview](" + preview_url + ")](" + photo_url + ")" +
            " | [" + .id + "](" + photo_url + ")" +
            " | [" + (.user.name | md_text) + "](" + photographer_url + ")" +
            " | " + (.width | tostring) + " x " + (.height | tostring) +
            " | " + ((.description // .alt_description) | md_text) +
            " | Photo by [" + (.user.name | md_text) + "](" + photographer_url + ") on [Unsplash](https://unsplash.com/?utm_source=claude_skill&utm_medium=referral) |"
        )
    '
}

# Format photo JSON as stacked Markdown cards. This renders more reliably in
# chat clients that do not display images inside table cells.
format_photos_preview_list() {
    require_command jq || return 1

    jq -r '
        def md_text:
            if . == null or . == "" then "No description"
            else tostring | gsub("[\r\n]+"; " ")
            end;
        def photo_url:
            .links.html + "?utm_source=claude_skill&utm_medium=referral";
        def photographer_url:
            "https://unsplash.com/@" + .user.username + "?utm_source=claude_skill&utm_medium=referral";
        def preview_url:
            .urls.small // .urls.thumb;

        (if type == "array" then . else [.] end)[] |
            "### [" + .id + "](" + photo_url + ")\n" +
            "![Preview: " + ((.description // .alt_description) | md_text) + "](" + preview_url + ")\n" +
            "[Open preview image](" + preview_url + ")\n\n" +
            "- Photographer: [" + (.user.name | md_text) + "](" + photographer_url + ")\n" +
            "- Dimensions: " + (.width | tostring) + " x " + (.height | tostring) + "\n" +
            "- Description: " + ((.description // .alt_description) | md_text) + "\n" +
            "- Attribution: Photo by [" + (.user.name | md_text) + "](" + photographer_url + ") on [Unsplash](https://unsplash.com/?utm_source=claude_skill&utm_medium=referral)\n"
    '
}
