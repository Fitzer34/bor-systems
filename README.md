# HazardLink

IoT wet-floor-sign hangers that notify cleaners when a sign is lifted, with floor + zone, via mobile and web apps.

Full requirements live in [SPEC.md](SPEC.md).

## Repository layout

```
bor-systems/
├── SPEC.md                Product + technical requirements
├── docker-compose.yml     Local Postgres for development
├── backend/               Node.js + Fastify API, Postgres, FCM/SMS/email dispatch
├── web/                   Vite + React admin/dashboard
├── mobile/                Expo (React Native) iOS + Android app
├── firmware/              PlatformIO sketch for the RAK3172/STM32WLE5 hanger node
└── shared/                Code shared across components (LoRaWAN payload codec)
```

## Stack

| Layer | Choice |
|---|---|
| Backend | Node.js 20+, Fastify, TypeScript, Postgres, Drizzle ORM |
| Web | Vite, React, TypeScript, Tailwind, React Query, React Router |
| Mobile | Expo (React Native), TypeScript, React Navigation |
| Firmware | PlatformIO, Arduino framework, STM32WLE5 (RAK3172) |
| LoRaWAN network server | The Things Stack (Community for prototype) |
| Push | Firebase Cloud Messaging |
| SMS | Twilio |
| Email | SMTP (SES, Mailgun, etc.) |

## Getting started — local

### 1. Postgres

```sh
docker compose up -d
```

### 2. Backend

```sh
cd backend
cp .env.example .env
# Edit .env: set JWT_SECRET to something long and random, set TTS_WEBHOOK_SECRET.
# FCM/Twilio/SMTP creds optional — without them, alerts are recorded but not delivered.
npm install
psql "$DATABASE_URL" -f migrations/0001_init.sql      # one-time
npm run db:seed                                       # creates admin user + sample building/floors/zones
npm run dev
```

The backend listens on `:3000`. Default admin credentials are printed by `db:seed`.

### 3. Web dashboard

```sh
cd web
npm install
npm run dev
```

Opens at `http://localhost:5173`. The Vite dev server proxies `/api` to the backend.

### 4. Mobile app

```sh
cd mobile
npm install
npm start
```

Set `expo.extra.apiBaseUrl` in [`mobile/app.json`](mobile/app.json) to your machine's LAN IP so a device on the same WiFi can reach the backend (`localhost` won't work from a phone). Open the Expo Go app and scan the QR code.

## End-to-end test (no hardware)

You can simulate a hanger uplift without a real hanger by POSTing to the webhook:

```sh
# Encode payload: byte0=event(1=lifted), byte1=battery(85), byte2=fw(0x01=v0.1), byte3=flags(0)
PAYLOAD=$(printf '\x01\x55\x01\x00' | base64)

curl -X POST http://localhost:3000/webhook/tts \
  -H "Content-Type: application/json" \
  -H "X-BOR-Secret: $TTS_WEBHOOK_SECRET" \
  -d "{\"end_device_ids\":{\"dev_eui\":\"0011223344556677\"},\"uplink_message\":{\"f_port\":1,\"frm_payload\":\"$PAYLOAD\"}}"
```

Then send a `returned` event:

```sh
PAYLOAD=$(printf '\x02\x55\x01\x00' | base64)
curl -X POST http://localhost:3000/webhook/tts ...   # same headers, with the new payload
```

Register the hanger DevEUI in the **Hangers** page first, with a zone, so the alert has somewhere to go.

## Build phases

1. **Prototype:** 1 gateway + 2 hangers + this stack running locally — prove end-to-end alert path.
2. **Pilot:** 12 hangers, real install in target building, host backend on EU infra, real FCM/Twilio/SMTP creds.
3. **Production:** custom PCB, hardened backend, deployment to additional buildings.

## Deployment options

The backend and web are deployed to **Render** (see `render.yaml`) — tagged at `v0.1-cloud-deploy` for safe rollback. For the in-building **LoRaWAN gateway**, two options:

- **RAK7268V2** — turnkey hardware gateway (£170)
- **Raspberry Pi 5 + LoRa concentrator hat** — DIY, ~£100. Setup scripts and a status server live in [`pi/`](pi/README.md).

The Pi is a drop-in replacement for the dedicated gateway. The cloud backend is unchanged.

## Status

Functional end-to-end software stack. **Not yet tested with hardware** because no hangers exist yet. The webhook is shaped to accept The Things Stack uplinks; the firmware sketch is complete except for the LoRaWAN join + send and STM32 sleep calls, which need to be wired against the RAK3172 SDK once a board is in hand.
