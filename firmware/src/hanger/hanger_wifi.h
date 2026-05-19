// Mains-powered Wi-Fi-only hanger.
//
// Same product, different deployment model: for customers with great Wi-Fi
// everywhere who don't want a separate gateway box. The hanger plugs into
// USB-C mains, talks directly to the cloud over Wi-Fi, sends a heartbeat
// every 5 seconds (since we don't have to conserve battery).
//
// Re-uses the same BLE setup flow for first-boot Wi-Fi onboarding.
#pragma once

namespace HangerWifi {

void setup();
void loop();

}  // namespace HangerWifi
