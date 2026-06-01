#include "hanger.h"
#include "hanger_beacon.h"
#include "../battery.h"
#include "../config/nvs_store.h"
#include "../display.h"
#include "../lora_link.h"
#include "../../include/pinout.h"

#include <Arduino.h>
#include <esp_sleep.h>
#include "driver/rtc_io.h"   // RTC pull config for the deep-sleep wake pin

namespace {

// Heartbeat cadence on battery: once an hour balances "online indicator stays
// fresh" against battery life. ~1-2 years on an 18650/21700. The dashboard's
// Online window is widened to match (see ONLINE_WINDOW on the backend), so an
// hourly hanger doesn't look falsely offline.
constexpr uint64_t HEARTBEAT_INTERVAL_US = 60ULL * 60ULL * 1000000ULL;

// Heartbeat cadence while AWAKE (USB / commission / button window) — once a
// minute, same as the gateway, so the dashboard updates promptly during
// install + bench testing. On battery the device is asleep between these, so
// this only applies during the brief awake windows.
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

// True when this boot was caused by an ext1 (Hall sensor or PRG button) wake
// from deep sleep — as opposed to the hourly timer. On a button wake we light
// the screen + BLE beacon so the installer who pressed it gets feedback; on a
// plain timer wake we send the heartbeat and go straight back to sleep, screen
// dark, to save the battery.
bool g_buttonWake = false;

// Threshold for sending an EVT_LOW_BATTERY (1-shot) ahead of the scheduled
// heartbeat. Kept aggressive — the cloud already has the % from every
// heartbeat, this is a "wake the operator up" signal.
constexpr uint8_t LOW_BATTERY_PCT = 15;

void enterDeepSleep() {
    log_i("entering deep sleep (%llu us timer + Hall/PRG wake)", HEARTBEAT_INTERVAL_US);
    Serial.flush();

    // Park the LoRa radio so it isn't burning ~10 mA in the SX1262 RX/idle
    // state through the whole sleep — without this, deep sleep saves almost
    // nothing.
    LoraLink::sleep();

    // Cut the Vext rail (OLED + battery divider quiescent draw).
    pinMode(Pinout::VEXT_CTRL, OUTPUT);
    digitalWrite(Pinout::VEXT_CTRL, HIGH);  // HIGH = off on Heltec V3

    // ── Wake sources (ESP32-S3) ──
    //
    // NB: the S3 has NO ext0 — that's ESP32-classic only. The S3 wake-on-GPIO
    // primitive is ext1 (a bitmask of RTC-capable pins). We wake on:
    //   • the Hall sensor pin   → sign lifted/returned = instant spill alert
    //   • the PRG button pin    → installer wants the screen/beacon
    //   • the hourly timer       → scheduled "still alive" heartbeat
    //
    // ext1 with ANY_HIGH fires when any listed pin goes HIGH. Both pins idle
    // HIGH (INPUT_PULLUP) and go LOW when active, so we can't simply watch for
    // HIGH. Instead we keep internal pulls alive in sleep and watch the level
    // each pin will transition TO. Simplest robust choice on the S3: wake on
    // the rising edge back to idle is useless, so we hold the pulls and use
    // ANY_LOW-equivalent via inverted logic isn't supported — so we configure
    // each RTC pad with a pull-up and trigger on the pin going LOW using the
    // ANY_HIGH mask on the *complement* isn't available either. Therefore we
    // use the supported pattern: enable pull-ups, and trigger ext1 ANY_HIGH on
    // a transition by momentarily relying on the pins' active-low pulses being
    // long enough — both the Hall sensor change and a button press hold LOW
    // well beyond the wake latency.
    //
    // Concretely: configure both pads as RTC inputs with pull-ups, then arm
    // ext1 in ALL_LOW mode (ESP_EXT1_WAKEUP_ALL_LOW is deprecated on S3 —
    // the supported modes are ANY_HIGH and ANY_LOW). ANY_LOW wakes the moment
    // either pin is pulled LOW, which is exactly "sign moved" or "button
    // pressed".
    const gpio_num_t hallPin = static_cast<gpio_num_t>(Pinout::HALL_SENSOR_PIN);
    const gpio_num_t prgPin  = static_cast<gpio_num_t>(Pinout::PRG_BUTTON_PIN);

    rtc_gpio_pullup_en(hallPin);
    rtc_gpio_pulldown_dis(hallPin);
    rtc_gpio_pullup_en(prgPin);
    rtc_gpio_pulldown_dis(prgPin);

    const uint64_t mask = (1ULL << hallPin) | (1ULL << prgPin);
    esp_sleep_enable_ext1_wakeup(mask, ESP_EXT1_WAKEUP_ANY_LOW);
    esp_sleep_enable_timer_wakeup(HEARTBEAT_INTERVAL_US);

    esp_deep_sleep_start();   // does not return — boots fresh through setup()
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

    // Identify the wake reason — first boot vs sensor/button wake vs timer.
    const esp_sleep_wakeup_cause_t wake = esp_sleep_get_wakeup_cause();
    log_i("wake cause: %d  (0=power-on, 7=timer, ext1=GPIO/Hall/PRG)", (int)wake);
    g_freshBoot = (wake == ESP_SLEEP_WAKEUP_UNDEFINED);  // true power-on only
    // A button (PRG/Hall) wake should light the screen + beacon just like a
    // fresh boot, so the installer who pressed it sees something.
    g_buttonWake = (wake == ESP_SLEEP_WAKEUP_EXT1);

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

    // Screen on during the post-wake window (fresh boot OR a Hall/PRG wake from
    // deep sleep) or an in-session PRG press; dark otherwise. Both deep-sleep
    // wake reasons that a human triggers should show the screen so the
    // installer gets feedback for the press they just made.
    const bool inCommissionWindow =
        (g_freshBoot || g_buttonWake) && millis() < SCREEN_COMMISSION_MS;
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

    // ── BLE discovery beacon ──
    //
    // Broadcast the DevEUI over BLE for the SAME window the screen is lit: the
    // post-boot window and after a PRG-button press. That's exactly when an
    // installer is standing at the unit with the app open trying to add it, so
    // it shows up as "hanger nearby" — no typing the code. Outside the window
    // the beacon is off and the device is LoRa-only, as designed.
    static int beaconState = 0;            // 0 off, 1 on
    const int wantBeacon = wantScreenOn ? 1 : 0;
    if (wantBeacon != beaconState) {
        if (wantBeacon) HangerBeacon::start(Config::getDevEui());
        else            HangerBeacon::stop();
        beaconState = wantBeacon;
    }

    // ── Sleep once the awake window closes (default, battery-saving path) ──
    //
    // When no one's looking at the screen and we're not mid-discovery, drop the
    // CPU + radio into deep sleep until the hourly timer or a Hall/PRG wake.
    // This is THE battery fix: staying awake + beaconing LoRa every 60 s drains
    // a cell in days; sleeping between events lasts ~1-2 years. The sign is
    // still monitored — lifting it is an ext1 wake that fires an instant alert.
    //
    // (Plug into USB to keep it awake for bench work: the USB 5 V holds the
    // rails up, but the chip still "sleeps" logically — it just wakes on the
    // same triggers. For continuous bench monitoring, hold PRG or use the
    // serial console.)
#ifndef BOR_HANGER_STAY_AWAKE
    if (!wantScreenOn) {
        // Make sure this wake's heartbeat actually went out before sleeping.
        // On a timer wake we haven't sent since boot, so send now; the
        // sendCurrentState() in setup() already covered fresh/Hall/PRG boots,
        // but a belt-and-braces send here costs one packet and guarantees the
        // dashboard sees every hourly check-in.
        if (millis() - lastSendMs >= 500) {
            LoraLink::sendEvent(currentEventType(), Battery::readPercent(),
                                flagsForUplink());
        }
        enterDeepSleep();   // does not return
    }
#else
    // Bench/demo build (-DBOR_HANGER_STAY_AWAKE): never deep-sleep, so a USB-
    // tethered unit keeps streaming serial + heartbeating every 60 s for
    // continuous monitoring. NEVER ship this on battery — it's the ~days-not-
    // years drain. The default (flagless) build deep-sleeps as above.
#endif

    // ── Awake window (fresh boot / Hall / PRG, ~60 s) ──
    //
    // Stay alive so the installer can watch the screen + the app can discover
    // the beacon, beacon a LoRa heartbeat once a minute, and react instantly to
    // the sign being lifted or re-hung.
    //
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

    // Scheduled heartbeat while awake.
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
