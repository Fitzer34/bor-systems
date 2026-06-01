// Hanger discovery beacon — BLE for ONBOARDING ONLY, never for data.
//
// Why this exists: typing a 16-character DevEUI into the phone to register a
// hanger is miserable UX. Instead, for a short window after power-on (and after
// a PRG-button press), the hanger broadcasts a tiny BLE advertisement carrying
// just its DevEUI. The HazardLink app scans, lists "hangers nearby" with signal
// strength, and the installer taps one to register it — no typing.
//
// This does NOT reintroduce the WiFi/BLE-credentials flow we deliberately
// removed from hangers:
//   - It's advertise-only. The phone never connects, never pairs, never writes.
//   - It carries ONE value: the DevEUI (already printed on the OLED, not a
//     secret — the real data path stays HMAC-signed over LoRa).
//   - It runs only during the discoverable window (≈the same window the OLED is
//     lit), then the radio goes quiet. Negligible battery cost.
//
// The actual sensor data path is unchanged: LoRa → gateway → cloud.
#pragma once

#include <Arduino.h>

namespace HangerBeacon {

// Start advertising this hanger's DevEUI over BLE. Idempotent: the first call
// initialises NimBLE; later calls just (re)start advertising. Safe to call
// every loop iteration while the discoverable window is open.
void start(const String& devEui);

// Stop advertising (NimBLE stays initialised so re-start is instant + reliable).
// Call when the discoverable window closes.
void stop();

}  // namespace HangerBeacon
