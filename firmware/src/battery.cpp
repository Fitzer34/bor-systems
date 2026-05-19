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

float readVoltage() {
    digitalWrite(Pinout::VBAT_CTRL, LOW);   // enable divider
    delayMicroseconds(100);                  // let it settle

    uint32_t sum = 0;
    for (int i = 0; i < 32; ++i) {
        sum += analogRead(Pinout::VBAT_PIN);
    }

    digitalWrite(Pinout::VBAT_CTRL, HIGH);  // disable divider — save µA

    const float adcMean   = sum / 32.0f;
    const float adcVolts  = adcMean * ADC_REF_V / ADC_MAX;
    return adcVolts * DIVIDER_RATIO;
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
