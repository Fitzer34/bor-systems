#!/usr/bin/env python3
"""
BOR Systems — Raspberry Pi installer.

Two roles supported:

  Gateway role — Pi receives LoRa packets from battery-powered hangers via
    a LoRa concentrator hat. Runs a status server on port 8080.
    Typical for: one Pi per building.

      sudo python3 install.py --role gateway

  Hanger role — Pi is mounted IN the hanger itself, reads a microswitch
    on GPIO, and sends events directly to the cloud over WiFi.
    Typical for: buildings with strong WiFi everywhere.

      sudo python3 install.py --role hanger

If --role is omitted, the script prompts interactively.
"""

from __future__ import annotations

import argparse
import os
import secrets
import sys
import subprocess
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
VENV_DIR = SCRIPT_DIR / ".venv"
HANGER_ENV_FILE = Path("/etc/bor-hanger.env")

APT_PACKAGES_COMMON = [
    "build-essential",
    "git",
    "python3",
    "python3-venv",
    "python3-pip",
    "curl",
]
APT_PACKAGES_GATEWAY = [
    "libftdi-dev",
    "libudev-dev",
]
APT_PACKAGES_HANGER = [
    "python3-gpiozero",
    "python3-lgpio",
]


def must_be_root() -> None:
    if os.geteuid() != 0:
        sys.exit("Run with sudo: sudo python3 install.py")


def run(cmd: list[str], *, check: bool = True) -> int:
    print(f"\n[run] {' '.join(cmd)}")
    return subprocess.run(cmd, check=check).returncode


def apt_install(extra: list[str]) -> None:
    print("\n=== apt update + install build tools ===")
    run(["apt-get", "update"])
    run(["apt-get", "install", "-y", *APT_PACKAGES_COMMON, *extra])


def setup_venv(install_gpiozero: bool = False) -> None:
    print("\n=== Python venv ===")
    # If the venv already exists but needs to gain access to system-installed
    # gpiozero (i.e. we're switching from gateway role → hanger role), wipe
    # it and start fresh. Tiny cost; avoids ModuleNotFoundError at runtime.
    needs_system_pkgs = install_gpiozero
    if VENV_DIR.exists() and needs_system_pkgs:
        pyvenv_cfg = VENV_DIR / "pyvenv.cfg"
        has_sys = pyvenv_cfg.exists() and "include-system-site-packages = true" in pyvenv_cfg.read_text()
        if not has_sys:
            import shutil
            print("Existing venv lacks --system-site-packages; recreating for hanger role")
            shutil.rmtree(VENV_DIR)

    if not VENV_DIR.exists():
        args = ["python3", "-m", "venv"]
        if needs_system_pkgs:
            # Pi 5's GPIO is gated behind gpiozero+lgpio which install cleanly
            # only via apt — this flag exposes them inside the venv.
            args.append("--system-site-packages")
        run([*args, str(VENV_DIR)])
    pip = VENV_DIR / "bin" / "pip"
    run([str(pip), "install", "--upgrade", "pip"])
    run([str(pip), "install", "-r", str(SCRIPT_DIR / "requirements.txt")])
    if install_gpiozero:
        # Belt-and-braces: explicitly install gpiozero+lgpio into the venv too,
        # in case the apt versions are missing or out of date.
        run([str(pip), "install", "gpiozero", "lgpio"])


def render_unit(src: Path, dst: Path, mapping: dict[str, str]) -> None:
    if not src.exists():
        sys.exit(f"missing service file: {src}")
    txt = src.read_text()
    for k, v in mapping.items():
        txt = txt.replace(k, v)
    dst.write_text(txt)
    print(f"wrote {dst}")


def install_gateway_service() -> None:
    print("\n=== register bor-status systemd service (gateway role) ===")
    render_unit(
        SCRIPT_DIR / "services" / "bor-status.service",
        Path("/etc/systemd/system/bor-status.service"),
        {
            "__PYTHON__": str(VENV_DIR / "bin" / "python3"),
            "__STATUS_PY__": str(SCRIPT_DIR / "status.py"),
            "__USER__": os.environ.get("SUDO_USER", "pi"),
            "__WORKDIR__": str(SCRIPT_DIR),
        },
    )
    run(["systemctl", "daemon-reload"])
    run(["systemctl", "enable", "bor-status.service"])
    run(["systemctl", "restart", "bor-status.service"])


