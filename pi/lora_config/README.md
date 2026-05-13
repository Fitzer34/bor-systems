# LoRa packet forwarder configuration

This folder will hold the Semtech UDP packet forwarder config (`global_conf.json`) for the LoRa concentrator you end up using. The config is hardware-specific.

## Recommended hat: RAK2287 (USB) on Pi 5

When the concentrator arrives:

```sh
# Install RAK's pre-built packet forwarder
cd ~
git clone https://github.com/RAKWireless/rak_common_for_gateway
cd rak_common_for_gateway
sudo ./install.sh   # menu — pick "RAK2287 USB" → EU868
```

The RAK installer drops a working `global_conf.json` at
`/opt/ttn-gateway/dev/global_conf.json` or similar (the exact path depends on RAK's release). It also installs and starts the `ttn-gateway.service` systemd unit.

To make BOR's status page recognise it as the LoRa daemon, set this env var in `/etc/systemd/system/bor-status.service.d/override.conf`:

```ini
[Service]
Environment=BOR_PKT_FWD_SERVICE=ttn-gateway
```

Then `sudo systemctl daemon-reload && sudo systemctl restart bor-status`.

## Point it at your gateway in The Things Stack

1. Sign up at https://eu1.cloud.thethings.industries (free Community tier, EU region)
2. Create a new gateway with the **Gateway EUI** printed on the back of your RAK2287
3. Pick the **EU 863-870 MHz** frequency plan
4. Note the **server address**: `eu1.cloud.thethings.industries`
5. Edit `/opt/ttn-gateway/dev/global_conf.json` so the `gateway_conf.server_address` matches
6. Restart the service: `sudo systemctl restart ttn-gateway`

The gateway should show as **online** in TTS within ~30 seconds.

## Wiring to the BOR backend

1. In TTS, go to your **Application** → **Webhooks** → **Add webhook**
2. Use the "Custom webhook" format
3. **Base URL**: `https://bor-systems-backend.onrender.com`
4. **Uplink message** endpoint: `/webhook/tts`
5. **Headers**: add `X-BOR-Secret` with the value from Render's `TTS_WEBHOOK_SECRET` env var
6. Save

Every uplink your hangers send now flows: hanger → Pi LoRa hat → packet forwarder → TTS → BOR backend webhook → database → push notifications → web/iOS dashboards.
