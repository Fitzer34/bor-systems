// Gateway main loop — mains-powered, receives LoRa from all hangers in the
// building, forwards each event to the backend webhook over Wi-Fi.
//
// On boot:
//   1. Init config, Wi-Fi, LoRa
//   2. If not onboarded → BLE setup mode (same flow as a hanger)
//   3. Connect to Wi-Fi
//   4. Start continuous LoRa RX
//   5. Loop: poll for packets, POST to /webhook/tts, repeat
#pragma once

namespace Gateway {

void setup();
void loop();

}  // namespace Gateway
