// Test button — short press vs long press semantics.
//
// SHORT (< 1 s):  starts a planned-cleaning session (existing behaviour;
//                 wired in by the hanger main loop, not here).
// LONG  (≥ 10 s): factory-resets Wi-Fi credentials and reboots, putting the
//                 device back into BLE setup mode. Used when the customer
//                 changes their router. DevEUI is preserved so the cloud
//                 doesn't lose its history.
#pragma once

namespace ButtonHandler {

// One-shot check — call this from the main loop. Returns true on long press
// AFTER it has been released, false otherwise. Internally debounces.
bool checkLongPress();

// Returns true if the button was just released after a short press. Resets
// after returning true (one-shot).
bool consumeShortPress();

}  // namespace ButtonHandler
