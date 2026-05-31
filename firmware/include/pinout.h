// Heltec WiFi LoRa 32 V3 pinout — ESP32-S3 + SX1262
//
// Reference: https://heltec.org/project/wifi-lora-32-v3/
// Reference: https://wiki.heltec.org/docs/devices/open-source-hardware/esp32-series/lora-32/wifi-lora-32-v3/
//
// All GPIO numbers here are ESP32-S3 GPIOs (the silkscreen on the board
// labels them with the IO number, e.g. "IO8" → GPIO8).
#pragma once

#include <cstdint>

namespace Pinout {

// ─── SX1262 LoRa transceiver (SPI bus) ──────────────────────────────────────
constexpr int LORA_NSS    = 8;   // SPI chip-select
constexpr int LORA_SCK    = 9;
constexpr int LORA_MOSI   = 10;
constexpr int LORA_MISO   = 11;
constexpr int LORA_RST    = 12;
constexpr int LORA_BUSY   = 13;
constexpr int LORA_DIO1   = 14;  // IRQ — wake source on RX done

// ─── On-board 0.96" SSD1306 OLED (I²C bus) ──────────────────────────────────
constexpr int OLED_SDA    = 17;
constexpr int OLED_SCL    = 18;
constexpr int OLED_RST    = 21;

// ─── Power rails ────────────────────────────────────────────────────────────
// Vext = external power rail (powers OLED + battery divider). Drive LOW to
// enable, HIGH to cut. Keep it OFF during deep sleep to save battery.
constexpr int VEXT_CTRL   = 36;

// Battery voltage measurement: 390k/100k divider on Vbat. Driven by VBAT_CTRL
// to save power — only enable for a few ms during a reading.
constexpr int VBAT_PIN    = 1;   // ADC1_CH0
constexpr int VBAT_CTRL   = 37;  // drive LOW to enable divider

// ─── On-board PRG / USER button ──────────────────────────────────────────────
// The button silk-screened "PRG" next to RST on the Heltec V3 is wired to
// GPIO0 (the boot-strapping pin). Held during reset it enters the ROM
// bootloader (how we flash); pressed during normal run it just reads LOW and
// we use it as a user button — e.g. "wake the OLED for a minute to show the
// DevEUI + link strength" while installing. It has an external pull-up, and we
// also enable the internal one. RTC-capable (GPIO0 ≤ 21) so it can wake from
// deep sleep later if needed.
constexpr int PRG_BUTTON_PIN = 0;

// ─── User LED ───────────────────────────────────────────────────────────────
constexpr int LED_PIN     = 35;  // single user-visible LED on the board

// ─── BOR-specific GPIOs (wired by the hanger PCB) ───────────────────────────
//
// We pick GPIOs that:
//  - are RTC-capable (so they can wake from deep sleep)
//  - don't conflict with the SPI/I²C buses above
//  - aren't strapping pins
//
// On the ESP32-S3, RTC GPIOs are 0–21. Available after carving out the
// LoRa/OLED/battery pins: 0, 2, 3, 4, 5, 6, 7, 15, 16, 19, 20.
constexpr int HALL_SENSOR_PIN  = 6;   // DRV5032FA OUT — sign-presence sensor.
                                       //   LOW  = magnet present (sign on hook)
                                       //   HIGH = magnet absent  (sign lifted)
                                       // Wakes ESP32 from deep sleep on edge.
                                       //
                                       // NB: GPIO7 is NOT broken out to a header
                                       // pad on the Heltec V3 (it's used
                                       // internally) — the original choice was
                                       // unsolderable. GPIO6 IS exposed (bottom
                                       // row, near the OLED end), RTC-capable,
                                       // and not a strapping pin. Hall OUT
                                       // solders here.

constexpr int TEST_BUTTON_PIN  = 3;   // momentary button — used for the
                                       // cleaning-mode start trigger and
                                       // factory-reset (long press → re-arm
                                       // BLE setup mode). Moved off GPIO6 to
                                       // free that pad for the Hall sensor;
                                       // GPIO3 is also exposed + RTC-capable.

constexpr int VBUS_SENSE_PIN   = 4;   // USB VBUS sense (via resistor divider).
                                       // HIGH = plugged into USB → charging.
                                       // Used to set the is_charging flag in
                                       // outbound heartbeat packets.

// Optional buzzer for sites that want audible alerts. Not soldered on the
// default hanger BOM; only present on premium variant.
constexpr int BUZZER_PIN       = 5;

}  // namespace Pinout
