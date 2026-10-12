# TanzAlert breadboard wiring — ESP32-C6-DevKitC-1

> This board is **not** the classic ESP32. The pin map below is specific to the
> ESP32-C6-DevKitC-1. If you move to a different C6 module (DevKitM-1, Super Mini,
> XIAO C6), re-check every pin against that board's own datasheet first.

This is the board-level companion to the top-level [`WIRING.md`](../../WIRING.md), and
the two tables agree. If either disagrees with the boot banner, trust the banner — it
prints the pin map the binary was actually built with.

## Power first

The ESP32-C6, fingerprint scanner, GNSS receiver and modem must share **GND**. Power the
C6 by USB while developing. Power the R502S-A from the C6 **3V3** pin — C6 logic is 3.3 V.

For a SIM7670/A7670 **development board or breakout with a pin explicitly marked `5V` or `VIN`**,
use a separate regulated **5 V, 3 A** supply. Put a 470–1000 µF low-ESR capacitor and a
100 nF ceramic capacitor between the modem board's 5 V/VIN and GND pins, close to the board.
Join its ground to C6 ground. Do not carry the modem supply through thin breadboard power rails.

A **bare SIM7670/A7670 module is not a 5 V part**. It needs a carrier, 3.4–4.2 V supply,
correct power sequencing, antenna layout, and any required UART level conversion. Do not plug
or solder a bare module directly to a breadboard. Confirm the exact carrier-board schematic
and pin labels before applying power.

## Which USB port to plug into

The DevKitC-1 has **two USB-C ports**, labelled `USB` and `COM` (or `UART`) on most boards.
The firmware is built with `ARDUINO_USB_CDC_ON_BOOT=1`, so the serial console appears on the
**native `USB` port** (the one wired to GPIO12/13), *not* the `COM` bridge port.

| Port | Windows shows | Upload | Serial monitor |
|---|---|---|---|
| `USB` (native, GPIO12/13) | `USB Serial Device (COMx)`, VID 303A | yes | **yes** - use this one |
| `COM` (CH343/CP2102 bridge, GPIO16/17) | `USB-Enhanced-SERIAL CH343 (COMx)` | yes | only ROM boot messages, then silence |

Plug into `USB` for everyday work. If the monitor is silent, you are almost certainly on the
wrong port. Because GPIO12/13 carry the console, **nothing else may be wired to them**; the
firmware refuses to compile if a pin constant lands there.

## Signal connections

| Part | Part pin | ESP32-C6 / supply | Notes |
|---|---|---|---|
| R502S-A | VCC | 3V3 | Do not use 5 V unless your exact scanner datasheet explicitly allows it. |
| R502S-A | GND | GND | Common ground. |
| R502S-A | TX, yellow | **GPIO 20** | C6 UART0 RX. |
| R502S-A | RX, green | **GPIO 21** | C6 UART0 TX. |
| R502S-A | VT/touch, if present | 3V3 | Keeps the scanner awake; follow the exact module pinout. |
| GY-NEO6MV2 GPS breakout | TX | **GPIO 6** | C6 UART1 RX, 9600 baud. |
| GY-NEO6MV2 GPS breakout | RX | *unconnected* | The firmware only listens; it never configures the receiver. |
| GY-NEO6MV2 GPS breakout | VCC | Documented breakout power input | Use its documented supply; the GPS UART must be 3.3 V-safe. |
| GY-NEO6MV2 GPS breakout | GND | C6 GND | Common ground. |
| SIM7670/A7670 breakout | 5V/VIN | Separate regulated 5 V, 3 A | Only for a board with a documented 5 V/VIN input. |
| SIM7670/A7670 breakout | GND | Supply GND and C6 GND | All grounds must join. |
| SIM7670/A7670 breakout | TXD | **GPIO 4** | C6 **LP_UART** RX. This pad is fixed in silicon — see below. |
| SIM7670/A7670 breakout | RXD | **GPIO 5** | C6 **LP_UART** TX. Use a bidirectional level shifter if the carrier does not expose 3.3 V-safe TTL UART. |
| Emergency button | terminal 1 | **GPIO 18** | Firmware uses `INPUT_PULLUP`. |
| Emergency button | terminal 2 | GND | Press connects GPIO 18 to ground. See the warning below. |
| Status LED | anode, long leg | **GPIO 19** through 220–330 Ω | Resistor must be in series. |
| Status LED | cathode, short leg | GND | Flat side of common through-hole LED. |

