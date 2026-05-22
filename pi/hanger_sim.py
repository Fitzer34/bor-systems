#!/usr/bin/env python3
"""
Hanger simulator for ZeroSlip.

Sends a fake LoRaWAN uplink to your cloud backend's TTS webhook so you can
exercise the alert pipeline end-to-end without real hardware.

Usage:
    python3 hanger_sim.py lift     --devEui 0011223344556677
    python3 hanger_sim.py return   --devEui 0011223344556677
    python3 hanger_sim.py heartbeat --devEui 0011223344556677 --battery 73
    python3 hanger_sim.py cycle    --devEui 0011223344556677 --wait 20

Pre-flight:
- Register the DevEUI in your live BOR org (https://bor-systems-web.onrender.com)
  via the Hangers page so the backend recognises it.
- Make sure you know the TTS webhook secret (Render env var TTS_WEBHOOK_SECRET).
  Either pass it via --secret or set BOR_TTS_SECRET.

Runs on Mac or Pi — only needs Python 3.10+ and the `requests` package.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import time

import requests

DEFAULT_BACKEND = "https://bor-systems-backend.onrender.com"

# Event-type codes (must match shared/payload.ts / backend/src/payload.ts)
EVT_LIFTED = 0x01
EVT_RETURNED = 0x02
EVT_HEARTBEAT = 0x03
EVT_LOW_BATTERY = 0x04

EVT_BY_NAME = {
    "lift": EVT_LIFTED,
    "lifted": EVT_LIFTED,
    "return": EVT_RETURNED,
    "returned": EVT_RETURNED,
    "heartbeat": EVT_HEARTBEAT,
    "low_battery": EVT_LOW_BATTERY,
}


def encode_payload(event: int, battery: int, fw_major: int = 0, fw_minor: int = 1, test_button: bool = False) -> str:
    """Return a base64 string matching the 4-byte LoRaWAN payload codec."""
    fw_byte = ((fw_major & 0x0F) << 4) | (fw_minor & 0x0F)
    flags = 0x01 if test_button else 0x00
    raw = bytes([event & 0xFF, max(0, min(100, battery)), fw_byte, flags])
    return base64.b64encode(raw).decode("ascii")


def fire(
    backend: str,
    secret: str,
    dev_eui: str,
    event: int,
    battery: int,
) -> requests.Response:
    payload = encode_payload(event, battery)
    body = {
        "end_device_ids": {"dev_eui": dev_eui.upper()},
        "uplink_message": {"f_port": 1, "frm_payload": payload},
    }
    headers = {
        "Content-Type": "application/json",
        "X-BOR-Secret": secret,
    }
    url = f"{backend.rstrip('/')}/webhook/tts"
    return requests.post(url, data=json.dumps(body), headers=headers, timeout=10)


def main() -> None:
    parser = argparse.ArgumentParser(description="ZeroSlip fake-hanger simulator")
    parser.add_argument(
        "event",
        choices=["lift", "lifted", "return", "returned", "heartbeat", "low_battery", "cycle"],
        help="Which event to send. 'cycle' fires lifted, waits, then returned.",
    )
    parser.add_argument("--devEui", required=True, help="DevEUI (16 hex chars)")
    parser.add_argument("--battery", type=int, default=85, help="Battery pct (0-100)")
    parser.add_argument("--wait", type=int, default=15, help="Seconds between lifted and returned (cycle mode)")
    parser.add_argument("--backend", default=os.environ.get("BOR_BACKEND_URL", DEFAULT_BACKEND))
    parser.add_argument("--secret", default=os.environ.get("BOR_TTS_SECRET"))

    args = parser.parse_args()

    if not args.secret:
        sys.exit(
            "Missing TTS webhook secret. Either pass --secret or set BOR_TTS_SECRET.\n"
            "Find the value in Render → bor-systems-backend → Environment → TTS_WEBHOOK_SECRET."
        )

    if not args.devEui or len(args.devEui) != 16:
        sys.exit("DevEUI must be exactly 16 hex characters.")

    def shoot(name: str, code: int) -> None:
        r = fire(args.backend, args.secret, args.devEui, code, args.battery)
        ts = time.strftime("%H:%M:%S")
        if r.ok:
            print(f"{ts}  {name:>9}  {r.status_code}  {r.text.strip()}")
        else:
            print(f"{ts}  {name:>9}  {r.status_code}  {r.text.strip()}", file=sys.stderr)
            sys.exit(1)

    if args.event == "cycle":
        shoot("lifted", EVT_LIFTED)
        time.sleep(args.wait)
        shoot("returned", EVT_RETURNED)
    else:
        shoot(args.event, EVT_BY_NAME[args.event])


if __name__ == "__main__":
    main()
