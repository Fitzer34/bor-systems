#!/usr/bin/env python3
"""
Find a Raspberry Pi on your local network.

Run on your Mac when `borpi.local` doesn't resolve. It scans the /24 your
Mac is on, checks port 22 (SSH), and looks for the hostname "borpi" or
"raspberrypi" in mDNS replies.

Usage:
    python3 find_pi.py
    python3 find_pi.py --hostname myownpi
"""

from __future__ import annotations

import argparse
import concurrent.futures
import ipaddress
import socket
import subprocess
import sys

CANDIDATE_HOSTNAMES = ["borpi", "raspberrypi"]


def my_lan_subnet() -> ipaddress.IPv4Network | None:
    """Returns the /24 the Mac is on, or None if it can't figure it out."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        my_ip = s.getsockname()[0]
        s.close()
        prefix = my_ip.rsplit(".", 1)[0]
        return ipaddress.IPv4Network(f"{prefix}.0/24")
    except OSError:
        return None


def port_open(ip: str, port: int = 22, timeout: float = 0.4) -> bool:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(timeout)
            return s.connect_ex((ip, port)) == 0
    except OSError:
        return False


def reverse_lookup(ip: str) -> str | None:
    try:
        host, _, _ = socket.gethostbyaddr(ip)
        return host
    except (socket.herror, socket.gaierror):
        return None


def mdns_lookup(hostname: str) -> str | None:
    """Try `.local` resolution via macOS's mDNSResponder."""
    try:
        return socket.gethostbyname(f"{hostname}.local")
    except (socket.gaierror, OSError):
        return None


def scan(subnet: ipaddress.IPv4Network) -> list[tuple[str, str]]:
    """Return list of (ip, hostname) for hosts with port 22 open."""
    candidates: list[tuple[str, str]] = []
    addrs = [str(ip) for ip in subnet.hosts()]
    with concurrent.futures.ThreadPoolExecutor(max_workers=64) as pool:
        open_results = list(pool.map(port_open, addrs))
    for ip, ok in zip(addrs, open_results):
        if not ok:
            continue
        host = reverse_lookup(ip) or "?"
        candidates.append((ip, host))
    return candidates


def main() -> None:
    parser = argparse.ArgumentParser(description="Find a Raspberry Pi on the LAN")
    parser.add_argument("--hostname", help="Try mDNS first for this hostname (default: borpi, raspberrypi)")
    args = parser.parse_args()

    # Try mDNS shortcuts first
    candidates = CANDIDATE_HOSTNAMES.copy()
    if args.hostname:
        candidates = [args.hostname] + candidates

    for hostname in candidates:
        ip = mdns_lookup(hostname)
        if ip:
            print(f"✓ Found {hostname}.local → {ip}")
            print(f"  ssh <username>@{hostname}.local")
            print(f"  http://{hostname}.local:8080  (BOR status page)")
            return

    print("mDNS (.local) lookup found nothing; scanning the LAN for SSH-open hosts…")

    subnet = my_lan_subnet()
    if subnet is None:
        sys.exit("Could not determine your LAN subnet. Are you connected to a network?")

    print(f"Scanning {subnet} (this takes ~10s)…")
    matches = scan(subnet)

    if not matches:
        print("No SSH-open hosts found. Is the Pi powered on and connected to WiFi?")
        return

    print(f"\nFound {len(matches)} host(s) with SSH open:")
    print(f"  {'IP':<16}  {'Hostname':<40}")
    print(f"  {'-'*16}  {'-'*40}")
    for ip, host in matches:
        marker = "  ← likely Pi" if any(name in host.lower() for name in ["pi", "raspberry"]) else ""
        print(f"  {ip:<16}  {host:<40}{marker}")


if __name__ == "__main__":
    main()
