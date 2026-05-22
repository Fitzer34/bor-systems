#!/usr/bin/env python3
"""
ZeroSlip Pi status server.

Tiny Flask app that runs on the Pi and serves a status page at
http://<pi-hostname>.local:8080. Shows:

- Pi system info (CPU/mem/disk, uptime, hostname)
- Whether the LoRa concentrator daemon ('lora_pkt_fwd') is running
- Last N packets observed in the packet forwarder log (if present)
- Reachability of the cloud BOR backend

Run via systemd (installed by install.py) or directly for testing:

    python3 status.py
"""

from __future__ import annotations

import os
import platform
import socket
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

import psutil
import requests
from flask import Flask, jsonify, render_template_string

# --- Config ---

CLOUD_HEALTH_URL = os.environ.get(
    "BOR_CLOUD_HEALTH", "https://bor-systems-backend.onrender.com/health"
)
PACKET_FWD_SERVICE = os.environ.get("BOR_PKT_FWD_SERVICE", "lora_pkt_fwd")
PACKET_FWD_LOG = Path(
    os.environ.get("BOR_PKT_FWD_LOG", "/var/log/lora_pkt_fwd.log")
)
PORT = int(os.environ.get("PORT", 8080))
HOST = os.environ.get("HOST", "0.0.0.0")

app = Flask(__name__)


# --- Probes ---


def boot_time_iso() -> str:
    return datetime.fromtimestamp(psutil.boot_time(), tz=timezone.utc).isoformat()


def uptime_human() -> str:
    secs = int(time.time() - psutil.boot_time())
    days, secs = divmod(secs, 86400)
    hours, secs = divmod(secs, 3600)
    minutes, _ = divmod(secs, 60)
    return f"{days}d {hours}h {minutes}m"


def lan_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return "unknown"


def systemd_active(unit: str) -> bool:
    try:
        out = subprocess.run(
            ["systemctl", "is-active", unit],
            capture_output=True,
            text=True,
            timeout=2,
        )
        return out.stdout.strip() == "active"
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


def cloud_reachable() -> tuple[bool, str]:
    # Render's free tier spins down after inactivity — first cold-start
    # request can take 30-60s. Use a generous timeout so the badge shows
    # the right state even when the cloud is just waking up.
    try:
        r = requests.get(CLOUD_HEALTH_URL, timeout=20)
        if r.ok:
            return True, f"OK ({r.json().get('version', '?')})"
        return False, f"HTTP {r.status_code}"
    except requests.RequestException as e:
        return False, str(e)


def tail_packet_log(n: int = 30) -> list[str]:
    if not PACKET_FWD_LOG.exists():
        return []
    try:
        with PACKET_FWD_LOG.open() as f:
            return f.readlines()[-n:]
    except OSError as e:
        return [f"(could not read log: {e})"]


# --- HTTP endpoints ---


@app.get("/health")
def health() -> dict:
    return {"ok": True, "hostname": socket.gethostname()}


@app.get("/status.json")
def status_json() -> dict:
    cloud_ok, cloud_msg = cloud_reachable()
    return {
        "hostname": socket.gethostname(),
        "platform": platform.platform(),
        "lan_ip": lan_ip(),
        "uptime": uptime_human(),
        "boot_time": boot_time_iso(),
        "cpu_percent": psutil.cpu_percent(interval=0.2),
        "memory": {
            "total_mb": psutil.virtual_memory().total // (1024 * 1024),
            "percent": psutil.virtual_memory().percent,
        },
        "disk": {
            "total_gb": psutil.disk_usage("/").total // (1024**3),
            "percent": psutil.disk_usage("/").percent,
        },
        "lora_pkt_fwd_active": systemd_active(PACKET_FWD_SERVICE),
        "cloud_backend": {"reachable": cloud_ok, "message": cloud_msg},
    }


