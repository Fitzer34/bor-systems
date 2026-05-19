// Battery-powered hanger main loop.
//
// On boot:
//   1. Init config, battery, sensor, LoRa
//   2. If not onboarded → enter BLE setup mode (blocks until Wi-Fi config
//      received). Wi-Fi is only used for the BLE setup confirmation; once
//      onboarded the hanger talks LoRa-only to save battery.
//   3. Send a "boot heartbeat" so the cloud knows we just came up.
//   4. Configure ULP wake-up on Hall sensor edge + RTC timer.
//   5. Deep sleep until either:
//        - the sensor changes (sign lifted / returned), or
//        - the heartbeat timer expires (default 1 hour).
//   6. On wake → send the appropriate LoRa event → back to sleep.
#pragma once

namespace Hanger {

void setup();
void loop();

}  // namespace Hanger
