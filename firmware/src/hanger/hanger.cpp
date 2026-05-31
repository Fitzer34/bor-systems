#include "hanger.h"
#include "../battery.h"
#include "../config/nvs_store.h"
#include "../display.h"
#include "../lora_link.h"
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

// How long the OLED stays lit after a fresh power-on while on battery. Long
// enough for an installer to read the DevEUI off the screen and confirm the
// unit booted + reacts to the sign, then it goes dark to save the cell. On
// USB the screen ignores this and stays on the whole time (bench/commission).
constexpr uint32_t SCREEN_COMMISSION_MS = 60UL * 1000UL;

// How long the OLED stays lit after the PRG button is pressed. The installer
// presses it to read the DevEUI + check the live link strength to the gateway,
// then it goes dark again. "One minute" per the spec.
constexpr uint32_t SCREEN_WAKE_MS = 60UL * 1000UL;

// Set once in setup() from the wake cause: true only on a true power-on (the
// battery was just connected / reset pressed), false on a deep-sleep timer or
// Hall-edge wake. Gates the post-boot screen window so it shows when a unit is
// first powered up, not on every wake.
bool g_freshBoot = true;

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
    // Only treat as low-battery when we have a CONFIDENT low reading
    // (1–LOW_BATTERY_PCT). A reading of exactly 0 almost always means the
    // measurement failed (no cell wired, divider not populated) rather than
    // a genuinely flat pack — a real LiPo would have already hit its cutoff
    // long before reading a true 0. Don't spam low_battery alerts on a
    // measurement glitch.
    if (pct > 0 && pct <= LOW_BATTERY_PCT && !Battery::isCharging()) {
        return LoraLink::EventType::LowBattery;
    }
    if (!signPresent) return LoraLink::EventType::Lifted;
    return LoraLink::EventType::Heartbeat;
}

// Debounced read of the sign sensor (reed switch or Hall). The pin floats
// noisily on a bare board and even a real reed switch bounces for a few ms
// on each open/close. Require the level to be stable across DEBOUNCE_SAMPLES
// consecutive reads before we trust it. Returns true == sign present
// (magnet near == LOW with the internal pull-up).
bool signPresentDebounced() {
    constexpr int DEBOUNCE_SAMPLES = 5;
    constexpr int SAMPLE_GAP_MS    = 8;   // 5 × 8ms ≈ 40ms of stability
    int low = 0, high = 0;
    for (int i = 0; i < DEBOUNCE_SAMPLES; ++i) {
        if (digitalRead(Pinout::HALL_SENSOR_PIN) == LOW) low++; else high++;
        delay(SAMPLE_GAP_MS);
    }
    // Majority wins; ties shouldn't happen with an odd sample count.
    return low > high;
}

void sendCurrentState() {
    const uint8_t pct   = Battery::readPercent();
    const uint8_t flags = flagsForUplink();
    LoraLink::sendEvent(currentEventType(), pct, flags);
}

// Qualitative tag for a LoRa RSSI reading so an installer doesn't need to know
// what dBm means. SF9 links stay usable down to ~ -120 dBm; these bands give a
// rough "is this a good spot for the hanger" cue.
const char* rssiTag(float rssi) {
    if (rssi >= -95)  return "good";
    if (rssi >= -110) return "ok";
    return "weak";
}

