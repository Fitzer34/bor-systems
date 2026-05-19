#include "hanger.h"
#include "../battery.h"
#include "../config/nvs_store.h"
#include "../lora_link.h"
#include "../setup_mode/setup_mode.h"
#include "../../include/pinout.h"

#include <Arduino.h>
#include <esp_sleep.h>

namespace {

// Heartbeat cadence. Once an hour balances "online indicator stays fresh"
// against battery life. See the BOM analysis: 1h cadence + 5000 mAh cell
// = ~24 months between charges.
constexpr uint64_t HEARTBEAT_INTERVAL_US = 60ULL * 60ULL * 1000000ULL;

// Threshold for sending an EVT_LOW_BATTERY (1-shot) ahead of the scheduled
// heartbeat. Kept aggressive — the cloud already has the % from every
// heartbeat, this is a "wake the operator up" signal.
constexpr uint8_t LOW_BATTERY_PCT = 15;

void enterDeepSleep() {
    log_i("entering deep sleep");
    Serial.flush();

    // Wake on EXT0 (Hall sensor edge) OR timer.
    esp_sleep_enable_ext0_wakeup(
        static_cast<gpio_num_t>(Pinout::HALL_SENSOR_PIN),
        /*level=*/!digitalRead(Pinout::HALL_SENSOR_PIN));  // wake on change
    esp_sleep_enable_timer_wakeup(HEARTBEAT_INTERVAL_US);

    // Cut the Vext rail to save the OLED's quiescent draw.
    pinMode(Pinout::VEXT_CTRL, OUTPUT);
    digitalWrite(Pinout::VEXT_CTRL, HIGH);  // HIGH = off on Heltec V3

    esp_deep_sleep_start();
}

uint8_t flagsForUplink() {
    uint8_t f = 0;
    if (Battery::isCharging()) f |= static_cast<uint8_t>(LoraLink::Flags::IsCharging);
    return f;
}

void sendCurrentState() {
    const uint8_t pct   = Battery::readPercent();
    const uint8_t flags = flagsForUplink();
    const bool   signPresent = digitalRead(Pinout::HALL_SENSOR_PIN) == LOW;

    LoraLink::EventType evt;
    if (pct <= LOW_BATTERY_PCT) {
        evt = LoraLink::EventType::LowBattery;
    } else if (!signPresent) {
        evt = LoraLink::EventType::Lifted;
    } else {
        evt = LoraLink::EventType::Heartbeat;
    }

    LoraLink::sendEvent(evt, pct, flags);
}

}  // namespace

namespace Hanger {

void setup() {
    Config::begin();
    Battery::begin();

    pinMode(Pinout::HALL_SENSOR_PIN, INPUT_PULLUP);
    pinMode(Pinout::TEST_BUTTON_PIN, INPUT_PULLUP);

    // Identify the wake reason — first boot vs sensor wake vs timer wake.
    const esp_sleep_wakeup_cause_t wake = esp_sleep_get_wakeup_cause();
    log_i("wake cause: %d  (0=power-on, 2=ext0, 4=timer)", (int)wake);

    // First-time setup: no Wi-Fi yet → BLE onboarding.
    if (!Config::isOnboarded()) {
        log_w("not onboarded — entering BLE setup mode");
        SetupMode::run();
        // SetupMode::run() blocks until success. After it returns we have
        // Wi-Fi credentials saved in NVS. We don't actually need Wi-Fi for
        // normal operation (LoRa is enough) — but having creds means the
        // hanger can do an OTA update later without a re-onboarding.
        ESP.restart();  // clean state for the LoRa-only main loop
    }

    if (!LoraLink::begin()) {
        log_e("LoRa init failed — sleeping 60s and retrying");
        esp_sleep_enable_timer_wakeup(60ULL * 1000000ULL);
        esp_deep_sleep_start();
    }

    // On every wake (regardless of cause) send the current state. The cloud
    // dedupes by event type so duplicate heartbeats are harmless.
    sendCurrentState();
}

void loop() {
    // The hanger's main loop is "sleep, wake briefly, sleep again". We never
    // run a real loop() body — everything happens in setup() and then we go
    // straight back into deep sleep.
    enterDeepSleep();
}

}  // namespace Hanger
