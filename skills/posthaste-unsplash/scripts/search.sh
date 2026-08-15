#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=skills/posthaste-unsplash/scripts/lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

# Usage: search.sh query [page] [per_page] [order_by] [orientation] [color] [--json|--table|--preview-list]
output_format="json"
args=()

for arg in "$@"; do
    case "$arg" in
        --json)
            output_format="json"
            ;;
        --table)
            output_format="table"
            ;;
        --preview-list)
            output_format="preview-list"
            ;;
        *)
            args+=("$arg")
            ;;
    esac
done

query="${args[0]:-}"
page="${args[1]:-1}"
per_page="${args[2]:-10}"
order_by="${args[3]:-relevant}"
orientation="${args[4]:-}"
color="${args[5]:-}"

if [ -z "$query" ]; then
    printf 'ERROR: query required\n' >&2
    printf 'Usage: search.sh query [page] [per_page] [order_by] [orientation] [color] [--json|--table|--preview-list]\n' >&2
    exit 1
fi

validate_api_key || exit 1
require_command jq || exit 1

# Build query params
params="query=$(printf '%s' "$query" | jq -sRr @uri)&page=$page&per_page=$per_page&order_by=$order_by&content_filter=low"
[ -n "$orientation" ] && params="$params&orientation=$orientation"
[ -n "$color" ] && params="$params&color=$color"

# Make API request
response=$(api_request "/search/photos" "$params") || exit 1

# Extract and format results
results=$(printf '%s\n' "$response" | jq -r '.results')

case "$output_format" in
    json)
        printf '%s\n' "$results" | format_photos
        ;;
    table)
        printf '%s\n' "$results" | format_photos_table
        ;;
    preview-list)
        printf '%s\n' "$results" | format_photos_preview_list
        ;;
    *)
        printf 'ERROR: unsupported output format: %s\n' "$output_format" >&2
        exit 1
        ;;
esac
