#include "battery.h"
#include "../include/pinout.h"

#include <Arduino.h>

namespace {

// Voltage divider ratio: VBAT = ADC × (390k + 100k) / 100k = ADC × 4.9.
// The Heltec V3 schematic specifies 390k/100k, but production tolerance can
// drift the real ratio. Calibrate per-unit by measuring VBAT with a DMM and
// adjusting this constant if needed. ~5% accuracy is fine for a 0–100% bar.
constexpr float DIVIDER_RATIO = 4.9f;

// ESP32-S3 ADC: 12 bits, 0–3.3 V range with default attenuation 11dB.
constexpr float ADC_REF_V = 3.3f;
constexpr int   ADC_MAX   = 4095;

// LiPo discharge curve. Voltage drops non-linearly with state of charge:
// pretty flat 4.2 → 3.8 V (top 80%), then a steep drop 3.8 → 3.0 V. We use
// 7-point piecewise-linear interpolation — good enough for a battery bar,
// not a fuel gauge IC.
struct CurvePoint { float voltage; uint8_t pct; };
constexpr CurvePoint CURVE[] = {
    {4.20f, 100},
    {4.10f, 95},
    {4.00f, 85},
    {3.85f, 70},
    {3.75f, 50},
    {3.65f, 30},
    {3.50f, 10},
    {3.30f, 0},
};

uint8_t voltageToPct(float v) {
    if (v >= CURVE[0].voltage) return CURVE[0].pct;
    for (size_t i = 1; i < sizeof(CURVE)/sizeof(CURVE[0]); ++i) {
        if (v >= CURVE[i].voltage) {
            const float vSpan = CURVE[i-1].voltage - CURVE[i].voltage;
            const float vRel  = v - CURVE[i].voltage;
            const int   pSpan = CURVE[i-1].pct - CURVE[i].pct;
            return static_cast<uint8_t>(CURVE[i].pct + (vRel / vSpan) * pSpan);
        }
    }
    return 0;
}

}  // namespace

namespace Battery {

void begin() {
    pinMode(Pinout::VBAT_CTRL, OUTPUT);
    digitalWrite(Pinout::VBAT_CTRL, HIGH);  // start with divider OFF

    pinMode(Pinout::VBUS_SENSE_PIN, INPUT);
    analogReadResolution(12);
}

// Read the divided VBAT pin (in millivolts, ESP32-calibrated) with the
// ADC control pin driven to `ctrlLevel`. Averages 16 samples after a
// settle delay.
static float readDividedMv(int ctrlLevel) {
    digitalWrite(Pinout::VBAT_CTRL, ctrlLevel);
    delay(10);  // the rail needs ms, not µs, to settle — 100µs was too short

    uint32_t sum = 0;
    for (int i = 0; i < 16; ++i) {
        // analogReadMilliVolts applies the chip's factory ADC calibration —
        // far more accurate than raw analogRead × 3.3/4095, which is wildly
        // nonlinear on the ESP32-S3 especially near the low end.
        sum += analogReadMilliVolts(Pinout::VBAT_PIN);
    }
    return sum / 16.0f;
}

float readVoltage() {
    // Heltec changed the ADC-enable polarity between board revisions:
    //   - V3.0 / V3.1: drive ADC_Ctrl (GPIO37) LOW to connect the divider
    //   - V3.2:        drive ADC_Ctrl HIGH to connect the divider
    // Rather than hardcode one (and read 0% on the other), measure with
    // BOTH polarities and keep the larger reading — the "disabled" polarity
    // reads ~0 mV, the "enabled" one reads the real divided voltage. This
    // makes the same firmware work across every V3 revision.
    const float mvLow  = readDividedMv(LOW);
    const float mvHigh = readDividedMv(HIGH);
    const float adcMv  = mvLow > mvHigh ? mvLow : mvHigh;

    // Leave the control pin in the LOW state afterwards (lowest quiescent
    // on the revisions where LOW == disabled; harmless on V3.2).
    digitalWrite(Pinout::VBAT_CTRL, LOW);

    // adcMv is the divided pin voltage in mV; scale back to the battery.
    return (adcMv / 1000.0f) * DIVIDER_RATIO;
}

uint8_t readPercent() {
    return voltageToPct(readVoltage());
}

bool isCharging() {
    // VBUS divider gives ~1.6 V when USB plugged in, ~0 V otherwise. Treat
    // anything above half-rail as "charging".
    return analogRead(Pinout::VBUS_SENSE_PIN) > ADC_MAX / 2;
}

}  // namespace Battery
