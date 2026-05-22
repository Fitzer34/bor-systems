# Zero Slip Systems — Roadmap

Updated 2026-05-20

**Legend:** ✅ done · 🚧 in progress · 📦 scaffolded · 🔜 next · ⏸️ blocked · 💤 future

---

## Project mind map

```
BOR SYSTEMS
│
├─── 🔧 HARDWARE
│    ├── 📡 Hanger (Heltec V3 + 21700 cell + Hall sensor + antenna)
│    ├── 🚩 Sign tag (DWM3001 UWB + CR2032 + magnet)
│    ├── 🌐 Gateway (Heltec V3, mains-powered)
│    └── ⚡ Charging dock (Anker hub + 3D-printed cradle)
│
├─── 💾 FIRMWARE
│    ├── 🐍 Pi Python (legacy — still in field)
│    ├── ⚙️ Heltec C++ (OTA, HMAC, ACK, OLED, BLE setup)
│    └── 📍 UWB tag firmware (DWM3001 — waiting on dev kit)
│
├─── ☁️ BACKEND (Node + Fastify + Postgres on Render)
│    ├── Multi-tenant, JWT auth, HMAC webhooks, rate-limited
│    ├── APNs + FCM push, real-time SSE
│    ├── Sign-tags API, status endpoint, Sentry monitoring
│    └── 💤 Stripe billing
│
├─── 📱 iOS (Swift + SwiftUI)
│    ├── Phone app: all admin + cleaner views, BLE setup
│    ├── Apple Watch: active alerts, I'm on it / It's done
│    └── Find Sign: UWB NearbyInteraction (waiting on hardware)
│
├─── 🤖 ANDROID (Kotlin + Compose)
│    ├── Phone app: scaffold + login + active alerts
│    └── Wear OS: scaffold
│
├─── 💻 WEB (React + Vite)
│    ├── All admin features + floor plans + real-time
│    └── Mobile-responsive + status page
│
└─── 🏢 BUSINESS
     ├── 🛡️ ToS, Privacy, insurance, patent
     ├── 📦 Apple + Google Play developer accounts
     ├── 🏭 Factory QC rig, PCBA partner, enclosure tooling
     └── 💳 Stripe + pricing + support
```

---

## Next 7 days

- [ ] Order Qorvo DWM3001CDK dev kits ×2 from Mouser (~€160)
- [ ] Google Play Developer Account ($25)
- [ ] Finish Apple Watch install issue (delete + reinstall via iPhone Watch app)
- [ ] Email FRKelly about patent provisional

## Next 2 weeks

- [ ] Email Irish solicitor for ToS + Privacy Policy (~€500)
- [ ] Android Batch 2 — port remaining iOS screens
- [ ] Apply for public liability insurance
- [ ] Create Firebase project for FCM push

## When DWM3001 dev kits arrive

- [ ] Write tag firmware (BLE + UWB ranging + sleep states)
- [ ] End-to-end Find Sign demo
- [ ] Decide commit/abandon on UWB path

## When Heltec V3 boards arrive

- [ ] Flash hanger + gateway firmware
- [ ] Real LoRa range testing in target building
- [ ] Build factory QC rig

## 1–3 months

- [ ] First pilot customer (small office, friendly install)
- [ ] App Store submission
- [ ] Play Store submission
- [ ] Stripe billing integration
- [ ] Custom UWB PCB design (hardware contractor)

## 3–6 months

- [ ] First production batch (20–50 hangers, 50+ tags)
- [ ] Public launch
- [ ] First paying customer

---

## Critical path to first paying customer

```
[Heltec boards arrive] ──┐
                         ├──► [Pilot install at friendly site]
[Pilot customer found] ──┘
        │
        ▼
[App Store + Play Store live]
        │
        ▼
[Stripe + ToS + insurance]
        │
        ▼
[First paying customer]   ←  realistic in 2-3 months
```

UWB precision finding is a wow-factor sales tool but NOT on the critical path.
The product can ship + sell without it; UWB becomes a premium upgrade later.
