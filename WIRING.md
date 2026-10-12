# TanzAlert breadboard wiring

## Power first

The ESP32, fingerprint scanner, and modem must share **GND**. Power and monitor the ESP32-C6 through its **native USB** connector while developing. Its CH343/USB-UART connector is a different interface. Native USB frees UART0 for the fingerprint reader. If your board does not expose native USB, this pin assignment requires a different console solution before uploading. Power the R502S-A from the ESP32 **3V3** pin.

For a SIM7670/A7670 **development board or breakout with a pin explicitly marked `5V` or `VIN`**, use a separate regulated **5 V, 3 A** supply. Put a 470–1000 µF low-ESR capacitor and a 100 nF ceramic capacitor between the modem board's 5 V/VIN and GND pins, close to the board. Join its ground to ESP32 ground. Do not carry the modem supply through thin breadboard power rails.

A **bare SIM7670/A7670 module is not a 5 V part**. It needs a carrier, 3.4–4.2 V supply, correct power sequencing, antenna layout, and any required UART level conversion. Do not plug or solder a bare module directly to a breadboard. Confirm the exact carrier-board schematic and pin labels before applying power.

## Signal connections

| Part | Part pin | ESP32 / supply | Notes |
|---|---|---|---|
| R502S-A | VCC | 3V3 | Do not use 5 V unless your exact scanner datasheet explicitly allows it. |
| R502S-A | GND | GND | Common ground. |
| R502S-A | TX, yellow | GPIO 20 | ESP32 UART0 RX. |
| R502S-A | RX, green | GPIO 21 | ESP32 UART0 TX. |
| R502S-A | VT/touch, if present | 3V3 | Keeps the scanner awake; follow the exact module pinout. |
| SIM7670/A7670 breakout | 5V/VIN | Separate regulated 5 V, 3 A | Only for a board with a documented 5 V/VIN input. |
| SIM7670/A7670 breakout | GND | Supply GND and ESP32 GND | All grounds must join. |
| SIM7670/A7670 breakout | TXD | GPIO 4 | ESP32 UART2 RX. On the C6 this is the low-power UART, whose pads are fixed in silicon; see below. |
| SIM7670/A7670 breakout | RXD | GPIO 5 | ESP32 UART2 TX. Use a bidirectional level shifter if the carrier does not expose 3.3 V-safe TTL UART. |
| GY-NEO6MV2 GPS breakout | TX | GPIO 6 | UART1 RX at 9600 baud; GPS RX is unconnected. |
| GY-NEO6MV2 GPS breakout | VCC | Documented breakout power input | Use its documented supply; GPS UART must be 3.3 V-safe. |
| GY-NEO6MV2 GPS breakout | GND | ESP32 GND | Common ground. |
| Emergency button | terminal 1 | GPIO 18 | Firmware uses `INPUT_PULLUP`. |
| Emergency button | terminal 2 | GND | Press connects GPIO 18 to ground. |
| Status LED | anode, long leg | GPIO 19 through 220–330 Ω | Resistor must be in series. |
| Status LED | cathode, short leg | GND | Flat side of common through-hole LED. |

## UART budget

Three serial peripherals on a chip with two high-performance UARTs. The console moves to native USB to free UART0, and the modem takes the third, low-power UART:

| Peripheral | UART | Pins | Baud |
|---|---|---|---|
| Console | native USB Serial/JTAG | GPIO 12/13 | 115200 |
| R502S-A fingerprint scanner | UART0 (`Serial0`) | GPIO 20/21 | 57600 |
| GY-NEO6MV2 GNSS | UART1 (`Serial1`) | GPIO 6, RX only | 9600 |
| SIM7670/A7670 modem | LP_UART (`Serial2`) | GPIO 4/5 | 115200 |

**The LP_UART pads are fixed at GPIO 4 (RX) and GPIO 5 (TX).** Unlike the other UARTs it is not routable through the GPIO matrix, so moving the modem's two data wires produces a modem that never answers — indistinguishable from a wiring fault. `firmware/esp32/src/main.cpp` carries a `static_assert` that refuses to build if those constants are edited. GPIO 4 and 5 are strapping pins, but they are sampled only at reset and an idle UART line sits high, which is what both straps want; never hold either low while resetting.

The boot banner prints the pin map the binary was built with (`pins: fp=20/21 gps=6 modem=4/5 btn=18 led=19`). If this table disagrees with the banner, trust the banner.

Place the ESP32 across the breadboard center gap. Keep UART wires short. Connect the cellular and GNSS antennas before testing the modem, insert an activated SIM, and test outdoors or near a clear view of the sky. If the modem repeatedly restarts or loses network registration, fix its power wiring before debugging software.

`PWRKEY` varies by carrier board. Use the board's documented button during initial testing. If automatic control is later required, drive PWRKEY through a transistor circuit made for that carrier; never connect an unknown PWRKEY pin directly to an ESP32 GPIO.

## Device controls

- Scan the enrolled slot-1 finger: three LED pulses confirm verification.
- Within 30 seconds, tap and release the button: one account-linked General SOS is queued. One verification authorizes one SOS.
- Hold for three seconds: open pairing for two minutes. This hold never sends SOS on release. Scan first if a fingerprint is already enrolled.
- First pairing needs no enrolled finger. Enroll the same finger twice from the paired app.
- One LED pulse means queued; three pulses plus `Server confirmed ... revision ...` means acknowledged by the backend. Two pulses mean authentication/setup rejection or enrollment failure; five mean queue/storage failure. Read app diagnostics to distinguish these states.
- SOS does not wait for GPS. Without a fresh NEO-6M fix the incident says **Waiting for GPS**; the first valid fix updates the same incident.
- While an incident is open the device streams its position about every 10 seconds into that same incident, and stops only when the backend replies that a dispatcher has resolved it. A reset mid-incident resumes the stream on boot, and a dropped reply leaves the device transmitting rather than going quiet on a live alert.

The native USB COM port can differ from the CH343 port and may re-enumerate after flashing. Close other Serial Monitors before upload or log capture. Leave ESP32 GPIO12/13 free for native USB.
