#include "display.h"
#include "../include/pinout.h"

#include <Arduino.h>
#include <Wire.h>
#include <SSD1306Wire.h>

namespace {

SSD1306Wire oled(0x3c, Pinout::OLED_SDA, Pinout::OLED_SCL, GEOMETRY_128_64,
                 I2C_ONE, /*frequency=*/400000);
bool g_initialised = false;

}  // namespace

namespace Display {

void begin() {
    pinMode(Pinout::VEXT_CTRL, OUTPUT);
    pinMode(Pinout::OLED_RST, OUTPUT);
    on();
}

void on() {
    digitalWrite(Pinout::VEXT_CTRL, LOW);   // power the OLED rail
    delay(50);
    // Hardware reset pulse to the OLED — required per datasheet.
    digitalWrite(Pinout::OLED_RST, LOW);
    delay(20);
    digitalWrite(Pinout::OLED_RST, HIGH);
    delay(20);

    // Re-init on every power-on. off() cuts the Vext rail entirely, which
    // wipes the SSD1306's RAM + config registers — so after a battery→USB
    // transition a bare displayOn() would show garbage. Re-running init()
    // restores the controller. It's a few ms and idempotent, so it's safe to
    // run unconditionally rather than gating on g_initialised.
    oled.init();
    oled.flipScreenVertically();   // labels are right-side-up
    oled.setContrast(255);
    g_initialised = true;
    oled.displayOn();
}

void off() {
    if (g_initialised) oled.displayOff();
    digitalWrite(Pinout::VEXT_CTRL, HIGH); // cut the rail entirely
}

void showLarge(const String& text) {
    oled.clear();
    oled.setFont(ArialMT_Plain_24);
    oled.setTextAlignment(TEXT_ALIGN_CENTER);
    oled.drawString(64, 20, text);
    oled.display();
}

void showStatus(const String& l1, const String& l2,
                const String& l3, const String& l4) {
    oled.clear();
    oled.setFont(ArialMT_Plain_10);
    oled.setTextAlignment(TEXT_ALIGN_LEFT);
    oled.drawString(0,  0, l1);
    oled.drawString(0, 16, l2);
    oled.drawString(0, 32, l3);
    oled.drawString(0, 48, l4);
    oled.display();
}

}  // namespace Display
