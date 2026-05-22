#!/usr/bin/env bash
# HazardLink — factory QC script
#
# Validates each assembled hanger before it ships. Pass = product
# leaves the factory; fail = goes to rework queue.
#
# Runs from a Mac/Linux laptop tethered to the unit under test.
# Requires:
#   - esptool.py (pip install esptool)
#   - pio (pip install platformio)
#   - HazardLink test firmware built at firmware/.pio/build/qc/
#   - A "golden" gateway running nearby for LoRa range test
#
# Usage:
#   ./factory_qc.sh /dev/cu.usbserial-XXXX
#
# A pass produces a /tmp/qc-<DevEUI>.json record + green LED on the
# unit. A fail logs the failure reason + flashes red.

set -euo pipefail

PORT="${1:?Usage: $0 <serial-port>}"
LOG_DIR="/tmp/hazardlink-qc"
mkdir -p "$LOG_DIR"

echo "─── HazardLink QC for $PORT ───"
START_TS="$(date +%s)"

# ─── Step 1: flash QC firmware ─────────────────────────────────
# The QC firmware is a stripped-down variant that runs each test
# autonomously and reports JSON over serial. After QC passes,
# we re-flash the production firmware.
echo "[1/6] Flashing QC firmware…"
pio run -e qc -t upload --upload-port "$PORT" >> "$LOG_DIR/flash.log" 2>&1 || {
    echo "❌ FAIL: flash failed (see $LOG_DIR/flash.log)"; exit 1;
}

# ─── Step 2: read DevEUI ───────────────────────────────────────
echo "[2/6] Reading DevEUI…"
DEV_EUI=$(pio device monitor --port "$PORT" --baud 115200 --quiet \
    --filter direct --eol LF 2>/dev/null | timeout 10 \
    awk '/DEVEUI=/{sub(/^DEVEUI=/, ""); print; exit}')
if [[ -z "$DEV_EUI" ]]; then
    echo "❌ FAIL: no DevEUI reported"; exit 1
fi
echo "    DevEUI: $DEV_EUI"

# ─── Step 3: battery voltage check ─────────────────────────────
echo "[3/6] Battery voltage…"
BATT_MV=$(pio device monitor --port "$PORT" --baud 115200 --quiet \
    --filter direct --eol LF 2>/dev/null | timeout 5 \
    awk '/BATT_MV=/{sub(/^BATT_MV=/, ""); print; exit}')
if [[ "$BATT_MV" -lt 3700 || "$BATT_MV" -gt 4250 ]]; then
    echo "❌ FAIL: battery $BATT_MV mV outside 3700-4250"; exit 1
fi
echo "    Battery: ${BATT_MV} mV ✓"

# ─── Step 4: Hall sensor reads correctly ───────────────────────
echo "[4/6] Hall sensor test (place magnet, then remove)…"
echo "    >>> Operator: hold the calibration magnet near the sensor for 3 seconds, then remove."
sleep 3
HALL_DELTA=$(pio device monitor --port "$PORT" --baud 115200 --quiet \
    --filter direct --eol LF 2>/dev/null | timeout 15 \
    awk '/HALL_DELTA=/{sub(/^HALL_DELTA=/, ""); print; exit}')
if [[ -z "$HALL_DELTA" || "$HALL_DELTA" -lt 100 ]]; then
    echo "❌ FAIL: Hall sensor did not respond to magnet"; exit 1
fi
echo "    Hall sensor delta: $HALL_DELTA ✓"

# ─── Step 5: LoRa range test to golden gateway ─────────────────
echo "[5/6] LoRa range test…"
LORA_RSSI=$(pio device monitor --port "$PORT" --baud 115200 --quiet \
    --filter direct --eol LF 2>/dev/null | timeout 20 \
    awk '/LORA_RSSI=/{sub(/^LORA_RSSI=/, ""); print; exit}')
if [[ -z "$LORA_RSSI" || "$LORA_RSSI" -lt -110 ]]; then
    echo "    LoRa RSSI: $LORA_RSSI dBm (too weak)"
    echo "❌ FAIL: LoRa range test failed"; exit 1
fi
echo "    LoRa RSSI: $LORA_RSSI dBm ✓"

# ─── Step 6: re-flash production firmware ──────────────────────
echo "[6/6] Flashing production firmware…"
pio run -e hanger -t upload --upload-port "$PORT" >> "$LOG_DIR/flash-prod.log" 2>&1 || {
    echo "❌ FAIL: production flash failed"; exit 1;
}

# ─── PASS ──────────────────────────────────────────────────────
END_TS="$(date +%s)"
DURATION=$((END_TS - START_TS))

cat > "$LOG_DIR/qc-$DEV_EUI.json" <<EOF
{
  "dev_eui": "$DEV_EUI",
  "qc_pass_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "duration_sec": $DURATION,
  "battery_mv": $BATT_MV,
  "hall_delta": $HALL_DELTA,
  "lora_rssi": $LORA_RSSI,
  "operator": "${USER:-unknown}",
  "test_rig": "$(hostname)"
}
EOF

echo ""
echo "✅ PASS — unit $DEV_EUI completed QC in ${DURATION}s"
echo "    Record: $LOG_DIR/qc-$DEV_EUI.json"

# Print sticker (optional — if you have a label printer wired up)
# label_printer --print "HazardLink\nID: $DEV_EUI" || true
