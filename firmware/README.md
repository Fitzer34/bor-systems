# BOR Systems — Hanger Firmware

PlatformIO project targeting the **STM32WLE5** SoC inside the **RAK3172** module on a **RAK Wisblock** baseboard for the prototype. Same firmware will run on the production custom PCB.

## Hardware interface

| Signal | Wisblock pin | Notes |
|---|---|---|
| Microswitch | GPIO with internal pull-up | Closed = sign present (idle); open = sign lifted |
| Test button | GPIO with internal pull-up | Brief press lights green LED for 5 s |
| LED red | GPIO | On during alert |
| LED green | GPIO | On for 5 s on test press |
| LED amber | GPIO | Blinks on test press if battery < 20% |
| Buzzer (optional) | GPIO PWM | Configurable per-hanger via downlink |

## State machine

Idle → Alert (microswitch opens) → Cleared (microswitch closes) → Idle. 24-hour heartbeat in any state. Battery percentage is sent in every uplink; backend raises a "low battery" alert when it crosses a threshold.

## Payload

4-byte binary, defined in [`shared/payload.ts`](../shared/payload.ts). Keep `src/main.cpp` in sync with that codec.

## Status

`src/main.cpp` is a structural sketch — the LoRaWAN join + send calls are stubbed because hardware isn't on hand yet. Ready to be filled in against the RAK3172 RUI3 SDK or MCCI LoRaWAN-LMIC once a board arrives.
