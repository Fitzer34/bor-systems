#!/usr/bin/env bash
# HazardLink firmware flash helper.
#
# Always sources the build secrets from the PERSISTENT .env.local so we never
# accidentally flash a board with an empty BOR_LORA_HMAC_KEY (which silently
# breaks the LoRa link — the gateway receives packets but drops them all on
# HMAC mismatch, showing "0 devices connected"). This happened once because
# the key was being read from /tmp, which the shell environment wipes.
#
# Usage:
#   ./flash.sh gateway            # build + upload gateway env
#   ./flash.sh hanger             # build + upload hanger env
#   ./flash.sh hanger /dev/cu.usbserial-0001   # explicit port
#
# Requires firmware/.env.local containing:
#   BOR_WEBHOOK_SECRET=...
#   BOR_LORA_HMAC_KEY=<64 hex chars>   (openssl rand -hex 32)

set -euo pipefail
cd "$(dirname "$0")"

ENV_FILE=".env.local"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found. Create it with BOR_WEBHOOK_SECRET + BOR_LORA_HMAC_KEY." >&2
  exit 1
fi

# Export every KEY=VALUE in .env.local into the environment for pio.
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

# Sanity-check the HMAC key is a real 64-char hex string before flashing —
# refuse to flash with a blank/short key, which is the exact footgun that
# broke the LoRa link before.
KEYLEN=${#BOR_LORA_HMAC_KEY}
if [[ "$KEYLEN" -ne 64 ]]; then
  echo "ERROR: BOR_LORA_HMAC_KEY is $KEYLEN chars, expected 64. Refusing to flash." >&2
  echo "       A wrong/empty key makes the gateway silently drop every hanger packet." >&2
  exit 1
fi

ENV_NAME="${1:?usage: ./flash.sh <gateway|hanger|hanger_wifi> [port]}"
PORT="${2:-}"

echo "Flashing env '$ENV_NAME' with HMAC key ${BOR_LORA_HMAC_KEY:0:8}… (64 chars verified)"

if [[ -n "$PORT" ]]; then
  pio run -e "$ENV_NAME" -t upload --upload-port "$PORT"
else
  pio run -e "$ENV_NAME" -t upload
fi
