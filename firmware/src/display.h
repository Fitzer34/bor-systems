// On-board 0.96" OLED display (SSD1306, 128×64) — visible without a phone.
//
// Used sparingly:
//   - During BLE setup: shows "PAIR: 123456" so the customer can read the
//     PIN off the unit without us having to put a sticker on every hanger.
//   - During normal operation on hangers: usually OFF (Vext rail cut to
//     save battery), briefly ON via the test button to show battery %.
//   - Always on for gateways: shows uptime + packets-rx counter.
//
// Vext (GPIO 36) gates the OLED's 3.3 V rail. Drive LOW to power on, HIGH
// to power off (saves ~20 mA quiescent).
#pragma once

#include <Arduino.h>

namespace Display {

void begin();
void on();
void off();

// Show a single line centered on the screen — used for the pairing PIN.
void showLarge(const String& text);

// Show a 4-line status frame.
void showStatus(const String& line1, const String& line2,
                const String& line3, const String& line4);

}  // namespace Display