The modem's **UART must be wired to the C6** — plugging the modem's own USB port into a PC
lets you send AT commands from the PC, but the firmware can only reach LTE over GPIO 4/5.

The boot banner prints the pin map the firmware was built with (`pins: fp=20/21 gps=6
modem=4/5 btn=18 led=19`). If the banner disagrees with this table, the table is stale —
trust the banner.

## Why the modem sits on GPIO 4/5 and cannot be moved

The device needs three serial peripherals. The C6 has **two** high-performance UARTs
(UART0, UART1) plus one **low-power UART**, and ESP-IDF exposes that third one to Arduino
as `Serial2`. So:

| Peripheral | UART | Pins | Baud |
|---|---|---|---|
| Console | native USB Serial/JTAG | GPIO12/13 | 115200 |
| Fingerprint scanner | UART0 (`Serial0`) | GPIO20 / GPIO21 | 57600 |
| NEO-6M GNSS | UART1 (`Serial1`) | GPIO6 (RX only) | 9600 |
| SIM7670/A7670 modem | LP_UART (`Serial2`) | GPIO4 / GPIO5 | 115200 |

**LP_UART's pads are fixed in hardware at GPIO4 (RX) and GPIO5 (TX).** Unlike the other
UARTs it is not routable through the GPIO matrix, so moving these two wires produces a
modem that never answers — which looks exactly like a wiring fault. `main.cpp` carries a
`static_assert` that refuses to build if those constants are edited, rather than letting
the fault reach the bench.

GPIO 4 and 5 are also strapping pins. They are sampled only at reset and an idle UART line
sits high, which is what both straps want, so this is safe once the board is running. Never
hold either pin low while resetting.

The scanner deliberately gets UART0: ESP-IDF still treats UART0 as its primary console, and
the scanner's packet protocol ignores any stray text, whereas the modem's AT parser would
answer every stray line with `ERROR`. `setup()` additionally unhooks the ROM print channel
from UART0 so nothing leaks at all. Building without `ARDUINO_USB_CDC_ON_BOOT=1` trips a
`#error` in `main.cpp` rather than failing mysteriously at runtime.

Keep UART wires short. Connect the cellular antenna before testing the modem and insert an
activated SIM. Test the GNSS receiver outdoors or near a clear view of the sky — a cold start
can take several minutes. If the modem repeatedly restarts or loses network registration, fix
its power wiring before debugging software.

`PWRKEY` varies by carrier board. Use the board's documented button during initial testing.
If automatic control is later required, drive PWRKEY through a transistor circuit made for
that carrier; never connect an unknown PWRKEY pin directly to a C6 GPIO.

## Built-in diagnostics

Open the serial monitor on the native `USB` port and press a single key. Nothing needs to be
recompiled, and every check reports what a healthy result looks like.

| Key | What it does |
|---|---|
| any other key | Reprint the boot banner, including the live button level and GNSS state |
| `p` | Print the live logic level on the button, LED, scanner RX, GPS RX and modem RX pads |
| `b` | Decide whether the button pad is floating, tied to GND or tied to 3V3, then watch it for 10 s while you press it |
| `f` | Try the fingerprint scanner at 9600, 19200, 38400, 57600 and 115200 baud, then repeat with the two data wires swapped |
| `m` | Send `AT` to the modem three times and print exactly what came back |
| `g` | Count NMEA bytes for 5 s, then say whether the receiver is unwired, searching, or holding a fix |
| `l` | LTE preflight: SIM, signal, registration, radio, bearer, and what was provisioned |
| `c` | List the modem's certificates and compare them against the provisioned CA filename |
| `t` | Post to `<apiBase>/health` over cellular — proves direct delivery end to end |

