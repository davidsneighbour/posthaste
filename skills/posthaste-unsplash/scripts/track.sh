#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=skills/posthaste-unsplash/scripts/lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

# Usage: track.sh photo_id
photo_id="${1:-}"

if [ -z "$photo_id" ]; then
    printf 'ERROR: photo_id required\n' >&2
    printf 'Usage: track.sh photo_id\n' >&2
    exit 1
fi

validate_api_key || exit 1
require_command jq || exit 1

# Make API request
response=$(api_request "/photos/$photo_id/download" "") || exit 1

# Extract download URL
printf '%s\n' "$response" | jq -r '.url'
