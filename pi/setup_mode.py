#!/usr/bin/env python3
"""
BOR Hanger first-time Wi-Fi onboarding via Bluetooth Low Energy.

Runs at boot when the device has no Wi-Fi configured yet. Advertises a
GATT service that the Zero Slip Systems iOS app can connect to over BLE, writes
the user's Wi-Fi credentials in, and we then use NetworkManager to join
the network. On success this script signals systemd to switch to the
normal `bor-hanger` service.

UX from the customer's side:

  1. Plug in the hanger. A green LED breathes to say "I'm in setup mode".
  2. Open Zero Slip Systems app → Hangers → Add a hanger.
  3. The app finds "BOR-Setup-XXXX" via Bluetooth, prompts the customer to
     enter the home Wi-Fi password, sends it over BLE.
  4. Pi joins the home Wi-Fi → status reads back "connected" → app says
     "done", Pi reboots into normal hanger mode.

Security:
  - BLE pairing uses a 6-digit passkey printed on a label on the hanger.
    Random phones in BLE range can't write credentials without typing it.
  - Wi-Fi password never leaves the Pi — sent BLE → Pi → home router only.

Required apt packages (handled in install.py):
  - bluez (already on Raspberry Pi OS)
  - python3-dbus
  - python3-gi
  - python3-bluezero (or pip install bluezero)
  - network-manager (for nmcli)

Environment overrides:
  - BOR_SETUP_NAME   override the advertised device name (default BOR-Setup-{last 4 chars of MAC})
  - BOR_SETUP_PIN    override the 6-digit pairing PIN (default derived from MAC)
  - BOR_SETUP_FORCE  if set to 1, advertise BLE even when Wi-Fi is already
                     configured. Used for testing on a deployed hanger, and
                     for the future re-onboarding flow when a customer
                     changes routers.
"""

from __future__ import annotations

import logging
import os
import re
import subprocess
import sys
import time
from pathlib import Path

# bluezero is a thin Python wrapper around BlueZ that handles the painful
# DBus bits of being a GATT peripheral.
from bluezero import adapter, peripheral

log = logging.getLogger("bor-setup")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)

# --- GATT service / characteristic UUIDs ------------------------------------
# These MUST match the iOS HangerSetupView constants byte-for-byte. Generated
# once via `uuidgen` so they're stable across Pi versions.
SERVICE_UUID  = "b08e0001-d4e2-4f5a-9c01-3f25d3a7c2a1"
CHR_SSID      = "b08e0002-d4e2-4f5a-9c01-3f25d3a7c2a1"  # write
CHR_PASSWORD  = "b08e0003-d4e2-4f5a-9c01-3f25d3a7c2a1"  # write
CHR_COMMIT    = "b08e0004-d4e2-4f5a-9c01-3f25d3a7c2a1"  # write — kicks off join
CHR_STATUS    = "b08e0005-d4e2-4f5a-9c01-3f25d3a7c2a1"  # read + notify
CHR_DEVEUI    = "b08e0006-d4e2-4f5a-9c01-3f25d3a7c2a1"  # read — shows the
                                                        # DevEUI so the app
                                                        # can register the
                                                        # hanger with the cloud
                                                        # without manual entry

# --- Files we read/write ----------------------------------------------------
HANGER_ENV = Path("/etc/bor-hanger.env")
WIFI_DONE_FLAG = Path("/var/lib/bor-systems/wifi-configured")

# --- Current operation state ------------------------------------------------
# Held across BLE writes (SSID then password then commit).
_state: dict[str, str] = {
    "ssid": "",
    "password": "",
    "status": "ready",  # "ready" | "joining" | "connected" | "failed:<reason>"
}


# --- Helpers ----------------------------------------------------------------

def _mac_suffix() -> str:
    """Return the last 4 hex chars of the BT adapter MAC, uppercased."""
    try:
        result = subprocess.run(
            ["hciconfig", "hci0"],
            capture_output=True, text=True, check=True,
        )
        m = re.search(r"BD Address: ([0-9A-F:]+)", result.stdout)
        if m:
            return m.group(1).replace(":", "")[-4:].upper()
    except Exception:
        pass
    return "0000"


def device_name() -> str:
    return os.environ.get("BOR_SETUP_NAME", f"BOR-Setup-{_mac_suffix()}")


def pairing_pin() -> str:
    """6-digit PIN to be printed on the hanger label.

    Derived deterministically from the BT MAC so the manufacturer's labelling
    can pre-print it. Customer types the same digits when iOS prompts for
    pairing. Configurable via env if you'd rather randomise it.
    """
    pin = os.environ.get("BOR_SETUP_PIN")
    if pin and re.fullmatch(r"\d{6}", pin):
        return pin
    mac = _mac_suffix()
    # Map the last 4 hex chars to a 6-digit number deterministically.
    seed = int(mac, 16)
    return f"{(seed * 7919) % 1_000_000:06d}"


def current_dev_eui() -> str:
    """Read HANGER_DEVEUI out of /etc/bor-hanger.env, blank if absent."""
    if not HANGER_ENV.exists():
        return ""
    for line in HANGER_ENV.read_text().splitlines():
        if line.startswith("HANGER_DEVEUI="):
            return line.split("=", 1)[1].strip()
    return ""


def is_wifi_already_configured() -> bool:
    """Return True if NetworkManager already has a saved Wi-Fi connection."""
    try:
        out = subprocess.run(
            ["nmcli", "-t", "-f", "TYPE", "connection", "show"],
            capture_output=True, text=True, check=True,
        ).stdout
        return any(line.strip() == "802-11-wireless" for line in out.splitlines())
    except Exception:
        return False