def prompt_hanger_env() -> dict[str, str]:
    """Interactively gather HANGER_DEVEUI, BOR_WEBHOOK_URL, BOR_TTS_SECRET."""
    print("\n=== Hanger config ===")
    print("(Stored in /etc/bor-hanger.env — root-only readable)")

    if HANGER_ENV_FILE.exists():
        ans = input(f"{HANGER_ENV_FILE} already exists — reuse it? [Y/n]: ").strip().lower()
        if ans in ("", "y", "yes"):
            return {}

    print("\nDevEUI uniquely identifies this hanger. Must be 16 hex characters.")
    suggestion = secrets.token_hex(8).upper()
    dev_eui = input(f"DevEUI [{suggestion}]: ").strip().upper() or suggestion
    if len(dev_eui) != 16 or any(c not in "0123456789ABCDEF" for c in dev_eui):
        sys.exit("DevEUI must be exactly 16 hex characters.")

    default_url = "https://bor-systems-backend.onrender.com/webhook/tts"
    webhook = input(f"Webhook URL [{default_url}]: ").strip() or default_url

    secret = input("TTS_WEBHOOK_SECRET (paste from Render env vars): ").strip()
    if not secret:
        sys.exit("TTS_WEBHOOK_SECRET is required.")

    return {
        "HANGER_DEVEUI": dev_eui,
        "BOR_WEBHOOK_URL": webhook,
        "BOR_TTS_SECRET": secret,
    }


def write_hanger_env(env: dict[str, str]) -> None:
    if not env:
        return
    lines = ["# BOR hanger configuration — managed by install.py\n"]
    for k, v in env.items():
        lines.append(f"{k}={v}\n")
    HANGER_ENV_FILE.write_text("".join(lines))
    HANGER_ENV_FILE.chmod(0o600)
    print(f"wrote {HANGER_ENV_FILE} (mode 600)")


def install_hanger_service() -> None:
    print("\n=== register bor-hanger systemd service (hanger role) ===")
    render_unit(
        SCRIPT_DIR / "services" / "bor-hanger.service",
        Path("/etc/systemd/system/bor-hanger.service"),
        {
            "__PYTHON__": str(VENV_DIR / "bin" / "python3"),
            "__HANGER_PY__": str(SCRIPT_DIR / "wifi_hanger.py"),
            "__USER__": os.environ.get("SUDO_USER", "pi"),
            "__WORKDIR__": str(SCRIPT_DIR),
        },
    )
    run(["systemctl", "daemon-reload"])
    run(["systemctl", "enable", "bor-hanger.service"])
    run(["systemctl", "restart", "bor-hanger.service"])


def show_status(service: str) -> None:
    print(f"\n=== status of {service} ===")
    run(["systemctl", "--no-pager", "status", service], check=False)


def banner_next_steps(role: str) -> None:
    if role == "gateway":
        print(
            """
========================================================================
Gateway install complete.

1. Browse to http://<this-pi-hostname>.local:8080 to confirm
   the status page loads.

2. When the LoRa concentrator (RAK2287 etc.) arrives:
       git clone https://github.com/RAKWireless/rak_common_for_gateway
       cd rak_common_for_gateway
       sudo ./install.sh   # pick your hat → EU868

3. Register the gateway in The Things Stack and wire the webhook
   to https://bor-systems-backend.onrender.com/webhook/tts
========================================================================
"""
        )
    else:
        print(
            """
========================================================================
Hanger install complete.

This Pi is now a WiFi hanger. Wiring (BCM GPIO numbering):

  GPIO 17 (pin 11)  — microswitch    (closed = sign present)
  GPIO 22 (pin 15)  — red LED        (on when sign lifted)
  GPIO 27 (pin 13)  — green LED      (on for 5s on test button)
  GPIO 23 (pin 16)  — test button
  GPIO 24 (pin 18)  — buzzer         (optional)
  Any GND pin       — common ground for switches/LEDs

Service: bor-hanger.service (auto-starts on boot).
Logs:    sudo journalctl -u bor-hanger -f
Config:  /etc/bor-hanger.env

To test before wiring a real switch: momentarily jumper GPIO 17 to GND
with a wire. The red LED turns on, the event hits the cloud, and the
alert appears on the iOS app + web dashboard within 5 seconds.

Don't forget to register this hanger's DevEUI in the BOR web admin
(Hangers → Register) so the cloud knows which zone to alert on.
========================================================================
"""
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="BOR Systems Pi installer")
    parser.add_argument("--role", choices=["gateway", "hanger"], help="Pi role")
    parser.add_argument("--skip-apt", action="store_true", help="Skip apt update + install")
    args = parser.parse_args()

    must_be_root()

    role = args.role
    if not role:
        print("\nWhich role for this Pi?")
        print("  1) Gateway — receives LoRa packets from remote battery hangers (needs LoRa hat)")
        print("  2) Hanger  — Pi mounted in the hanger, sends events over WiFi (needs microswitch)")
        choice = input("Choose 1 or 2: ").strip()
        role = "gateway" if choice == "1" else "hanger" if choice == "2" else None
        if role is None:
            sys.exit("Invalid choice.")

    extra_apt = APT_PACKAGES_HANGER if role == "hanger" else APT_PACKAGES_GATEWAY
    if not args.skip_apt:
        apt_install(extra_apt)
    setup_venv(install_gpiozero=(role == "hanger"))

    if role == "gateway":
        install_gateway_service()
        show_status("bor-status.service")
    else:
        env = prompt_hanger_env()
        write_hanger_env(env)
        install_hanger_service()
        show_status("bor-hanger.service")

    banner_next_steps(role)


if __name__ == "__main__":
    main()
