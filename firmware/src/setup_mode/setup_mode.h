// BLE Wi-Fi onboarding — C++ port of pi/setup_mode.py.
//
// Runs on first boot (and whenever the user requests re-onboarding by long-
// pressing the test button). Advertises a GATT service that the Zero Slip Systems
// iOS app connects to, receives Wi-Fi SSID + password over an encrypted-
// authenticated BLE link, joins the network, persists the credentials, and
// hands control back to the main firmware loop.
//
// UUIDs MUST stay byte-compatible with the iOS HangerSetupView constants and
// with pi/setup_mode.py — the iPhone app works unchanged whether it's
// talking to a Pi or a Heltec.
#pragma once

#include <Arduino.h>

namespace SetupMode {

// Start advertising the BOR setup GATT service. Blocks until the customer
// has written credentials AND those credentials successfully join Wi-Fi.
// Returns true on success (credentials saved, ready for normal operation),
// false on user cancel or unrecoverable error.
//
// Caller is expected to deinit BLE / restart after this returns — we leave
// the radio configured but stopped to free the chip for Wi-Fi.
bool run();

// 6-digit numeric passkey derived deterministically from the BT MAC. Same
// derivation as pi/setup_mode.py — so the same hanger label can be reused.
// The customer types this when iOS prompts for pairing.
String pairingPin();

// Device name advertised over BLE, e.g. "BOR-Setup-A3F2" — the iOS app
// scans for the "BOR-Setup-" prefix.
String deviceName();

}  // namespace SetupMode