def join_wifi(ssid: str, password: str) -> tuple[bool, str]:
    """Use nmcli to join the network. Returns (ok, message)."""
    log.info("attempting to join Wi-Fi network: %s", ssid)
    try:
        # `nmcli device wifi connect SSID password PASS` — adds + activates.
        result = subprocess.run(
            ["nmcli", "device", "wifi", "connect", ssid, "password", password],
            capture_output=True, text=True, timeout=45,
        )
        if result.returncode == 0:
            log.info("nmcli connect ok: %s", result.stdout.strip())
            return True, "connected"
        msg = (result.stderr or result.stdout).strip().splitlines()[-1][:120]
        log.warning("nmcli connect failed: %s", msg)
        return False, msg
    except subprocess.TimeoutExpired:
        return False, "timeout — check the password and that you're in range"
    except Exception as e:
        return False, str(e)[:120]


def mark_wifi_configured() -> None:
    """Drop a sentinel file. systemd checks for it via ConditionPathExists
    to decide whether to launch bor-setup.service or bor-hanger.service."""
    WIFI_DONE_FLAG.parent.mkdir(parents=True, exist_ok=True)
    WIFI_DONE_FLAG.write_text("ok\n")


def hand_off_to_main_service() -> None:
    """Tell systemd to stop us and start the real hanger daemon."""
    log.info("Wi-Fi configured — switching to bor-hanger.service")
    try:
        subprocess.run(["systemctl", "start", "bor-hanger.service"], check=False)
    except Exception as e:
        log.warning("couldn't start bor-hanger.service: %s — will start on next boot", e)


# --- BLE characteristic callbacks ------------------------------------------

def _on_ssid_write(value, options):  # noqa: ARG001 — bluezero signature
    try:
        _state["ssid"] = bytes(value).decode("utf-8")
        log.info("SSID received (%d chars)", len(_state["ssid"]))
    except Exception as e:
        log.warning("bad SSID payload: %s", e)


def _on_password_write(value, options):  # noqa: ARG001
    try:
        _state["password"] = bytes(value).decode("utf-8")
        log.info("password received (%d chars)", len(_state["password"]))
    except Exception as e:
        log.warning("bad password payload: %s", e)


def _on_commit_write(value, options):  # noqa: ARG001
    """The iOS app writes any byte here once SSID + password are in. We
    take that as the trigger to actually try the connection."""
    ssid = _state.get("ssid", "")
    password = _state.get("password", "")
    if not ssid or not password:
        _state["status"] = "failed:missing_credentials"
        return
    _state["status"] = "joining"
    ok, msg = join_wifi(ssid, password)
    if ok:
        _state["status"] = "connected"
        mark_wifi_configured()
        # Give the iOS app a couple of seconds to read the "connected" status
        # before we swap services and lose the BLE connection.
        time.sleep(2)
        hand_off_to_main_service()
    else:
        _state["status"] = f"failed:{msg}"


def _on_status_read(options):  # noqa: ARG001
    return list(_state["status"].encode("utf-8"))


def _on_deveui_read(options):  # noqa: ARG001
    return list(current_dev_eui().encode("utf-8"))


# --- Main -------------------------------------------------------------------

def main() -> int:
    # Skip BLE setup entirely if the Pi already has Wi-Fi configured. This
    # makes the service safe to leave enabled — it'll just exit on boot when
    # nothing needs doing. BOR_SETUP_FORCE=1 overrides this for testing and
    # for the re-onboarding flow (customer changes their Wi-Fi router).
    if os.environ.get("BOR_SETUP_FORCE") == "1":
        log.info("BOR_SETUP_FORCE=1 — advertising BLE even though Wi-Fi may be configured")
    elif WIFI_DONE_FLAG.exists() or is_wifi_already_configured():
        log.info("Wi-Fi already configured — exiting setup mode")
        hand_off_to_main_service()
        return 0

    name = device_name()
    pin = pairing_pin()
    log.info("entering setup mode — advertising as %s (pairing PIN %s)", name, pin)

    # Pick the first available BT adapter (almost always hci0 on a Pi).
    adapters = list(adapter.Adapter.available())
    if not adapters:
        log.error("no Bluetooth adapter found — is BLE enabled?")
        return 1
    dongle = adapters[0]
    dongle.powered = True
    dongle.discoverable = True

    bor = peripheral.Peripheral(dongle.address, local_name=name, appearance=0)
    bor.add_service(srv_id=1, uuid=SERVICE_UUID, primary=True)

    # All credential writes require an encrypted, authenticated BLE link —
    # i.e. the user must complete pairing (passkey prompt on iOS).
    bor.add_characteristic(
        srv_id=1, chr_id=1, uuid=CHR_SSID, value=[],
        notifying=False, flags=["encrypt-authenticated-write"],
        write_callback=_on_ssid_write,
    )
    bor.add_characteristic(
        srv_id=1, chr_id=2, uuid=CHR_PASSWORD, value=[],
        notifying=False, flags=["encrypt-authenticated-write"],
        write_callback=_on_password_write,
    )
    bor.add_characteristic(
        srv_id=1, chr_id=3, uuid=CHR_COMMIT, value=[],
        notifying=False, flags=["encrypt-authenticated-write"],
        write_callback=_on_commit_write,
    )
    bor.add_characteristic(
        srv_id=1, chr_id=4, uuid=CHR_STATUS, value=[], notifying=True,
        flags=["encrypt-read", "notify"],
        read_callback=_on_status_read,
    )
    # DevEUI is readable without pairing — it's printed on the hanger label
    # anyway and the app needs it before pairing to know it's the right device.
    bor.add_characteristic(
        srv_id=1, chr_id=5, uuid=CHR_DEVEUI, value=[], notifying=False,
        flags=["read"],
        read_callback=_on_deveui_read,
    )

    bor.publish()  # blocks; serves BLE until the process is killed
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(0)
