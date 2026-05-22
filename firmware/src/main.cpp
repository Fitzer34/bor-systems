// HazardLink firmware — entry point.
//
// Mode is selected by build flag (see platformio.ini). The unused mode's code
// is excluded by the preprocessor so the binary stays small. One repo, three
// SKUs.

#include <Arduino.h>

#if defined(BOR_MODE_HANGER)
  #include "hanger/hanger.h"
#elif defined(BOR_MODE_GATEWAY)
  #include "gateway/gateway.h"
#elif defined(BOR_MODE_HANGER_WIFI)
  #include "hanger/hanger_wifi.h"
#else
  #error "Build with one of: -DBOR_MODE_HANGER, -DBOR_MODE_GATEWAY, -DBOR_MODE_HANGER_WIFI"
#endif

void setup() {
    Serial.begin(115200);
    delay(50);  // let USB CDC enumerate
    Serial.println();
    Serial.println(F("=== HazardLink firmware ==="));
    Serial.printf("build: v%d.%d  mode: ", FW_MAJOR, FW_MINOR);
#if defined(BOR_MODE_HANGER)
    Serial.println(F("hanger (battery / LoRa)"));
    Hanger::setup();
#elif defined(BOR_MODE_GATEWAY)
    Serial.println(F("gateway (mains / LoRa rx + WiFi forward)"));
    Gateway::setup();
#elif defined(BOR_MODE_HANGER_WIFI)
    Serial.println(F("hanger_wifi (mains / WiFi direct)"));
    HangerWifi::setup();
#endif
}

void loop() {
#if defined(BOR_MODE_HANGER)
    Hanger::loop();
#elif defined(BOR_MODE_GATEWAY)
    Gateway::loop();
#elif defined(BOR_MODE_HANGER_WIFI)
    HangerWifi::loop();
#endif
}