A scanner that stays silent on all ten `f` combinations is almost always unpowered: check 3V3
and GND at the sensor before touching the data wires. Likewise, `g` separates the two GNSS
faults that look identical from the app: **no bytes at all** means the receiver is unwired or
unpowered, while **bytes but no fix** means the wiring is correct and it is still searching.

For direct cellular delivery, work `l` → `c` → `t` in that order: `l` finds a SIM, signal or
registration problem, `c` finds a certificate problem, and `t` confirms the whole path. Setup
details are in [`README.md`](README.md#direct-cellular-delivery).

## Wiring a 4-pin tactile switch

A 4-pin tactile push button does **not** have four independent terminals. The pins form
**two pairs that are permanently joined inside the body**, and pressing the button connects
the two pairs to each other. Wiring across a pair that is already joined gives a circuit that
is closed forever, so the firmware sees the button as held down from the moment it powers up
and every gesture is misread.

Use two pins on **opposite** sides of the switch body, or check with a multimeter in
continuity mode: the correct pair beeps **only while the button is held**. Press `b` in the
serial monitor to have the firmware tell you which case you are in.

## Pins you must not use

| GPIO | Why |
|---|---|
| 12, 13 | Native USB D− / D+ — this is the serial console port. The firmware's `static_assert` rejects them. |
| 16, 17 | UART0 defaults, wired to the devkit's USB-UART bridge. Also rejected at compile time. |
| 9 | Strapping **and** the BOOT button |
| 15 | Strapping pin — sampled at reset |
| 24–30 | SPI flash — not broken out on this board |

GPIO 4 and 5 are strapping pins too, but they are the modem's fixed LP_UART pads and are
used deliberately; see the section above.

## Device controls

- **Scan the enrolled slot-1 finger.** Three LED pulses confirm verification; two mean the
  finger was not recognised. This opens a 30-second authorisation window.
- **Within 30 seconds, tap and release the button.** One account-linked General SOS is sent
  immediately. One verification authorises exactly one SOS.
- **Hold for three seconds** to open pairing for two minutes. This hold never sends an SOS on
  release. Scan the enrolled finger first if one is already enrolled.
- First pairing needs no enrolled finger. Enroll the same finger twice from the paired app.

**The SOS does not wait for GPS.** It leaves on the button release with whatever position is
already in hand — usually none, because a cold GNSS start takes minutes and a victim cannot
stand still through one. The incident appears on the dashboard immediately, marked
**Waiting for GPS**, and the device then streams its position roughly every 10 seconds into
that same incident until a dispatcher resolves it. The first valid fix fills in the location
and the map pin appears; it never creates a second incident.

A reset mid-incident does not stop the stream: the active event ID is kept in NVS and
transmission resumes on boot. The stream ends only when the server replies that the incident
is closed, so a dropped reply leaves the device transmitting rather than going quiet on a
live alert.

### LED pulses

| Pulses | Meaning |
|---|---|
| 1 | Alert queued on the device |
| 3 | Fingerprint verified, **or** `Server confirmed … revision …` — the backend has it |
| 2 | Authentication or setup rejected, or fingerprint enrollment failed |
| 5 | Queue/storage failure — the alert could not be written to flash and a reset would lose it |

Read the serial log or the app diagnostics to tell the 2-pulse cases apart.

The serial console at 115200 on the native USB port prints a boot banner with the live pin
map, fingerprint sensor status, GNSS state, queue depth, whether an incident is currently
being tracked, and every button, fingerprint, GNSS and LTE event.
