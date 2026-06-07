# UWB "Find Sign" — implementation plan

AirTag-style precision finding: walk straight to the lifted sign. Phase-2
feature — **not required for a first pilot** (the floor-plan view already shows
where the sign is). Costs €0 more to build; boards are already bought.

## Hardware
- **Qorvo DWM3001CDK** dev kit ×6 (DigiKey order #99403445, May 2026).
- DWM3001C = **nRF52833** (BLE + MCU) + **DW3110** (UWB radio), Apple-U1-compatible.

## The key correction (why the old app code wouldn't have worked)
The previous `SignFinder.swift` used `NINearbyPeerConfiguration` + `NIDiscoveryToken`
— that's the **iPhone↔iPhone** model. A DWM3001 is a **third-party accessory**, so
it must use **`NINearbyAccessoryConfiguration`** and Apple's **Nearby Interaction
Accessory Protocol** (the phone and tag exchange Apple "accessory configuration
data" over BLE; a tag can't produce an Apple `NIDiscoveryToken`). Fixed in the
rewrite of `SignFinder.swift`.

## Firmware (the tag) — do NOT write from scratch
Flash **Qorvo's "Nearby Interaction" sample** for the DWM3001 — Qorvo ships it and
it already implements Apple's accessory protocol + UWB ranging.
- Toolchain: **Nordic nRF Connect SDK / SEGGER Embedded Studio** — a SEPARATE
  project from `firmware/` (which is ESP32/PlatformIO). Suggest `firmware-uwb/`.
- Only customization needed: have the tag **advertise a stable ID** we map to a
  hanger/alert (the backend `sign-tags` route already stores `bleUuid` +
  `uwbAddress`). Keep the sample's accessory-protocol handling as-is.
- ⚠️ Can't be flashed/tested until the boards arrive + on a real UWB iPhone (11+).

## The contract both sides implement (Apple accessory protocol)
Transport = **Nordic UART Service (NUS)** — what Qorvo's sample uses:
- Service `6E400001-…`, RX/write `6E400002-…`, TX/notify `6E400003-…`
- phone → tag: `0x0A` initialize · `0x0B` configureAndStart(+shareableConfig) · `0x0C` stop
- tag → phone: `0x01` accessoryConfigurationData(+data) · `0x02` uwbDidStart · `0x03` uwbDidStop

Flow: connect → phone sends `initialize` → tag replies `accessoryConfigurationData`
→ phone builds `NINearbyAccessoryConfiguration(data:)` and runs the `NISession` →
`didGenerateShareableConfigurationData` fires → phone sends `configureAndStart` with
that blob → tag starts UWB → ranging callbacks stream distance/direction.
*(Confirm exact UUIDs/message-IDs against the flashed Qorvo sample — they're defined there.)*

## What's done vs. to do
- ✅ iOS `SignFinder.swift` rewritten to the accessory protocol (this commit).
- ✅ Backend `sign-tags` route already maps alert → `{bleUuid, uwbAddress}`.
- ⬜ Flash Qorvo NI sample on a DWM3001CDK (when boards arrive); confirm UUIDs.
- ⬜ Provision one tag ↔ one hanger in the backend; test ranging on a UWB iPhone.
- ⬜ Android: AndroidX UWB (dep already present) — after iOS works.

## Order of operations (when boards arrive)
1. Flash Qorvo NI sample on one DWM3001CDK.
2. Note its advertised BLE id + UWB MAC; pair it to a hanger via `sign-tags`.
3. Open an alert in the iOS app → "Find sign" → confirm ranging on an iPhone 11+.
4. Reconcile any UUID/message-ID differences between firmware and `SignFinder.swift`.
5. Then replicate to Android.
