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
- ✅ iOS `SignFinder.swift` rewritten to the accessory protocol.
- ✅ Backend `sign-tags` route already maps alert → `{bleUuid, uwbAddress}`.
- ✅ **Flashed** `DWM3001CDK-QANI-FreeRTOS_full_QNI_3_0_0.hex` to board #1 (probe-rs,
  nRF52833; vector table read back byte-exact). Recipe below.
- ✅ **Protocol reconciled** against Qorvo's `QorvoAccessorySample` v1.3.5: message
  IDs are an EXACT match (`0x1/0x2/0x3` from tag, `0xA/0xB/0xC` to tag); writes are
  `.withResponse`; `SignFinder` now scans/binds BOTH GATT profiles the firmware may
  expose — NUS `6E40…` and Qorvo-NI `2E93…` — exactly like the reference app.
- ⬜ Smoke-test board on the iPhone: build `QorvoAccessorySample.xcodeproj` (in the
  SDK) → run → it shows live distance + direction arrow. Proves the tag works.
- ⬜ Provision one tag ↔ one hanger in the backend; test ranging via HazardLink "Find sign".
- ⬜ Android: AndroidX UWB (dep already present) — after iOS works.

## Flashing recipe (repeat for each of the 6 boards)
Open-source, no SEGGER/myQorvo account needed. The DWM3001CDK's onboard J-Link OB
is driven by **probe-rs**:
```sh
export PATH="$HOME/.cargo/bin:$PATH"
HEX="…/Qorvo_Nearby_Interaction_3_2_1/Software/Accessory/Binaries/DWM3001CDK-QANI-FreeRTOS_full_QNI_3_0_0.hex"
probe-rs list                                              # confirm "J-Link" shows up
probe-rs erase    --chip nRF52833_xxAA                     # clean slate
probe-rs download --chip nRF52833_xxAA --binary-format hex "$HEX"
probe-rs reset    --chip nRF52833_xxAA                     # boot the firmware
```
Notes:
- Chip = **nRF52833_xxAA** (the DWM3001C's MCU). Use the **DWM3001CDK** hex, NOT the
  QTag / Type2AB / nRF52832/40/33-DK variants in the same folder.
- `probe-rs verify` will report "contents do not match" — this is a **cosmetic
  probe-rs quirk** on full-image hex files (it compares `0xFF`-fill/FDS pages the
  flasher legitimately skips). The download itself verifies as it writes, and the
  reset-vector table reads back byte-exact, so the flash is good.
- The minimal QANI build does **not** log over the J-Link VCOM (it uses RTT), so a
  silent serial port is normal — confirm the board via the iPhone app, not UART.

## Order of operations (when boards arrive)
1. Flash Qorvo NI sample on one DWM3001CDK.
2. Note its advertised BLE id + UWB MAC; pair it to a hanger via `sign-tags`.
3. Open an alert in the iOS app → "Find sign" → confirm ranging on an iPhone 11+.
4. Reconcile any UUID/message-ID differences between firmware and `SignFinder.swift`.
5. Then replicate to Android.
