// Over-the-air firmware updates over HTTPS.
//
// Customers shouldn't need to touch a hanger or gateway after install. When
// we ship a bug fix or new feature, the device pulls the new firmware from
// the cloud and reboots into it on its next heartbeat.
//
// Flow:
//   1. Device boots, joins Wi-Fi (gateway) or wakes for heartbeat (hanger
//      mains-only — battery hangers check OTA once per week to save power).
//   2. GET /firmware/manifest?model=heltec_v3&channel=stable&current=v0.2
//   3. If manifest reports a newer version, GET the .bin URL and stream it
//      through esp_https_ota → automatic flash → reboot.
//   4. If the new firmware doesn't manage to mark itself "valid" within the
//      first 60 seconds of running, the bootloader rolls back to the
//      previous slot. So a bad release can't brick a fleet — the worst case
//      is one missed reboot window.
#pragma once

#include <Arduino.h>

namespace Ota {

struct Manifest {
    String version;     // e.g. "v0.3.1"
    String binaryUrl;   // direct https URL to the .bin
    String sha256;      // optional — verified post-download if present
    bool   mandatory;   // skip the channel check, install now
};

// Pull the latest manifest from the cloud. Returns true + fills *out* on
// success. Returns false silently (and logs a warning) if the network is
// down or the manifest can't be parsed — we'd rather skip an update than
// reboot into an unknown state.
bool fetchManifest(const String& model, const String& channel,
                   const String& currentVersion, Manifest* out);

// Decide whether to apply a manifest based on a simple semantic compare.
// Returns true if `manifest.version` is strictly newer than `currentVersion`
// in lexicographic-after-strip-v order (good enough for our v0.X.Y scheme).
bool shouldApply(const String& currentVersion, const Manifest& m);

// Stream the binary down via esp_https_ota and reboot. Blocks. Returns
// only on failure (success → reboot, no return). Logs progress every 64 KB.
bool applyUpdate(const Manifest& m);

// Convenience: fetch manifest, decide, apply. Call this once after Wi-Fi is
// up on the gateway (and on the mains-powered hanger_wifi), and weekly on
// the battery hanger.
void checkAndApply(const String& model, const String& channel);

// Call once during setup AFTER the new image has done basic sanity checks
// (e.g. Wi-Fi joined OK, LoRa init OK). Marks the running image as "good"
// so the bootloader stops rolling back. If we never call this, the next
// reboot reverts to the previous slot — exactly what we want for a bad
// firmware that crashes on boot.
void markRunningImageGood();

}  // namespace Ota
