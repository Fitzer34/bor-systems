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

// Forward decl — defined below, but enterDeepSleep()/currentEventType() (which
// appear earlier) need it to read the debounced sign state.
bool signPresentDebounced();

// Heartbeat cadence on battery: once a DAY. The hanger is event-driven — a
// sign lift/return is a hardware (Hall) wake that fires an instant alert and
// goes straight back to sleep. This daily timer is only the "still alive"
// check-in so the dashboard can tell a healthy-but-quiet hanger from a dead /
// removed / flat one. Deep sleep (~tens of µA) dominates the energy budget, so
// daily vs hourly is a negligible battery difference but a far longer life and
// a calmer fleet. The dashboard's "online" window is widened to match (~26 h)
// so a once-a-day hanger never looks falsely offline.
constexpr uint64_t HEARTBEAT_INTERVAL_US = 24ULL * 60ULL * 60ULL * 1000000ULL;

// Heartbeat cadence while AWAKE (USB / commission / button window) — once a
// minute, same as the gateway, so the dashboard updates promptly during
// install + bench testing. On battery the device is asleep between these, so
// this only applies during the brief awake windows.
constexpr uint32_t USB_HEARTBEAT_INTERVAL_MS = 60UL * 1000UL;

// Battery-% streaming cadence while plugged into USB-C charging. 30 s gives a
// live charging readout without flooding the LoRa link. Only active while
// charging; unplugging drops straight back to deep-sleep operation.
constexpr uint32_t CHARGE_STREAM_INTERVAL_MS = 30UL * 1000UL;

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

// ── Self-healing Hall-wake guard (survives deep sleep in RTC memory) ──
//
// The Hall pin is an ext1 deep-sleep wake source so a lifted sign fires an
// instant alert. But if the Hall sensor is unpopulated, unpowered during
// sleep, or flaky, GPIO6 can float across the wake threshold and trigger a
// spurious ext1 wake — which, left unchecked, becomes a reboot loop that
// drains the battery FASTER than no sleep at all (seen on the bench: a board
// with no sensor wired wakes ~every 1.8 s).
//
// Guard against a FLOATING/absent Hall pin wake-looping the device (seen on a
// sensorless bench board: ext1 fires ~every 1.8 s, draining the battery worse
// than no sleep). The signal that tells noise apart from a real sign movement:
//
//   • A REAL event changes the debounced sign state (on-hook ↔ lifted). We
//     arm wake-on-change, so after a genuine lift the pin now reads the new
//     level and stays there — the next arming watches for the *opposite*
//     edge. State changes; the device settles.
//   • NOISE on a floating pin trips ext1 but the debounced state reads the
//     SAME as when we slept (the pin still floats around one level). That's
//     the fingerprint of a bad/absent sensor.
//
// So we count ext1 wakes where the sign state did NOT change. A real sensor —
// no matter how busy — flips state on every wake, so its counter never climbs.
// Only a floating pin racks up no-change wakes; after a run of those we drop
// the Hall wake and fall back to the daily timer (battery-safe; the daily
// check-in still reports sign state). This does NOT penalise heavy real use:
// 100 genuine lifts/day keep instant alerts fully armed.
RTC_DATA_ATTR int  g_rtcNoChangeHallWakes = 0;
RTC_DATA_ATTR int  g_rtcSleepSignLevel = -1;   // Hall level we last slept at (-1 = unset)
RTC_DATA_ATTR bool g_rtcHallWakeDisabled = false;

// After this many ext1 wakes that did NOT change the sign state (pure noise),
// treat the pin as floating and drop it as a wake source until next power-on.
constexpr int MAX_NOCHANGE_HALL_WAKES = 5;

// Threshold for sending an EVT_LOW_BATTERY (1-shot) ahead of the scheduled
// heartbeat. Kept aggressive — the cloud already has the % from every
// heartbeat, this is a "wake the operator up" signal.
constexpr uint8_t LOW_BATTERY_PCT = 15;