/// 4-line OLED status screen, shown on USB, in the post-boot window, and for a
/// minute after the PRG button is pressed:
///   HazardLink Hanger
///   <full DevEUI>            (so the installer can register the unit)
///   Batt NN%  Sign ON/LIFTED
///   Link -NNdBm good         (live signal to the gateway, or "no gateway")
void showHangerStatus() {
    const String devEui = Config::getDevEui();
    const uint8_t pct = Battery::readPercent();
    const bool signPresent = digitalRead(Pinout::HALL_SENSOR_PIN) == LOW;
    const LoraLink::LinkQuality lq = LoraLink::lastLink();

    char l1[24], l2[24], l3[24], l4[24];
    snprintf(l1, sizeof(l1), "HazardLink Hanger");
    snprintf(l2, sizeof(l2), "%s", devEui.c_str());          // full DevEUI
    snprintf(l3, sizeof(l3), "Batt %d%%  Sign %s",
             pct, signPresent ? "ON" : "LIFTED");
    if (lq.ok) {
        snprintf(l4, sizeof(l4), "Link %ddBm %s",
                 (int)lq.rssi, rssiTag(lq.rssi));
    } else {
        snprintf(l4, sizeof(l4), "Link: no gateway");
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
    pinMode(Pinout::PRG_BUTTON_PIN,  INPUT_PULLUP);  // on-board "wake screen" button

    // Identify the wake reason — first boot vs sensor wake vs timer wake.
    const esp_sleep_wakeup_cause_t wake = esp_sleep_get_wakeup_cause();
    log_i("wake cause: %d  (0=power-on, 2=ext0, 4=timer)", (int)wake);
    g_freshBoot = (wake == ESP_SLEEP_WAKEUP_UNDEFINED);  // true power-on only

    // ── NO Wi-Fi / BLE onboarding for hangers ──
    //
    // Hangers are LoRa-only by design: they get installed in the no-Wi-Fi
    // dead zones (stairwells, basements, warehouse aisles, big tiled
    // bathrooms) — that's the whole reason for the LoRa+gateway topology.
    // LoRa carries ~km and punches through walls; the GATEWAY is the single
    // device that needs Wi-Fi/internet.
    //
    // A hanger therefore needs NO runtime configuration:
    //   - DevEUI    → auto-derived from the chip MAC (Config::begin)
    //   - HMAC key  → baked in at flash time (BOR_LORA_HMAC_KEY)
    //   - zone      → assigned in the dashboard ("+ Register hanger" by DevEUI)
    //   - webhook   → gateway-only; the hanger never makes an HTTP call
    //
    // So we boot straight into LoRa. The previous build entered a BLE Wi-Fi
    // setup flow here, which was pure friction (the creds it collected were
    // never used — there's no hanger HTTP path) and contradicted the
    // LoRa-in-no-Wi-Fi-places design. Removed.

    Display::begin();

    if (!LoraLink::begin()) {
        log_e("LoRa init failed — sleeping 60s and retrying");
        Display::showStatus("HazardLink Hanger", "LoRa init failed", "retrying in 60s", "");
        delay(2000);
        esp_sleep_enable_timer_wakeup(60ULL * 1000000ULL);
        esp_deep_sleep_start();
    }

    // On a true first boot (power-on, never seen before), show the DevEUI on
    // the OLED so the installer can register it in the dashboard. Mark the
    // device "onboarded" so we don't keep treating every reboot as first-run
    // (the flag no longer gates Wi-Fi — it just suppresses this splash).
    if (!Config::isOnboarded()) {
        const String devEui = Config::getDevEui();
        log_i("first boot — DevEUI %s (register this in the dashboard)", devEui.c_str());
        Display::showStatus("Register hanger:", devEui, "in the dashboard", "");
        delay(8000);  // long enough to read + jot the DevEUI
        Config::setOnboarded(true);
    }

    // Fire the current state immediately so a freshly-powered hanger shows
    // up / updates in the cloud right away (via the gateway).
    sendCurrentState();
}

void loop() {
    // ── When is the OLED lit? ──
    //
    // By default it's OFF — that's what keeps a wall-mounted, battery-powered
    // hanger alive for months. It lights up in exactly two cases:
    //   1. a short window right after power-on (so an installer can read the
    //      DevEUI + confirm it booted and reacts to the sign), and
    //   2. for one minute after the PRG button is pressed.
    // Otherwise it stays dark — on battery AND on USB.
    //
    // We deliberately DON'T try to keep it lit "whenever on USB". The bare
    // Heltec V3 can't reliably tell USB from battery (the VBUS divider isn't
    // populated, and the USB-CDC link state isn't trustworthy on this board),
    // so any USB-vs-battery guess risks leaving the screen on during battery
    // use — defeating the point. The boot window + button are deterministic.

    // ── Persistent loop state ──
    static int      screenState     = 1;   // 0 off, 1 on (setup leaves it on)
    static uint32_t screenWakeUntil = 0;   // millis() deadline for a PRG-wake
    static uint32_t lastSendMs      = millis();
    static uint32_t lastDispMs      = 0;
    static LoraLink::EventType lastEvent = currentEventType();
    static bool     prevSignPresent = signPresentDebounced();
    static bool     prevPrgDown     = false;
    static uint32_t lastPressMs     = 0;

    // ── PRG button (GPIO0): wake the screen for a minute and refresh the live
    // link reading. Falling edge = press, with a 1 s bounce guard so one press
    // is one ping. The installer taps it to read the DevEUI and see how strong
    // the link to the gateway is from this exact spot. ──
    const bool prgDown = digitalRead(Pinout::PRG_BUTTON_PIN) == LOW;
    if (prgDown && !prevPrgDown && (millis() - lastPressMs > 1000)) {
        lastPressMs     = millis();
        screenWakeUntil = millis() + SCREEN_WAKE_MS;
        Display::on();                 // light it immediately (idempotent)
        screenState = 1;
        Display::showStatus("HazardLink Hanger", Config::getDevEui(),
                            "Checking gateway", "link...");
        // One fresh round-trip so the RSSI shown is current as of the press.
        LoraLink::sendEvent(currentEventType(), Battery::readPercent(),
                            flagsForUplink());
        lastSendMs = millis();
        lastDispMs = 0;                // force a status redraw next tick
    }
    prevPrgDown = prgDown;

    // Screen on during the post-boot window or a button wake; dark otherwise.
    const bool inCommissionWindow = g_freshBoot && millis() < SCREEN_COMMISSION_MS;
    const bool inButtonWake       = millis() < screenWakeUntil;
    const bool wantScreenOn       = inCommissionWindow || inButtonWake;

    // Keep the OLED rail in sync. Toggle only on a real transition so we don't
    // re-pulse the panel every iteration. off() cuts the Vext rail entirely
    // (true power saving); on() re-inits the controller (see display.cpp) so a
    // battery→USB / button wake relights it cleanly.
    const int wantScreen = wantScreenOn ? 1 : 0;
    if (wantScreen != screenState) {
        if (wantScreen) Display::on(); else Display::off();
        screenState = wantScreen;
    }

#ifdef BOR_HANGER_DEEP_SLEEP
    // Optional ultra-low-power mode (off by default). Sleep only when truly on
    // battery AND nobody is looking at the screen. (Button-wake-from-deep-sleep
    // would need GPIO0 added as an ext1 wake source — a later enhancement.)
    if (!inCommissionWindow && !inButtonWake) {
        Display::off();
        enterDeepSleep();   // does not return
    }
#endif

    // ── Awake path ──
    //
    // Default behaviour (and always while on USB): stay alive, beacon a LoRa
    // heartbeat once a minute so the dashboard's Online badge stays fresh, and
    // react instantly to the sign being lifted or re-hung. The ONLY thing the
    // power source changes is the screen — the radio/alerting behaviour is
    // identical on battery and USB.
    // Edge-detect sign-on-hook changes for instant push. Debounced so one
    // physical sign movement = exactly one event, not a burst of chatter from
    // contact bounce / a floating pin.
    const bool signPresent = signPresentDebounced();
    if (signPresent != prevSignPresent) {
        prevSignPresent = signPresent;
        lastEvent = signPresent ? LoraLink::EventType::Returned
                                : LoraLink::EventType::Lifted;
        LoraLink::sendEvent(lastEvent, Battery::readPercent(), flagsForUplink());
        lastSendMs = millis();
    }

    // Scheduled heartbeat.
    if (millis() - lastSendMs >= USB_HEARTBEAT_INTERVAL_MS) {
        lastEvent = currentEventType();
        LoraLink::sendEvent(lastEvent, Battery::readPercent(), flagsForUplink());
        lastSendMs = millis();
    }

    // Refresh the OLED ~once a second — only while it's actually powered.
    if (wantScreenOn && millis() - lastDispMs > 1000) {
        lastDispMs = millis();
        showHangerStatus();
    }

    delay(20);  // yield, keep watchdog happy
}

}  // namespace Hanger