HTML_TEMPLATE = """
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>ZeroSlip — Pi Gateway</title>
<meta http-equiv="refresh" content="5" />
<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    background: #0e0e10;
    color: #eaeaea;
    margin: 0;
    padding: 24px;
    max-width: 760px;
    margin-inline: auto;
  }
  h1 { margin-top: 0; font-weight: 600; }
  h2 { margin-top: 28px; font-weight: 500; color: #a3a3a3; }
  .card {
    background: #1a1a1e;
    border: 1px solid #2a2a30;
    border-radius: 10px;
    padding: 16px;
    margin-bottom: 14px;
  }
  .row { display: flex; justify-content: space-between; padding: 4px 0; }
  .row .k { color: #a3a3a3; }
  .row .v { font-family: ui-monospace, Menlo, Consolas, monospace; }
  .ok { color: #22c55e; }
  .bad { color: #ef4444; }
  pre {
    background: #08080a;
    border: 1px solid #2a2a30;
    border-radius: 8px;
    padding: 12px;
    overflow-x: auto;
    font-size: 12px;
    max-height: 320px;
  }
  .pill {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
  }
  .pill.ok { background: rgba(34,197,94,.15); color: #22c55e; }
  .pill.bad { background: rgba(239,68,68,.15); color: #ef4444; }
  .timestamp { color: #555; font-size: 12px; }
</style>
</head>
<body>
  <h1>BOR Pi Gateway</h1>
  <div class="timestamp">refreshes every 5s · {{ now }}</div>

  <h2>System</h2>
  <div class="card">
    <div class="row"><span class="k">Hostname</span><span class="v">{{ s.hostname }}</span></div>
    <div class="row"><span class="k">LAN IP</span><span class="v">{{ s.lan_ip }}</span></div>
    <div class="row"><span class="k">Uptime</span><span class="v">{{ s.uptime }}</span></div>
    <div class="row"><span class="k">CPU</span><span class="v">{{ "%.0f"|format(s.cpu_percent) }}%</span></div>
    <div class="row"><span class="k">Memory</span><span class="v">{{ s.memory.percent }}% of {{ s.memory.total_mb }} MB</span></div>
    <div class="row"><span class="k">Disk</span><span class="v">{{ s.disk.percent }}% of {{ s.disk.total_gb }} GB</span></div>
  </div>

  <h2>LoRa Gateway</h2>
  <div class="card">
    <div class="row">
      <span class="k">Packet forwarder</span>
      {% if s.lora_pkt_fwd_active %}
        <span class="pill ok">RUNNING</span>
      {% else %}
        <span class="pill bad">NOT RUNNING</span>
      {% endif %}
    </div>
    <div class="row"><span class="k">Service unit</span><span class="v">{{ pkt_fwd_service }}</span></div>
  </div>

  <h2>Cloud Backend</h2>
  <div class="card">
    <div class="row">
      <span class="k">Reachable</span>
      {% if s.cloud_backend.reachable %}
        <span class="pill ok">YES — {{ s.cloud_backend.message }}</span>
      {% else %}
        <span class="pill bad">NO — {{ s.cloud_backend.message }}</span>
      {% endif %}
    </div>
    <div class="row"><span class="k">URL</span><span class="v">{{ cloud_url }}</span></div>
  </div>

  {% if log_lines %}
    <h2>Recent packet-forwarder log</h2>
    <div class="card">
      <pre>{% for line in log_lines %}{{ line }}{% endfor %}</pre>
    </div>
  {% endif %}
</body>
</html>
"""


@app.get("/")
def index() -> str:
    s = status_json()
    return render_template_string(
        HTML_TEMPLATE,
        s=s,
        log_lines=tail_packet_log(30),
        cloud_url=CLOUD_HEALTH_URL,
        pkt_fwd_service=PACKET_FWD_SERVICE,
        now=datetime.now(tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
    )


if __name__ == "__main__":
    app.run(host=HOST, port=PORT)