void enterDeepSleep() {
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
    // The S3 has NO ext0 (that's ESP32-classic only); the wake-on-GPIO
    // primitive is ext1 — a bitmask of RTC pins with ONE shared trigger
    // polarity (ANY_HIGH or ANY_LOW) for the whole mask.
    //
    // We wake the radio on TWO things:
    //   • the hourly timer        → scheduled "still alive" heartbeat
    //   • the Hall sensor CHANGING → sign lifted or re-hung = instant alert
    //
    // The subtlety that bit the first version: the Hall pin is NOT always
    // idle-HIGH. With the sign on the hook (the normal resting state) the
    // magnet is present and the pin reads LOW. So a fixed "wake on LOW" fires
    // immediately and the device wake-loops forever — draining the battery
    // worse than no sleep at all (observed: woke in <1 s, wake cause = ext1).
    //
    // Correct approach: wake on the level OPPOSITE to the Hall pin's CURRENT
    // level — i.e. wake-on-change. If the sign is on (LOW now) we arm ANY_HIGH
    // so lifting it (→HIGH) wakes us; if it's off (HIGH now) we arm ANY_LOW so
    // re-hanging it (→LOW) wakes us. Either way the very next sign movement is
    // an instant wake + LoRa send.
    //
    // The PRG button is deliberately NOT an ext1 wake source: it idles HIGH
    // (opposite the common sign-on-hook LOW), so it can't share the Hall pin's
    // single polarity, and waking from deep sleep on it isn't needed — the
    // installer interacts during the post-boot/awake window. A press while
    // asleep is simply ignored until the next timer/Hall wake.
    const gpio_num_t hallPin = static_cast<gpio_num_t>(Pinout::HALL_SENSOR_PIN);
    // Use the DEBOUNCED sign level for both the wake polarity and the guard's
    // remembered level, so they can never disagree (a single raw digitalRead
    // could catch a transient and arm the wrong edge).
    const bool signOnHook = signPresentDebounced();   // true == magnet present == LOW
    g_rtcSleepSignLevel = signOnHook ? LOW : HIGH;

    if (!g_rtcHallWakeDisabled) {
        // Wake on the level OPPOSITE the sign's current level (wake-on-change):
        // sign on (LOW) → wake when it goes HIGH (lifted); sign off (HIGH) →
        // wake when it goes LOW (re-hung). Hold the matching internal pull so
        // the pad rests at its current level and only a real movement crosses
        // the threshold.
        const esp_sleep_ext1_wakeup_mode_t mode =
            signOnHook ? ESP_EXT1_WAKEUP_ANY_HIGH : ESP_EXT1_WAKEUP_ANY_LOW;
        rtc_gpio_pullup_dis(hallPin);
        rtc_gpio_pulldown_dis(hallPin);
        if (signOnHook) rtc_gpio_pulldown_en(hallPin);  // hold LOW until lifted
        else            rtc_gpio_pullup_en(hallPin);    // hold HIGH until re-hung
        esp_sleep_enable_ext1_wakeup(1ULL << hallPin, mode);
        log_i("entering deep sleep (%llu us timer + Hall wake; sign=%s, mode=%s)",
              HEARTBEAT_INTERVAL_US,
              signOnHook ? "ON-HOOK" : "LIFTED",
              signOnHook ? "ANY_HIGH" : "ANY_LOW");
    } else {
        // Hall wake suppressed (noisy/absent sensor) — timer-only. Battery-safe
        // fallback: still checks in hourly, just no instant-lift wake. The
        // hourly heartbeat reports sign state, so a spill is caught within the
        // hour even here.
        log_w("entering deep sleep (%llu us timer ONLY — Hall wake disabled)",
              HEARTBEAT_INTERVAL_US);
    }

    esp_sleep_enable_timer_wakeup(HEARTBEAT_INTERVAL_US);

    esp_deep_sleep_start();   // does not return — boots fresh through setup()
}

uint8_t flagsForUplink() {
    uint8_t f = 0;
    // Use the voltage-trend charge signal (works on bare boards where the VBUS
    // pin floats), so the "charging" flag the dashboard shows matches the
    // charging-stream behaviour in the loop.
    if (Battery::chargingByVoltage()) f |= static_cast<uint8_t>(LoraLink::Flags::IsCharging);
    return f;
}

