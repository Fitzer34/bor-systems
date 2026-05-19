// Battery percentage + charging state for Heltec V3.
//
// The board has a 390k/100k voltage divider from VBAT to GPIO 1, gated by
// VBAT_CTRL (GPIO 37). We only enable the divider for a few ms per reading,
// otherwise the divider itself burns ~9µA continuously.
//
// USB VBUS sense (GPIO 4) tells us whether the board is plugged in — that's
// the "is_charging" flag we send to the cloud.
#pragma once

#include <cstdint>

namespace Battery {

// One-time pin setup. Call from setup().
void begin();

// Battery voltage in volts (4.20 max, ~3.30 cutoff). Reads in ~1 ms.
float readVoltage();

// Battery percentage 0–100, using a LiPo discharge curve (not linear).
// 4.20 V → 100, 3.30 V → 0. Averaged across 32 ADC samples to denoise.
uint8_t readPercent();

// True if USB power is present (board is charging or running on USB).
bool isCharging();

}  // namespace Battery
