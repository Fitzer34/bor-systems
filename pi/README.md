# BOR Systems — Raspberry Pi 5

This folder contains everything for running a **Raspberry Pi 5 as the in-building LoRaWAN gateway** for BOR Systems. The Pi receives radio packets from the wet-floor-sign hangers and forwards them to the cloud backend (the rest of the system — backend, database, web dashboard — stays on Render).

If you ever want to fully self-host (Pi runs backend + DB too), see [self-host notes](#fully-self-hosted-option) at the bottom.

## What you need

- A **Raspberry Pi 5** (4 GB is plenty) with power supply
- A **microSD card** (32 GB+ recommended)
- A **LoRa concentrator hat or USB stick** for EU868 — e.g. RAK2287 USB or RAK5146 PCIe
- The Pi connected to your office network (WiFi or Ethernet)
- Your Mac on the same WiFi for the initial setup

## 1. Flash Raspberry Pi OS with WiFi pre-configured

This is the trick to skipping monitor/keyboard setup — you preset the WiFi and SSH credentials at flash time.

1. Download **Raspberry Pi Imager**: https://www.raspberrypi.com/software/
2. Insert the SD card, open Imager
3. **Choose Device** → Raspberry Pi 5
4. **Choose OS** → Raspberry Pi OS (64-bit) (Bookworm or newer)
5. **Choose Storage** → your SD card
6. Click **Next**, then **Edit Settings** when it asks "Would you like to apply OS customisation?"
7. In the General tab:
   - **Hostname**: `borpi` (we'll use this as `borpi.local`)
   - **Username**: `owen` (or whatever)
   - **Password**: pick something
   - **Configure wireless LAN**: tick this, enter your home/office WiFi SSID + password, country `IE` (or `GB`)
   - **Set locale**: Europe/Dublin (or your timezone)
8. In the **Services** tab:
   - ☑ Enable SSH → **Use password authentication**
9. Click **Save**, then **Yes** to apply, **Yes** to erase the SD card

Imager flashes everything in ~5 minutes. When it's done, **insert the SD card into the Pi 5, plug in power**, and walk away for 90 seconds while it boots.

## 2. Connect to the Pi from your Mac

From a Terminal on your Mac:

```sh
ssh owen@borpi.local
```

(Replace `owen` if you used a different username. The `.local` suffix uses macOS's built-in mDNS — works out of the box.)

If `borpi.local` doesn't resolve, run our helper to find the Pi by IP:

```sh
python3 ~/Downloads/bor-systems/pi/find_pi.py
```

It scans your local network and prints the Pi's IP address.

You should now see a prompt like `owen@borpi:~$`. **You're on the Pi over WiFi.**

## 3. Install BOR Systems on the Pi

On the Pi (i.e. through the SSH session you just opened):

```sh
sudo apt update && sudo apt install -y git python3-pip
git clone https://github.com/Fitzer34/bor-systems.git
cd bor-systems/pi
sudo python3 install.py
```

The installer:

- Installs build tools and Python deps
- Sets up a small Flask **status server** on port 8080 (you can hit it from any browser on the same WiFi at `http://borpi.local:8080`)
- Registers it as a systemd service so it auto-starts on reboot

When the LoRa concentrator hat or USB stick is plugged in, run the gateway-specific configuration step (see `install.py --help`).

## 4. Test it over WiFi

After install.py finishes, on **any device on the same WiFi** (your Mac, your phone), open a browser:

```
http://borpi.local:8080
```

You should see the BOR Pi status page with:

- Pi system info (CPU, memory, uptime)
- Whether the LoRa concentrator is detected
- Last 50 LoRaWAN packets received (when hardware is connected)
- Connection status to the cloud backend

## 5. Send a fake hanger event (works without hardware)

Useful to verify the cloud backend is reachable from the Pi — and to see the full pipeline end-to-end before the real LoRa hardware arrives.

On the Pi (or your Mac):

```sh
cd ~/bor-systems/pi
python3 hanger_sim.py lift --devEui 0011223344556677
# wait a few seconds
python3 hanger_sim.py return --devEui 0011223344556677
```

This POSTs a simulated LoRaWAN uplink to the cloud backend's webhook. If you've registered that DevEUI in your org, you'll see the alert appear in the web dashboard and on the iOS app within 5 seconds.

## Files in this folder

| File | What it does | Where it runs |
|---|---|---|
| `install.py` | Bootstraps the Pi — installs deps, sets up systemd services, configures the status server | Pi |
| `status.py` | Flask app showing Pi/gateway/connection status on port 8080 | Pi |
| `hanger_sim.py` | Sends fake LoRaWAN uplinks to your cloud backend so you can test without hardware | Pi or Mac |
| `find_pi.py` | Scans LAN for the Pi (when `.local` resolution doesn't work) | Mac |
| `requirements.txt` | Python deps (Flask, requests) | Pi |
| `services/bor-status.service` | systemd unit for auto-starting the status server | Pi |
| `lora_config/global_conf.json` | Semtech packet forwarder config for EU868 + RAK2287 | Pi |

## Fully-self-hosted option

If later you decide you want the **whole stack** (backend + DB + web) on the Pi instead of Render, the path is:

1. Run `sudo docker compose up -d` in the repo root on the Pi (uses the existing `docker-compose.yml` for Postgres)
2. Run the backend via `cd backend && npm install && npm run build && node dist/index.js`
3. Build the web app: `cd web && npm install && npm run build`, then serve `web/dist` via the status server's nginx config
4. Optionally: use Cloudflare Tunnel to expose the Pi to the internet (so your iPhone app can reach it from outside the building)

That's more work; the **hybrid (gateway-only)** setup above is recommended for the prototype.