LoraLink::EventType currentEventType() {
    const uint8_t pct = Battery::readPercent();
    const bool signPresent = signPresentDebounced();

    // SAFETY FIRST: a lifted sign is the whole point of the product, so it
    // ALWAYS wins. If the sign is off the hook we report Lifted regardless of
    // battery — the spill alert must fire. (Battery % rides along in every
    // packet anyway, and the daily heartbeat still surfaces a low cell, so we
    // never lose the low-battery signal by prioritising the spill.)
    if (!signPresent) return LoraLink::EventType::Lifted;

    // Sign is on the hook. Only now is a low-battery heartbeat meaningful.
    // Require a CONFIDENT low reading (1–LOW_BATTERY_PCT): a flat 0 almost
    // always means the measurement failed (no cell / divider), not a truly
    // dead pack, so don't spam low_battery on a glitch. Suppress while charging
    // (voltage-trend signal) — a low-but-rising pack isn't a problem.
    if (pct > 0 && pct <= LOW_BATTERY_PCT && !Battery::chargingByVoltage()) {
        return LoraLink::EventType::LowBattery;
    }
    return LoraLink::EventType::Heartbeat;
}

// Event to send on a Hall-sensor wake (or any time we need the exact sign
// transition rather than a generic state report). On a real wake the sign just
// moved, so report it explicitly: absent → Lifted (open the spill alert),
// present → Returned (close it). currentEventType() can't express Returned —
// it only ever reports the steady state — which is why re-hanging the sign was
// silently sending Heartbeat and never closing the alert.
LoraLink::EventType signTransitionEvent() {
    return signPresentDebounced() ? LoraLink::EventType::Returned
                                  : LoraLink::EventType::Lifted;
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

    // Identify the wake reason — first boot vs Hall wake vs timer.
    const esp_sleep_wakeup_cause_t wake = esp_sleep_get_wakeup_cause();
    log_i("wake cause: %d  (0=power-on, 7=timer, 6=ext1/Hall-sign)", (int)wake);
    log_i("VBUS raw=%d charging=%d  (charge-detect diagnostic)",
          Battery::vbusRaw(), (int)Battery::isCharging());
    g_freshBoot = (wake == ESP_SLEEP_WAKEUP_UNDEFINED);  // true power-on only
    // NB: an ext1 wake now means ONLY "the sign moved" (Hall pin) — PRG isn't a
    // deep-sleep wake source. sendCurrentState() below reports the new sign
    // state on this wake, then the loop re-sleeps immediately. We deliberately
    // DON'T open the 60s commissioning window on a Hall wake — that would keep
    // the radio + BLE beacon up for a full minute on every single sign event
    // (needless drain). Only a true power-on (g_freshBoot) opens that window.

    // ── Floating-Hall detection (see RTC guard vars above) ──
    if (g_freshBoot) {
        // Fresh power-on wipes the guard: assume a good sensor until proven
        // otherwise, so a reset always re-enables instant-lift wake.
        g_rtcNoChangeHallWakes = 0;
        g_rtcHallWakeDisabled  = false;
    } else if (wake == ESP_SLEEP_WAKEUP_EXT1) {
        // Woke on the Hall pin. Did the sign state actually change vs the level
        // we slept at? A real lift/return flips it (→ reset the counter, keep
        // instant alerts armed no matter how busy). A no-change wake is pin
        // noise; only a long run of those means the sensor is floating/absent.
        const int nowLevel = signPresentDebounced() ? LOW : HIGH;
        if (g_rtcSleepSignLevel != -1 && nowLevel == g_rtcSleepSignLevel) {
            if (++g_rtcNoChangeHallWakes >= MAX_NOCHANGE_HALL_WAKES) {
                g_rtcHallWakeDisabled = true;
                log_w("Hall pin floating (%d no-change wakes) — disabling Hall "
                      "wake, daily-timer-only until next power-on",
                      g_rtcNoChangeHallWakes);
            }
        } else {
            g_rtcNoChangeHallWakes = 0;   // real sign movement → trust the sensor
        }
    }

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

    // Fire an uplink immediately on every boot/wake so the event reaches the
    // cloud within ~1 s of the trigger — this IS the instant-alert path.
    //   • Hall wake (sign moved) → send the exact transition (Lifted/Returned)
    //     so the spill alert opens or closes right away.
    //   • Power-on / timer wake  → send the current steady state.
    if (wake == ESP_SLEEP_WAKEUP_EXT1) {
        LoraLink::sendEvent(signTransitionEvent(), Battery::readPercent(), flagsForUplink());
    } else {
        sendCurrentState();
    }
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
        g_freshBoot && millis() < SCREEN_COMMISSION_MS;
    const bool inButtonWake       = millis() < screenWakeUntil;
    const bool wantScreenOn       = inCommissionWindow || inButtonWake;

    // Keep the OLED rail in sync. Toggle only on a real transition so we don't
    // re-pulse the panel every iteration. off() cuts the Vext rail entirely
    // (true power saving); on() re-inits the controller (see display.cpp) so an
    // in-session PRG press relights it cleanly.
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

    // ── Charging mode: stream battery % while plugged into USB-C ──
    //
    // When charging we're not battery-constrained, so stay awake and report the
    // battery percentage to the cloud on a fast cadence — a live "charging,
    // NN%" readout. The moment USB is unplugged we fall straight through to the
    // deep-sleep path below and resume the years-long battery operation.
    //
    // Detection: the bare Heltec V3's VBUS-sense pin (GPIO4) isn't populated
    // (measured raw≈107 while plugged in), so isCharging() can't see USB. We
    // instead infer charging from the battery-VOLTAGE TREND — rising, or pinned
    // near full — via chargingByVoltage(), which works on any board and has its
    // own noise hysteresis. Safety: the charging branch never sleeps, but the
    // moment the trend says "not charging" we fall straight through to deep
    // sleep, so a discharging pack can never be stranded awake.
    static uint32_t lastChargeSendMs = 0;
    static bool chargeStreamLogged = false;
    const bool charging = Battery::chargingByVoltage();

    if (charging) {
        if (!chargeStreamLogged) {
            log_i("USB charging detected (VBUS) — streaming battery %% every %lus",
                  (unsigned long)(CHARGE_STREAM_INTERVAL_MS / 1000));
            chargeStreamLogged = true;
        }
        // Stream the battery percentage on a fast cadence while plugged in.
        if (lastChargeSendMs == 0 ||
            millis() - lastChargeSendMs >= CHARGE_STREAM_INTERVAL_MS) {
            const uint8_t pct = Battery::readPercent();
            // currentEventType() still lets a lifted sign win (safety), and the
            // IsCharging flag rides along so the dashboard shows "charging".
            LoraLink::sendEvent(currentEventType(), pct, flagsForUplink());
            lastChargeSendMs = millis();
            lastSendMs       = millis();
            log_i("charging — battery %d%%", pct);
        }
        // Keep the screen showing live status while plugged in.
        if (millis() - lastDispMs > 1000) {
            lastDispMs = millis();
            Display::on();
            showHangerStatus();
        }
        delay(20);
        return;   // never sleep while charging
    } else {
        chargeStreamLogged = false;   // re-arm the log for the next plug-in
    }

    // ── Sleep once the awake window closes (default, battery-saving path) ──
    //
    // When no one's looking at the screen and we're not mid-discovery, drop the
    // CPU + radio into deep sleep until the daily timer or a Hall (sign) wake.
    // This is THE battery fix: staying awake + beaconing LoRa every 60 s drains
    // a cell in days; sleeping between events lasts years. The sign is still
    // monitored — lifting it is an ext1 wake that fires an instant alert.
#ifndef BOR_HANGER_STAY_AWAKE
    if (!wantScreenOn) {
        // setup() already fired this wake's uplink (the exact Lifted/Returned
        // on a Hall wake, or the current state on a power-on/timer wake), so we
        // do NOT re-send here — a second packet would be redundant and, on a
        // Hall wake, could overwrite the transition with a generic state. Just
        // go back to sleep; the next trigger or the daily timer sends again.
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
