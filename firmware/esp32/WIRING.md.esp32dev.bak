# TanzAlert breadboard wiring

## Power first

The ESP32, fingerprint scanner, and modem must share **GND**. Power the ESP32 by USB while developing. Power the R502S-A from the ESP32 **3V3** pin.

For a SIM7670/A7670 **development board or breakout with a pin explicitly marked `5V` or `VIN`**, use a separate regulated **5 V, 3 A** supply. Put a 470–1000 µF low-ESR capacitor and a 100 nF ceramic capacitor between the modem board's 5 V/VIN and GND pins, close to the board. Join its ground to ESP32 ground. Do not carry the modem supply through thin breadboard power rails.

A **bare SIM7670/A7670 module is not a 5 V part**. It needs a carrier, 3.4–4.2 V supply, correct power sequencing, antenna layout, and any required UART level conversion. Do not plug or solder a bare module directly to a breadboard. Confirm the exact carrier-board schematic and pin labels before applying power.

## Signal connections

| Part | Part pin | ESP32 / supply | Notes |
|---|---|---|---|
| R502S-A | VCC | 3V3 | Do not use 5 V unless your exact scanner datasheet explicitly allows it. |
| R502S-A | GND | GND | Common ground. |
| R502S-A | TX, yellow | GPIO 26 | ESP32 UART1 RX. |
| R502S-A | RX, green | GPIO 27 | ESP32 UART1 TX. |
| R502S-A | VT/touch, if present | 3V3 | Keeps the scanner awake; follow the exact module pinout. |
| SIM7670/A7670 breakout | 5V/VIN | Separate regulated 5 V, 3 A | Only for a board with a documented 5 V/VIN input. |
| SIM7670/A7670 breakout | GND | Supply GND and ESP32 GND | All grounds must join. |
| SIM7670/A7670 breakout | TXD | GPIO 16 | ESP32 UART2 RX. |
| SIM7670/A7670 breakout | RXD | GPIO 17 | ESP32 UART2 TX. Use a bidirectional level shifter if the carrier does not expose 3.3 V-safe TTL UART. |
| Emergency button | terminal 1 | GPIO 18 | Firmware uses `INPUT_PULLUP`. |
| Emergency button | terminal 2 | GND | Press connects GPIO 18 to ground. |
| Status LED | anode, long leg | GPIO 21 through 220–330 Ω | Resistor must be in series. |
| Status LED | cathode, short leg | GND | Flat side of common through-hole LED. |

Place the ESP32 across the breadboard center gap. Keep UART wires short. Connect the cellular and GNSS antennas before testing the modem, insert an activated SIM, and test outdoors or near a clear view of the sky. If the modem repeatedly restarts or loses network registration, fix its power wiring before debugging software.

`PWRKEY` varies by carrier board. Use the board's documented button during initial testing. If automatic control is later required, drive PWRKEY through a transistor circuit made for that carrier; never connect an unknown PWRKEY pin directly to an ESP32 GPIO.

## Device controls

- Scan the enrolled finger: the LED blinks three times on success.
- Within 30 seconds, hold the emergency button for 2 seconds: acquire a real GNSS fix and queue one General SOS.
- Hold the button for 8 seconds: open Bluetooth pairing for 2 minutes. If a fingerprint is already enrolled, scan it first.
- Two slower LED blinks indicate rejected authentication, GNSS timeout, or enrollment failure.
