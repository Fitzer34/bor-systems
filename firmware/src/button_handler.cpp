#include "button_handler.h"
#include "../include/pinout.h"
#include "config/nvs_store.h"
#include "display.h"

#include <Arduino.h>
#include <esp_system.h>

namespace {

constexpr uint32_t LONG_PRESS_MS = 10000;     // 10 s
constexpr uint32_t DEBOUNCE_MS   = 30;

bool     g_lastReading = HIGH;   // INPUT_PULLUP — HIGH = released
uint32_t g_pressedSince = 0;
uint32_t g_lastBounce  = 0;
bool     g_shortPressReady = false;
bool     g_longTriggered   = false;

bool buttonDown() {
    return digitalRead(Pinout::TEST_BUTTON_PIN) == LOW;
}

void doFactoryReset() {
    Display::begin();
    Display::showStatus("Factory reset", "Wi-Fi credentials",
                        "wiped. Rebooting", "into setup mode.");
    Config::factoryReset();
    delay(2500);
    esp_restart();
}

}  // namespace

namespace ButtonHandler {

bool checkLongPress() {
    const bool down = buttonDown();
    const uint32_t now = millis();

    if (down && g_pressedSince == 0) {
        g_pressedSince = now;
        g_lastBounce = now;
    } else if (!down) {
        if (g_pressedSince != 0 && (now - g_pressedSince) > DEBOUNCE_MS &&
            !g_longTriggered) {
            const uint32_t heldFor = now - g_pressedSince;
            if (heldFor < LONG_PRESS_MS) g_shortPressReady = true;
        }
        g_pressedSince = 0;
        g_longTriggered = false;
        return false;
    }

    // While held, check for long-press threshold. Trigger reset BEFORE
    // release so the user gets visual confirmation that the hold worked.
    if (down && !g_longTriggered &&
        g_pressedSince != 0 &&
        (now - g_pressedSince) >= LONG_PRESS_MS) {
        g_longTriggered = true;
        log_w("test button held %d ms — factory reset", LONG_PRESS_MS);
        doFactoryReset();   // does not return
        return true;
    }
    return false;
}

bool consumeShortPress() {
    if (!g_shortPressReady) return false;
    g_shortPressReady = false;
    return true;
}

}  // namespace ButtonHandler
