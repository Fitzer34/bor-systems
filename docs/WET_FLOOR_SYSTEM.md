# HazardLink Wet-Floor-Sign System — how it actually works

This is the real product. Use it so the Floor plans, Spill alerts and Devices features are accurate, not guessed.

## What it is
HazardLink's flagship hardware is a network of **smart wet-floor signs**. Each physical yellow "Caution — Wet Floor" A-frame sign carries a small battery sensor called a **hanger**. The hanger knows whether its sign is hanging on its rack/hook or has been lifted out onto the floor.

## The hardware
- **Hanger (the sensor):** Heltec WiFi LoRa 32 (ESP32). A **Hall-effect sensor** detects when the sign is lifted off its magnetic rack/hook. Long battery life via deep sleep; wakes to report a state change. Small OLED shows battery + signal on a button press. Talks over **HMAC-secured LoRa** radio (long range, low power). Each hanger has a unique DevEUI and a friendly ID like **HGR-1003**.
- **Gateway:** mains-powered base station. Receives LoRa from many hangers across a building and forwards securely to the cloud over WiFi. Self-registers on boot.

## Sign states = the floor-plan dot colours
- 🟢 **Green — hanging correctly:** sign is on its rack/hook, in place, no hazard. Ready to use.
- 🔴 **Red — lifted / deployed:** the sign has been taken off the rack and is out on the floor signing a hazard (a spill). This is a **live hazard / active spill**.
- 🟠 **Orange — offline:** the hanger isn't reporting (lost LoRa/gateway link or powered down); its true state is unknown.
- 🔋 **Low battery:** a separate badge on any sign whose hanger battery is low.

## The live flow
1. A spill happens; a staff member lifts a wet-floor sign and puts it out.
2. The hanger's Hall sensor detects the lift → LoRa message → gateway → cloud, with timestamp + location.
3. HazardLink raises a **real-time spill alert** (SP-####) to the on-shift cleaner and supervisor, and the sign turns **red** on the live floor plan.
4. If the spill isn't resolved (sign not returned) within the set time, it **auto-escalates** to the site manager.
5. When the floor is dry and the sign goes back on the rack, the hanger detects it → the alert resolves and the dot returns to **green**.

## Other behaviours
- **Anti-theft / tamper detection** — sign moved or removed when it shouldn't be.
- **Low-battery monitoring** per sensor.
- Each sign is a **pin on the building's actual floor-plan image**, coloured by the state above; clicking a pin shows sign ID, zone, status, battery, last-seen, last-lifted.

## In the product
- **Floor plans:** the building image with the coloured sign pins + legend + an editor to upload plans and place pins.
- **Spill alerts:** live / acknowledged / resolved spills with escalation timers, tied to the specific sign (HGR-#### / DevEUI) and its zone.
- **Devices:** hangers + gateways organised by building, with registration by ID/DevEUI and battery/signal status.
