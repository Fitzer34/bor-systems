// Persistent configuration in ESP32 NVS (non-volatile storage in flash).
//
// Replaces the Pi's `/etc/bor-hanger.env` file. Stores Wi-Fi credentials, the
// DevEUI, the backend webhook URL + secret, and the "have we completed first-
// time setup" sentinel. Survives power loss and reboots; cleared by a factory
// reset (long-press the test button).
#pragma once

#include <Arduino.h>

namespace Config {

// Initialise the NVS namespace. Call once from setup() before any other
// Config:: function. Safe to call multiple times.
void begin();

// ─── Wi-Fi credentials (written via BLE during first-boot onboarding) ───────
String getWifiSsid();
String getWifiPassword();
void   saveWifiCredentials(const String& ssid, const String& password);

// ─── Device identity ────────────────────────────────────────────────────────
// 16-hex-char DevEUI, derived once from the ESP32's factory MAC + a random
// nibble on first boot. Stable across reboots.
String getDevEui();

// ─── Backend connection (hard-coded at factory but overridable) ─────────────
String getWebhookUrl();
String getWebhookSecret();
void   setWebhookConfig(const String& url, const String& secret);

// ─── Onboarding sentinel ────────────────────────────────────────────────────
// True once Wi-Fi credentials have been saved and successfully tested. Used by
// hanger boot to decide between "enter BLE setup mode" and "go straight to
// normal operation".
bool isOnboarded();
void setOnboarded(bool onboarded);

// ─── Factory reset ──────────────────────────────────────────────────────────
// Wipe Wi-Fi creds + onboarded flag. Preserves DevEUI (that stays with the
// hardware for its lifetime). Used by the long-press-the-test-button reset
// trigger to re-enter BLE setup mode (e.g. customer changes router).
void factoryReset();

}  // namespace Config
