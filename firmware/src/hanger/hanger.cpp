#include "hanger.h"
#include "../battery.h"
#include "../config/nvs_store.h"
#include "../display.h"
#include "../lora_link.h"
#include "../setup_mode/setup_mode.h"
#include "../../include/pinout.h"

#include <Arduino.h>
#include <esp_sleep.h>

namespace {

// Heartbeat cadence on battery: once an hour balances "online indicator stays
// fresh" against battery life. ~24 months on a 5000 mAh 21700.
constexpr uint64_t HEARTBEAT_INTERVAL_US = 60ULL * 60ULL * 1000000ULL;

// Heartbeat cadence on USB power: once a minute — same as the gateway. We're
// not battery-constrained, and a 60 s "still alive" cadence makes the
// dashboard's Online/Offline badge useful during install + bench testing.
constexpr uint32_t USB_HEARTBEAT_INTERVAL_MS = 60UL * 1000UL;

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

LoraLink::EventType currentEventType() {
    const uint8_t pct = Battery::readPercent();
    const bool signPresent = digitalRead(Pinout::HALL_SENSOR_PIN) == LOW;
    if (pct <= LOW_BATTERY_PCT && !Battery::isCharging()) {
        return LoraLink::EventType::LowBattery;
    }
    if (!signPresent) return LoraLink::EventType::Lifted;
    return LoraLink::EventType::Heartbeat;
}

void sendCurrentState() {
    const uint8_t pct   = Battery::readPercent();
    const uint8_t flags = flagsForUplink();
    LoraLink::sendEvent(currentEventType(), pct, flags);
}

/// 4-line OLED status display. Used during install + bench testing while
/// the hanger is USB-powered. Refreshes ~once a second.
void showHangerStatus(uint32_t lastEventMs, LoraLink::EventType lastEvent) {
    const String devEui = Config::getDevEui();
    const String suffix = devEui.length() >= 4
                              ? devEui.substring(devEui.length() - 4)
                              : devEui;
    const uint8_t pct = Battery::readPercent();
    const bool charging = Battery::isCharging();
    const bool signPresent = digitalRead(Pinout::HALL_SENSOR_PIN) == LOW;

    char l1[32], l2[32], l3[32], l4[32];
    snprintf(l1, sizeof(l1), "HazardLink Hanger");
    snprintf(l2, sizeof(l2), "ID %s  %s",
             suffix.c_str(),
             charging ? "USB" : "BATT");
    snprintf(l3, sizeof(l3), "Battery %d%%  Sign %s",
             pct, signPresent ? "ON" : "LIFTED");

    // Bottom line shows time since last LoRa send + the event type.
    const char* evtName = "—";
    switch (lastEvent) {
        case LoraLink::EventType::Lifted:          evtName = "lifted";        break;
        case LoraLink::EventType::Returned:        evtName = "returned";      break;
        case LoraLink::EventType::Heartbeat:       evtName = "heartbeat";     break;
        case LoraLink::EventType::LowBattery:      evtName = "low_batt";      break;
        case LoraLink::EventType::CleaningStarted: evtName = "cleaning";      break;
    }
    if (lastEventMs == 0) {
        snprintf(l4, sizeof(l4), "Last —");
    } else {
        const uint32_t agoSec = (millis() - lastEventMs) / 1000;
        snprintf(l4, sizeof(l4), "Last %s %lus ago",
                 evtName, (unsigned long)agoSec);
    }

    Display::showStatus(l1, l2, l3, l4);
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
        ESP.restart();
    }

    if (!LoraLink::begin()) {
        log_e("LoRa init failed — sleeping 60s and retrying");
        esp_sleep_enable_timer_wakeup(60ULL * 1000000ULL);
        esp_deep_sleep_start();
    }

    // Always show the OLED briefly on boot — visible feedback to the
    // installer that the hanger came up. If we end up going to deep sleep
    // below (battery mode), the rail gets cut there.
    Display::begin();
    sendCurrentState();
}

void loop() {
    // ── USB-powered path ──
    //
    // Stay awake, keep the OLED lit, refresh status once a second, send a
    // LoRa heartbeat once a minute. Reacts to Hall sensor edges immediately
    // by firing a Lifted / Returned event. Useful during bench testing +
    // first-install commissioning so the customer can see the device is
    // alive and reacting.
    if (Battery::isCharging()) {
        static uint32_t lastSendMs    = millis();
        static uint32_t lastDispMs    = 0;
        static uint32_t lastEventMs   = millis();
        static LoraLink::EventType lastEvent = currentEventType();
        static bool prevSignPresent   = digitalRead(Pinout::HALL_SENSOR_PIN) == LOW;

        // Edge-detect sign-on-hook changes for instant push.
        const bool signPresent = digitalRead(Pinout::HALL_SENSOR_PIN) == LOW;
        if (signPresent != prevSignPresent) {
            prevSignPresent = signPresent;
            lastEvent = signPresent ? LoraLink::EventType::Returned
                                    : LoraLink::EventType::Lifted;
            LoraLink::sendEvent(lastEvent, Battery::readPercent(), flagsForUplink());
            lastEventMs = millis();
            lastSendMs  = millis();
        }

        // Scheduled heartbeat.
        if (millis() - lastSendMs >= USB_HEARTBEAT_INTERVAL_MS) {
            lastEvent = currentEventType();
            LoraLink::sendEvent(lastEvent, Battery::readPercent(), flagsForUplink());
            lastEventMs = millis();
            lastSendMs  = millis();
        }

        // Refresh the OLED ~once a second.
        if (millis() - lastDispMs > 1000) {
            lastDispMs = millis();
            showHangerStatus(lastEventMs, lastEvent);
        }

        delay(20);  // yield, keep watchdog happy
        return;
    }

    // ── Battery path ──
    //
    // Already sent one packet from setup(). Time to sleep. We never enter
    // a "real" loop body here — the hanger's main work happens in setup()
    // after each wake from deep sleep.
    enterDeepSleep();
}

}  // namespace Hanger
