#!/usr/bin/env python3
"""
BOR Systems — Raspberry Pi 5 installer.

Run on the Pi after cloning the repo:

    cd ~/bor-systems/pi
    sudo python3 install.py

What this does:
  1. apt update + install build tools and Python venv
  2. Create a Python venv with Flask, requests, psutil
  3. Install the bor-status systemd service (status page on port 8080)
  4. Start the service immediately
  5. Print next steps for LoRa hardware setup

It does NOT install/build the Semtech LoRa packet forwarder — that's
hardware-specific (RAK2287 vs RAK5146 vs Dragino vs MikroTik). The README
points at the right vendor installer to run after this.
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
VENV_DIR = SCRIPT_DIR / ".venv"

APT_PACKAGES = [
    "build-essential",
    "git",
    "python3",
    "python3-venv",
    "python3-pip",
    "curl",
    "libftdi-dev",
    "libudev-dev",
]


def must_be_root() -> None:
    if os.geteuid() != 0:
        sys.exit("Run with sudo: sudo python3 install.py")


def run(cmd: list[str], *, check: bool = True, env: dict | None = None) -> int:
    print(f"\n[run] {' '.join(cmd)}")
    return subprocess.run(cmd, check=check, env=env).returncode


def apt_install() -> None:
    print("\n=== Step 1/4: apt update + install build tools ===")
    run(["apt-get", "update"])
    run(["apt-get", "install", "-y", *APT_PACKAGES])


def setup_venv() -> None:
    print("\n=== Step 2/4: Python venv + Flask + requests ===")
    if not VENV_DIR.exists():
        run(["python3", "-m", "venv", str(VENV_DIR)])
    pip = VENV_DIR / "bin" / "pip"
    run([str(pip), "install", "--upgrade", "pip"])
    run([str(pip), "install", "-r", str(SCRIPT_DIR / "requirements.txt")])


def install_systemd_unit() -> None:
    print("\n=== Step 3/4: register bor-status systemd service ===")
    src = SCRIPT_DIR / "services" / "bor-status.service"
    dst = Path("/etc/systemd/system/bor-status.service")

    if not src.exists():
        sys.exit(f"missing service file: {src}")

    # Render the unit with the actual repo path baked in
    template = src.read_text()
    rendered = (
        template
        .replace("__PYTHON__", str(VENV_DIR / "bin" / "python3"))
        .replace("__STATUS_PY__", str(SCRIPT_DIR / "status.py"))
        .replace("__USER__", os.environ.get("SUDO_USER", "pi"))
        .replace("__WORKDIR__", str(SCRIPT_DIR))
    )
    dst.write_text(rendered)
    print(f"wrote {dst}")

    run(["systemctl", "daemon-reload"])
    run(["systemctl", "enable", "bor-status.service"])
    run(["systemctl", "restart", "bor-status.service"])


def show_status() -> None:
    print("\n=== Step 4/4: status check ===")
    run(["systemctl", "--no-pager", "status", "bor-status.service"], check=False)
    print("\nIf the service is 'active (running)' you can now hit:")
    print("    http://<your-pi-hostname>.local:8080")
    print("from any device on the same WiFi.\n")


def banner_next_steps() -> None:
    print(
        """
========================================================================
Done. Next steps:

1. Open http://<your-pi-hostname>.local:8080 from your Mac browser
   to confirm the status page loads.

2. Plug in your LoRa concentrator (RAK2287 USB, RAK5146 PCIe, etc.)
   and follow the vendor's installer to set up the Semtech packet
   forwarder. For RAK gear:
       git clone https://github.com/RAKWireless/rak_common_for_gateway
       cd rak_common_for_gateway
       sudo ./install.sh

3. Configure the packet forwarder to point at your gateway in
   The Things Stack (https://eu1.cloud.thethings.industries/). Use
   the gateway EUI on the back of the concentrator.

4. Register your hangers in the cloud BOR dashboard
   (https://bor-systems-web.onrender.com) using each hanger's DevEUI.

5. To smoke-test the pipeline without real hardware:
       python3 hanger_sim.py lift --devEui 0011223344556677
========================================================================
"""
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="BOR Systems Pi installer")
    parser.add_argument(
        "--skip-apt",
        action="store_true",
        help="Skip the apt update + install step (useful when re-running)",
    )
    args = parser.parse_args()

    must_be_root()

    if not args.skip_apt:
        apt_install()
    setup_venv()
    install_systemd_unit()
    show_status()
    banner_next_steps()


if __name__ == "__main__":
    main()
