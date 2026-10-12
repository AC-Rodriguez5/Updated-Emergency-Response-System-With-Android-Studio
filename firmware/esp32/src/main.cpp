#include <Arduino.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <Adafruit_Fingerprint.h>
#include <esp_rom_sys.h>
#include <esp_mac.h>
#include <sdkconfig.h>

// Bluedroid needs an explicit 0x2902 (CCCD) descriptor before a characteristic can
// notify. NimBLE - the BLE host the prebuilt SDK uses for the ESP32-C6 - creates it
// automatically and its BLE2902 class is deprecated, so only pull it in for Bluedroid.
#if defined(CONFIG_BLUEDROID_ENABLED)
#include <BLE2902.h>
#define ADD_CCCD(characteristic) (characteristic)->addDescriptor(new BLE2902())
#else
#define ADD_CCCD(characteristic) ((void)0)
#endif

// Three serial peripherals on a chip with two high-performance UARTs. The console
// moves to native USB to free UART0, and the modem takes the low-power UART, whose
// pads are fixed in silicon at GPIO4/5 - which is exactly where WIRING.md puts it.
//
//   UART0      GPIO20/21  fingerprint scanner  (57600)
//   UART1      GPIO6      NEO-6M GNSS, RX only (9600)
//   LP_UART    GPIO4/5    SIM7670/A7670 modem  (115200)
//
// ESP32-C6-DevKitC-1 pins that must stay clear:
//   GPIO12, 13 - native USB D-/D+, the serial console (ARDUINO_USB_CDC_ON_BOOT=1).
//   GPIO16, 17 - UART0 default pads, hard-wired to the devkit's USB-UART bridge.
//   GPIO24-30  - SPI flash, not broken out on this board.
// GPIO4 and GPIO5 are strapping pins. They are sampled only at reset and an idle
// UART line sits high, which is what both straps want, so carrying the modem here
// is safe once the board is running - but never hold either low while resetting.
namespace Pins {
constexpr uint8_t fingerprintRx = 20;    // ESP32 RX  <- R502S-A TX (yellow)
constexpr uint8_t fingerprintTx = 21;    // ESP32 TX  -> R502S-A RX (green)
constexpr uint8_t modemRx = 4;           // ESP32 RX  <- modem TXD   (LP_UART pad)
constexpr uint8_t modemTx = 5;           // ESP32 TX  -> modem RXD   (LP_UART pad)
constexpr uint8_t gpsRx = 6;             // ESP32 RX  <- NEO-6M TX
constexpr uint8_t emergencyButton = 18;  // other terminal to GND (INPUT_PULLUP)
constexpr uint8_t statusLed = 19;        // anode via 220-330 ohm, cathode GND

// Compile-time guards so a hand-edited pin can never land on the USB console pads,
// the UART bridge pins, or a pin this board does not break out.
constexpr bool usable(uint8_t pin) {
  return pin <= 23 && pin != 12 && pin != 13 && pin != 16 && pin != 17;
}
static_assert(usable(fingerprintRx) && usable(fingerprintTx) && usable(modemRx) &&
              usable(modemTx) && usable(gpsRx) && usable(emergencyButton) &&
              usable(statusLed),
              "Pin map error: GPIO12/13 are the native USB console pads, GPIO16/17 belong to the "
              "USB-UART bridge, and GPIO24+ are not broken out on the ESP32-C6-DevKitC-1.");
static_assert(fingerprintRx != fingerprintTx && modemRx != modemTx &&
              gpsRx != fingerprintRx && gpsRx != fingerprintTx && gpsRx != modemRx &&
              gpsRx != modemTx && gpsRx != emergencyButton && gpsRx != statusLed &&
              fingerprintRx != modemRx && fingerprintRx != modemTx &&
              fingerprintTx != modemRx && fingerprintTx != modemTx &&
              emergencyButton != statusLed && emergencyButton != fingerprintRx &&
              emergencyButton != modemRx && statusLed != fingerprintTx &&
              statusLed != modemTx,
              "Pin map error: two peripherals share a GPIO.");
// The C6's low-power UART is not routable through the GPIO matrix. Moving these two
// constants anywhere else silently produces a modem that never answers, which is
// indistinguishable from a wiring fault, so refuse to build instead.
static_assert(modemRx == 4 && modemTx == 5,
              "The ESP32-C6 LP_UART pads are fixed at GPIO4 (RX) and GPIO5 (TX). "
              "Rewire the modem to those pins, or move it to UART1 and give the "
              "NEO-6M the LP_UART instead.");
}

#if !ARDUINO_USB_CDC_ON_BOOT || !ARDUINO_USB_MODE
#error "Build with -DARDUINO_USB_MODE=1 -DARDUINO_USB_CDC_ON_BOOT=1 so the console is the USB Serial/JTAG port and all three UARTs stay free for the scanner, GNSS and modem."
#endif
#if SOC_UART_NUM < 3
#error "This pin map needs three UARTs: UART0 for the scanner, UART1 for the NEO-6M, and the low-power UART for the modem. Select an ESP32-C6 (or another target with a third UART)."
#endif

constexpr char serviceUuid[] = "9f4d0001-7d6a-4b85-9e74-2f4d8e8d0001";
constexpr char eventUuid[] = "9f4d0002-7d6a-4b85-9e74-2f4d8e8d0002";
constexpr char heartbeatUuid[] = "9f4d0003-7d6a-4b85-9e74-2f4d8e8d0003";
constexpr char configUuid[] = "9f4d0004-7d6a-4b85-9e74-2f4d8e8d0004";
constexpr char firmwareVersion[] = "2.0.0";

constexpr uint32_t pairingHoldMs = 3000;        // hold this long to open pairing
constexpr uint32_t fingerprintWindowMs = 30000; // one scan authorises one tap
constexpr uint32_t pairingWindowMs = 120000;
constexpr uint32_t buttonDebounceMs = 30;
constexpr uint32_t heartbeatIntervalMs = 5000;
constexpr uint32_t trackIntervalMs = 10000;     // position stream cadence
constexpr uint32_t gpsFixMaxAgeMs = 30000;      // older than this is not "current"
constexpr uint8_t tlsContext = 0;               // modem SSL context used for HTTPS

// UART0 is also where ESP-IDF's primary console lives (CONFIG_ESP_CONSOLE_UART_DEFAULT
// in the prebuilt SDK), so stray ROM/IDF log lines can appear on its TX pin even
// though Serial is the USB CDC. The fingerprint scanner gets UART0 because its
// packet protocol silently ignores anything that is not a 0xEF01-framed packet,
// while the modem's AT parser would answer every stray line with "ERROR". setup()
// additionally unhooks the ROM print channel from UART0 so nothing leaks at all.
HardwareSerial &fingerprintSerial = Serial0;  // UART0,   pins remapped in setup()
HardwareSerial &gps = Serial1;                // UART1,   pins remapped in setup()
HardwareSerial &modem = Serial2;              // LP_UART, fixed pads GPIO4/5
Adafruit_Fingerprint finger(&fingerprintSerial);
Preferences prefs;
BLECharacteristic *eventCharacteristic = nullptr;
BLECharacteristic *heartbeatCharacteristic = nullptr;
BLECharacteristic *configCharacteristic = nullptr;

String deviceId;
constexpr uint8_t pendingSlots = 4;
String pendingEvents[pendingSlots];
bool buttonRaw = false;
bool buttonStable = false;
uint32_t buttonChangedAt = 0;
String enrollmentStatus = "not_started";
bool fingerprintReady = false;
bool fingerprintEnrolled = false;
bool directCellularEnabled = false;
bool enrollmentRequested = false;
uint32_t verifiedAt = 0;
uint32_t pairingUntil = 0;
uint32_t buttonDownAt = 0;
uint32_t lastHeartbeat = 0;
uint32_t lastTrackAt = 0;
bool buttonHandled = false;

// ---- cellular link state -------------------------------------------------
// The data bearer and the SSL context both persist inside the modem, so they are
// set up once per boot rather than on every post. That matters: an open incident
// posts a fix every 10 s, and re-running AT+NETOPEN and six AT+CSSLCFG commands
// each time would add seconds of latency to every position update.
bool bearerUp = false;
bool tlsConfigured = false;
uint8_t bearerFailures = 0;
String activeApn;        // the APN currently carrying traffic
String simPlmn;          // MCC+MNC read from the SIM, e.g. "51503" for Smart
String simBrands;        // human label for that network, for the log and the app
uint32_t nextCarrierReadAt = 20000;  // first SIM read, once the modem has booted

// ---- the incident this device is currently reporting on ------------------
// Survives a reset: a wearable that browns out mid-incident must come back still
// streaming, not silently stop. Cleared only when the server says the incident is
// closed, so a lost reply can never be mistaken for a resolution.
struct ActiveIncident {
  String eventId;
  String emergencyId;
  uint32_t revision = 0;
  bool tracking = false;
} active;

// ---- GNSS ---------------------------------------------------------------
// A NEO-6M emits NMEA continuously at 9600 baud. Position, satellite count and
// HDOP come from GGA; the calendar date only from RMC. Both are needed to stamp a
// fix with the ISO-8601 instant the backend validates against.
struct GpsFix {
  bool valid = false;
  double lat = 0;
  double lng = 0;
  double hdop = 99.0;
  int satellites = 0;
  String capturedAt;    // ISO-8601 UTC
  uint32_t receivedAt = 0;
} fix;

String gpsDate;         // ddmmyy, carried over from the most recent valid RMC
char nmeaLine[100];
uint8_t nmeaLength = 0;
uint32_t gpsBytes = 0;
uint32_t lastNmeaAt = 0;

void blink(uint8_t count, uint16_t onMs = 120, uint16_t offMs = 120) {
  for (uint8_t i = 0; i < count; ++i) {
    digitalWrite(Pins::statusLed, HIGH); delay(onMs);
    digitalWrite(Pins::statusLed, LOW); delay(offMs);
  }
}

// blink() blocks for up to ~700 ms. Acknowledgements and rejections both arrive
// inside a NimBLE GATT write callback, where a delay that long can make the host
// time the write out, so those paths only ask for pulses and loop() performs them.
uint8_t requestedPulses = 0;
void requestBlink(uint8_t count) {
  if (count > requestedPulses) requestedPulses = count;
}

void servicePendingBlink() {
  if (!requestedPulses) return;
  const uint8_t count = requestedPulses;
  requestedPulses = 0;
  blink(count);
}

bool pairingOpen() {
  return pairingUntil && static_cast<int32_t>(pairingUntil - millis()) > 0;
}

bool fingerprintWindowOpen() {
  return verifiedAt && millis() - verifiedAt <= fingerprintWindowMs;
}

bool haveCurrentFix() {
  return fix.valid && millis() - fix.receivedAt <= gpsFixMaxAgeMs;
}

// LTE posting and fingerprint enrolment each block loop() for up to 45 s and 60 s.
// The phone gives up after 30 s without a heartbeat and shows "Heartbeat lost", so
// every one of those waits pumps the heartbeat itself rather than letting the link
// look dead while the device is busy.
void pumpHeartbeat() {
  if (millis() - lastHeartbeat < heartbeatIntervalMs) return;
  lastHeartbeat = millis();
  if (heartbeatCharacteristic) {
    heartbeatCharacteristic->setValue(String(millis()).c_str());
    heartbeatCharacteristic->notify();
  }
}

// ---- NMEA decoding -------------------------------------------------------

bool nmeaChecksumOk(const char *line) {
  const char *star = strrchr(line, '*');
  if (!star || strlen(star) < 3) return false;
  uint8_t computed = 0;
  for (const char *p = line + 1; p < star; ++p) computed ^= static_cast<uint8_t>(*p);
  return computed == static_cast<uint8_t>(strtol(star + 1, nullptr, 16));
}

// Splits on commas in place. NMEA fields are frequently empty ("...,,,..."), so an
// empty slot is a normal value and not a parse failure.
uint8_t nmeaSplit(char *line, char **fields, uint8_t maxFields) {
  uint8_t count = 0;
  char *cursor = line;
  while (count < maxFields) {
    fields[count++] = cursor;
    char *comma = strchr(cursor, ',');
    if (!comma) break;
    *comma = '\0';
    cursor = comma + 1;
  }
  return count;
}

// NMEA ddmm.mmmm / dddmm.mmmm to signed decimal degrees.
bool nmeaCoordinate(const char *value, const char *hemisphere, double &out) {
  if (!value || !*value || !hemisphere || !*hemisphere) return false;
  const double raw = atof(value);
  const int degrees = static_cast<int>(raw / 100.0);
  out = degrees + (raw - degrees * 100.0) / 60.0;
  if (*hemisphere == 'S' || *hemisphere == 'W') out = -out;
  else if (*hemisphere != 'N' && *hemisphere != 'E') return false;
  return isfinite(out);
}

void handleRmc(char **fields, uint8_t count) {
  // $..RMC,hhmmss.ss,A/V,lat,N/S,lon,E/W,speed,course,ddmmyy,...
  if (count < 10) return;
  if (fields[2][0] != 'A') return;          // V = receiver warning, no valid fix
  if (strlen(fields[9]) >= 6) gpsDate = String(fields[9]).substring(0, 6);
}

void handleGga(char **fields, uint8_t count) {
  // $..GGA,hhmmss.ss,lat,N/S,lon,E/W,quality,satellites,hdop,altitude,...
  if (count < 9) return;
  const int quality = atoi(fields[6]);
  if (quality <= 0) {                        // 0 = no fix
    fix.valid = false;
    return;
  }
  double lat = 0, lng = 0;
  if (!nmeaCoordinate(fields[2], fields[3], lat)) return;
  if (!nmeaCoordinate(fields[4], fields[5], lng)) return;
  if (fabs(lat) > 90 || fabs(lng) > 180) return;
  // A position with no date cannot be stamped, and an unstamped fix is one the
  // backend rejects. Wait for the next RMC rather than inventing a timestamp.
  const char *utc = fields[1];
  if (gpsDate.length() != 6 || strlen(utc) < 6) return;

  fix.lat = lat;
  fix.lng = lng;
  fix.satellites = atoi(fields[7]);
  const double hdop = atof(fields[8]);
  // fromIotSchema rejects gnssHdop above 99, and an unknown value must not be
  // reported as a flattering one.
  fix.hdop = (hdop > 0.0) ? min(hdop, 99.0) : 99.0;
  fix.capturedAt = "20" + gpsDate.substring(4, 6) + "-" + gpsDate.substring(2, 4) + "-" +
                   gpsDate.substring(0, 2) + "T" + String(utc).substring(0, 2) + ":" +
                   String(utc).substring(2, 4) + ":" + String(utc).substring(4, 6) + "Z";
  const bool firstFix = !fix.valid;
  fix.valid = true;
  fix.receivedAt = millis();
  if (firstFix) {
    Serial.printf("[gps] first fix %s,%s hdop=%s sats=%d at %s\n",
                  String(fix.lat, 6).c_str(), String(fix.lng, 6).c_str(),
                  String(fix.hdop, 1).c_str(), fix.satellites, fix.capturedAt.c_str());
  }
}

// Drains whatever the receiver has sent. Never blocks: the SOS path must not wait
// on satellites, and the button must stay responsive while the receiver searches.
void pumpGnss() {
  while (gps.available()) {
    const char c = static_cast<char>(gps.read());
    ++gpsBytes;
    if (c == '$') { nmeaLength = 0; nmeaLine[nmeaLength++] = c; continue; }
    if (!nmeaLength) continue;                       // mid-sentence noise
    if (c == '\r' || c == '\n') {
      nmeaLine[nmeaLength] = '\0';
      nmeaLength = 0;
      lastNmeaAt = millis();
      if (!nmeaChecksumOk(nmeaLine)) continue;
      char *fields[20];
      const uint8_t count = nmeaSplit(nmeaLine, fields, 20);
      if (count < 2) continue;
      const char *talker = fields[0] + 3;            // skip "$Gx"
      if (!strncmp(talker, "RMC", 3)) handleRmc(fields, count);
      else if (!strncmp(talker, "GGA", 3)) handleGga(fields, count);
      continue;
    }
    if (nmeaLength < sizeof(nmeaLine) - 1) nmeaLine[nmeaLength++] = c;
    else nmeaLength = 0;                             // oversized, resynchronise
  }
}

// ---- pending SOS queue ---------------------------------------------------

bool persistPending() {
  bool ok = true;
  for (uint8_t i = 0; i < pendingSlots; ++i) {
    const String key = "p" + String(i);
    if (pendingEvents[i].length()) {
      if (!prefs.putString(key.c_str(), pendingEvents[i])) ok = false;
    } else {
      prefs.remove(key.c_str());
    }
  }
  return ok;
}

void loadPending() {
  for (uint8_t i = 0; i < pendingSlots; ++i) {
    pendingEvents[i] = prefs.getString(("p" + String(i)).c_str(), "");
  }
  // Carry over an undelivered alert written by the pre-queue firmware.
  const String legacy = prefs.getString("pending", "");
  if (legacy.length()) {
    for (uint8_t i = 0; i < pendingSlots; ++i) {
      if (!pendingEvents[i].length()) { pendingEvents[i] = legacy; break; }
    }
    prefs.remove("pending");
    persistPending();
  }
}

uint8_t pendingCount() {
  uint8_t c = 0;
  for (uint8_t i = 0; i < pendingSlots; ++i) if (pendingEvents[i].length()) ++c;
  return c;
}

bool hasPending() { return pendingCount() > 0; }

// Keeps every undelivered alert. Only when all slots are full does the oldest give
// way, so a second press can no longer erase an undelivered first alert.
bool queuePending(const String &event) {
  for (uint8_t i = 0; i < pendingSlots; ++i) {
    if (!pendingEvents[i].length()) { pendingEvents[i] = event; return persistPending(); }
  }
  for (uint8_t i = 1; i < pendingSlots; ++i) pendingEvents[i - 1] = pendingEvents[i];
  pendingEvents[pendingSlots - 1] = event;
  return persistPending();
}

void clearPending(const String &eventId) {
  bool changed = false;
  for (uint8_t i = 0; i < pendingSlots; ++i) {
    if (pendingEvents[i].length() && pendingEvents[i].indexOf(eventId) >= 0) {
      pendingEvents[i] = ""; changed = true;
    }
  }
  if (changed) persistPending();
}

// ---- active incident -----------------------------------------------------

void persistActive() {
  prefs.putString("actEvent", active.eventId);
  prefs.putString("actEmerg", active.emergencyId);
  prefs.putUInt("actRev", active.revision);
  prefs.putBool("actTrack", active.tracking);
}

void loadActive() {
  active.eventId = prefs.getString("actEvent", "");
  active.emergencyId = prefs.getString("actEmerg", "");
  active.revision = prefs.getUInt("actRev", 0);
  active.tracking = prefs.getBool("actTrack", false) && active.eventId.length();
}

// A second press while an incident is still open replaces the one being streamed.
// One fingerprint scan authorises one alert, so a new press means a new incident,
// and the newest one is the one a dispatcher needs positions for.
void startTracking(const String &eventId) {
  active.eventId = eventId;
  active.emergencyId = "";
  active.revision = 0;
  active.tracking = true;
  lastTrackAt = 0;                  // stream the first fix as soon as one exists
  persistActive();
}

void stopTracking(const char *reason) {
  if (!active.tracking && !active.eventId.length()) return;
  Serial.printf("[track] stopped (%s)\n", reason);
  active = ActiveIncident();
  persistActive();
}

// The server is the only authority on whether an incident is still open. Applied
// from both delivery paths - LTE reply and phone acknowledgement - so a wearable
// with no SIM still learns when to go quiet.
void applyServerAck(const String &eventId, const String &emergencyId,
                    long revision, int tracking) {
  if (active.eventId.length() && eventId.length() && eventId != active.eventId) return;
  const bool firstAck = !active.emergencyId.length();
  if (emergencyId.length()) active.emergencyId = emergencyId;
  if (revision >= 0) active.revision = static_cast<uint32_t>(revision);
  Serial.printf("[ack] Server confirmed %s revision %lu\n",
                active.emergencyId.length() ? active.emergencyId.c_str() : eventId.c_str(),
                static_cast<unsigned long>(active.revision));
  if (tracking == 0) {
    stopTracking("resolved by dispatch");
  } else {
    persistActive();
  }
  // Three pulses announce the alert itself being accepted. Repeating them for every
  // streamed fix would turn the signal into noise, so later acks get one short pulse
  // meaning "still reporting".
  requestBlink(firstAck ? 3 : 1);
}

String jsonIdentity() {
  JsonDocument doc;
  doc["deviceId"] = deviceId;
  doc["firmwareVersion"] = firmwareVersion;
  doc["fingerprintReady"] = fingerprintReady;
  doc["fingerprintEnrolled"] = fingerprintEnrolled;
  doc["pairingWindow"] = pairingOpen();
  doc["provisioned"] = prefs.getBool("provisioned", false);
  doc["directCellularEnabled"] = directCellularEnabled;
  doc["serverCertVerified"] = prefs.getString("caFile", "").length() > 0;
  doc["simBrands"] = simBrands;
  doc["activeApn"] = bearerUp ? activeApn : prefs.getString("apnOk", "");
  doc["cellularOnline"] = bearerUp;
  doc["enrollmentStatus"] = enrollmentStatus;
  doc["gpsFix"] = haveCurrentFix();
  doc["gpsSatellites"] = fix.satellites;
  doc["tracking"] = active.tracking;
  doc["activeEventId"] = active.eventId;
  doc["locationRevision"] = active.revision;
  String result; serializeJson(doc, result); return result;
}

void refreshIdentity() {
  if (configCharacteristic) configCharacteristic->setValue(jsonIdentity().c_str());
}

// ---- modem ---------------------------------------------------------------

String modemCommand(const String &command, uint32_t timeoutMs = 1500) {
  while (modem.available()) modem.read();
  modem.println(command);
  String output;
  const uint32_t deadline = millis() + timeoutMs;
  while (static_cast<int32_t>(deadline - millis()) > 0) {
    while (modem.available()) output += static_cast<char>(modem.read());
    if (output.indexOf("\r\nOK\r\n") >= 0 || output.indexOf("\r\nERROR\r\n") >= 0) break;
    delay(5);
  }
  return output;
}

bool atOk(const String &command, uint32_t timeoutMs = 3000) {
  return modemCommand(command, timeoutMs).indexOf("OK") >= 0;
}

// ---- carrier APN table ---------------------------------------------------
//
// A wearable is handed out with whatever SIM is cheapest that month, so the APN
// cannot be a build-time constant. These are the Philippine networks by the home
// PLMN in the SIM's IMSI (MCC 515). Several retail brands share one network and
// therefore one APN: TM and GOMO are Globe, TNT is Smart.
//
// Sources: ITU/Wikipedia MCC-MNC register for the codes, each carrier's own APN
// documentation for the names (DITO publishes internet.dito.ph at dito.ph/apn).
struct ApnEntry {
  const char *plmn;
  const char *apn;
  const char *brands;
};

constexpr ApnEntry apnTable[] = {
  {"51502", "internet.globe.com.ph", "Globe / TM / GOMO"},
  {"51501", "internet.globe.com.ph", "Islacom (Globe)"},
  {"51524", "internet.globe.com.ph", "ABS-CBN Mobile (on Globe)"},
  {"51503", "internet",              "Smart / TNT"},
  {"51518", "internet",              "Cure (Smart)"},
  {"51505", "minternet",             "Sun Cellular"},
  {"51566", "internet.dito.ph",      "DITO"},
};

// Tried in order when the SIM's network is unknown, or when its table APN did not
// produce a usable bearer. The blank entry comes first on purpose: most current
// LTE SIMs carry their own profile and the network assigns the right APN, which
// makes a blank the single most likely candidate to work on an unknown SIM.
constexpr const char *apnFallbacks[] = {
  "",                        // let the network assign one from the SIM profile
  "internet",                // Smart, TNT, DITO data-only, many MVNOs
  "internet.globe.com.ph",   // Globe, TM, GOMO
  "internet.dito.ph",        // DITO
  "smartlte",                // Smart's LTE-specific alternative
  "minternet",               // Sun Cellular
  "http.globe.com.ph",       // older Globe profile
};

constexpr uint8_t maxApnCandidates = 12;

// The modem answers AT+CIMI with the bare IMSI on its own line. Scan for a run of
// at least 15 digits so a "+CME ERROR: 10" reply (no SIM) cannot be mistaken for
// one, which would silently pick a wrong carrier's APN.
String extractImsi(const String &response) {
  String run;
  for (size_t i = 0; i <= response.length(); ++i) {
    const char c = i < response.length() ? response[i] : '\0';
    if (c >= '0' && c <= '9') { run += c; continue; }
    if (run.length() >= 15) return run.substring(0, 15);
    run = "";
  }
  return String();
}

// Identifies the SIM's home network. This is the SIM's own carrier rather than the
// registered one, which is what APN selection wants: a roaming Globe SIM still
// needs the Globe APN.
void detectCarrier() {
  const String imsi = extractImsi(modemCommand("AT+CIMI", 3000));
  if (imsi.length() < 5) {
    simPlmn = "";
    simBrands = "unknown (no SIM, or the SIM is locked)";
    Serial.println("[sim] could not read the IMSI - check that a SIM is seated and unlocked");
    return;
  }
  simPlmn = imsi.substring(0, 5);
  simBrands = "unrecognised network";
  for (const auto &entry : apnTable) {
    if (simPlmn == entry.plmn) { simBrands = entry.brands; break; }
  }
  // The IMSI identifies the subscriber, so log only the network half of it.
  Serial.printf("[sim] home network %s = %s\n", simPlmn.c_str(), simBrands.c_str());
}

/** Orders the APNs to try, most likely first. Returns how many were written. */
uint8_t buildApnOrder(String *out) {
  uint8_t count = 0;
  bool blankQueued = false;
  auto push = [&](const char *apn) {
    if (count >= maxApnCandidates) return;
    const String candidate(apn);
    // An empty APN is a real candidate, not a missing one, so it needs its own
    // de-duplication flag rather than being compared as a string.
    if (!candidate.length()) {
      if (blankQueued) return;
      blankQueued = true;
    } else {
      for (uint8_t i = 0; i < count; ++i) if (out[i] == candidate) return;
    }
    out[count++] = candidate;
  };

  // 1. An explicitly provisioned APN wins: whoever typed one in knows something
  //    this table does not.
  const String provisioned = prefs.getString("apn", "");
  if (provisioned.length()) push(provisioned.c_str());
  // 2. Whatever worked last time, so the usual case costs one attempt.
  const String remembered = prefs.getString("apnOk", "");
  if (remembered.length()) push(remembered.c_str());
  // 3. The APN this SIM's carrier documents.
  for (const auto &entry : apnTable) {
    if (simPlmn.length() && simPlmn == entry.plmn) push(entry.apn);
  }
  // 4. Everything else, blank first.
  for (const char *apn : apnFallbacks) push(apn);
  return count;
}

/**
 * Tries one APN and reports whether it produced a usable bearer.
 *
 * AT+NETOPEN can answer OK without the network having assigned an address, which
 * is indistinguishable from a working bearer until the first request times out
 * thirty seconds later. An actual IP address is the cheap, honest test, so a wrong
 * APN is rejected in about a second instead of poisoning the next request.
 */
bool tryApn(const String &apn) {
  modemCommand("AT+NETCLOSE", 5000);          // start from a known state
  atOk("AT+CGDCONT=1,\"IP\",\"" + apn + "\"");
  const String open = modemCommand("AT+NETOPEN", 20000);
  if (open.indexOf("OK") < 0 && open.indexOf("already") < 0 &&
      open.indexOf("+NETOPEN: 0") < 0) {
    return false;
  }
  const String ip = modemCommand("AT+IPADDR", 5000);
  return ip.indexOf("+IPADDR:") >= 0 && ip.indexOf("0.0.0.0") < 0;
}

/**
 * Brings up the packet data bearer, walking the APN candidates until one yields an
 * IP address. The winner is remembered in NVS so a reboot does not re-search.
 */
bool ensureBearer() {
  if (bearerUp) return true;
  if (!simPlmn.length()) detectCarrier();

  String order[maxApnCandidates];
  const uint8_t count = buildApnOrder(order);
  for (uint8_t i = 0; i < count; ++i) {
    const String &apn = order[i];
    Serial.printf("[lte] trying APN %u/%u: %s\n", i + 1, count,
                  apn.length() ? apn.c_str() : "(blank - network assigned)");
    if (tryApn(apn)) {
      activeApn = apn;
      prefs.putString("apnOk", apn);
      bearerUp = true;
      Serial.printf("[lte] connected on %s\n",
                    apn.length() ? apn.c_str() : "(blank - network assigned)");
      return true;
    }
    pumpHeartbeat();
    pumpGnss();
  }
  Serial.printf("[lte] no APN produced a data connection (tried %u). The SIM reports\n", count);
  Serial.printf("      %s. Press 'l' to check registration first - an unregistered\n",
                simBrands.length() ? simBrands.c_str() : "no network");
  Serial.println("      modem fails every APN identically. Press 'a' to retry the walk.");
  return false;
}

/**
 * Configures the SSL context every HTTPS request selects.
 *
 * This has to happen before AT+HTTPINIT - the A76XX application note sets the
 * context up first and then points a request at it with AT+HTTPPARA="SSLCFG".
 * Without it the TLS handshake fails and every alert silently falls back to the
 * phone relay, which looks exactly like "direct LTE does not work".
 *
 * authmode 1 verifies the server certificate against a CA already present in the
 * modem's own filesystem, loaded once with AT+CCERTDOWN (see the firmware README).
 * With no CA the context falls back to authmode 0, which still encrypts but does
 * not authenticate the server. The request carries this device's bearer token, so
 * that state is logged on every boot rather than passing quietly.
 */
bool ensureTls() {
  if (tlsConfigured) return true;
  const String caFile = prefs.getString("caFile", "");
  bool ok = true;
  // 4 = accept SSL3.0 through TLS1.2, which is the widest the A76XX offers.
  if (!atOk("AT+CSSLCFG=\"sslversion\"," + String(tlsContext) + ",4")) ok = false;
  // Without SNI a shared-IP host (Cloudflare, most PaaS) serves the wrong
  // certificate and the handshake fails for reasons that look like a CA problem.
  if (!atOk("AT+CSSLCFG=\"enableSNI\"," + String(tlsContext) + ",1")) ok = false;
  if (caFile.length()) {
    if (!atOk("AT+CSSLCFG=\"authmode\"," + String(tlsContext) + ",1")) ok = false;
    if (!atOk("AT+CSSLCFG=\"cacert\"," + String(tlsContext) + ",\"" + caFile + "\"")) ok = false;
    if (ok) Serial.printf("[tls] server verification ON against %s\n", caFile.c_str());
  } else {
    if (!atOk("AT+CSSLCFG=\"authmode\"," + String(tlsContext) + ",0")) ok = false;
    Serial.println("[tls] WARNING: no CA loaded on the modem, so the server certificate");
    Serial.println("      is NOT verified. Traffic is encrypted but a man-in-the-middle");
    Serial.println("      could read this device's token. Load a CA with AT+CCERTDOWN and");
    Serial.println("      re-pair with MODEM_CA_FILE set. Press 'c' to list what is loaded.");
  }
  if (!ok) Serial.println("[tls] CSSLCFG setup failed - the handshake will not succeed");
  tlsConfigured = ok;
  return ok;
}

/**
 * POSTs one JSON document and reads the reply body.
 *
 * The body matters: it is the only place the device learns the incident's revision
 * and whether dispatch has closed it. An HTTP status alone would leave the wearable
 * transmitting forever.
 */
bool postOverLte(const String &path, const String &body, String &responseBody) {
  responseBody = "";
  if (!directCellularEnabled) { Serial.println("[lte] skipped: direct cellular disabled"); return false; }
  const String apiBase = prefs.getString("apiBase", "");
  const String token = prefs.getString("token", "");
  // No APN check: it is discovered from the SIM rather than provisioned, so a
  // device handed any Philippine SIM can still deliver.
  if (!apiBase.startsWith("https://") || !token.length()) {
    // Never log the token itself, only whether one is present.
    Serial.printf("[lte] skipped: https=%d token=%d\n",
                  apiBase.startsWith("https://") ? 1 : 0, token.length() ? 1 : 0);
    return false;
  }
  Serial.printf("[lte] POST %s\n", path.c_str());
  modemCommand("AT+HTTPTERM");
  if (!ensureBearer()) return false;
  // An https:// base without a configured SSL context fails the handshake, and
  // posting the device token over an unconfigured context is not worth the attempt.
  if (!ensureTls()) return false;
  if (modemCommand("AT+HTTPINIT", 5000).indexOf("OK") < 0) { bearerUp = false; return false; }
  modemCommand("AT+HTTPPARA=\"URL\",\"" + apiBase + path + "\"");
  modemCommand("AT+HTTPPARA=\"SSLCFG\"," + String(tlsContext));
  modemCommand("AT+HTTPPARA=\"CONTENT\",\"application/json\"");
  // One header only. Embedding a second with a literal CR LF would terminate the AT
  // command line early on most SIMCom firmwares; the backend's device guard falls
  // back to the deviceId in the body, so X-Device-Id buys nothing here.
  modemCommand("AT+HTTPPARA=\"USERDATA\",\"Authorization: Device " + token + "\"");
  modem.println("AT+HTTPDATA=" + String(body.length()) + ",10000");
  delay(250); modem.print(body); delay(500);
  while (modem.available()) modem.read();
  modem.println("AT+HTTPACTION=1");
  String response;
  const uint32_t actionDeadline = millis() + 30000;
  while (static_cast<int32_t>(actionDeadline - millis()) > 0) {
    while (modem.available()) response += static_cast<char>(modem.read());
    if (response.indexOf("+HTTPACTION:") >= 0) break;
    pumpHeartbeat();
    delay(10);
  }
  const int marker = response.indexOf("+HTTPACTION: 1,");
  if (marker < 0) {
    modemCommand("AT+HTTPTERM");
    // Could be a dead bearer rather than a dead request, so stop trusting the
    // cached bearer state and re-dial on the next attempt.
    bearerUp = false;
    Serial.println("[lte] no HTTPACTION response (check antenna, APN, registration)");
    // An APN that brings up a bearer but never completes a request is the
    // signature of a swapped SIM. Forget the remembered one after two failures so
    // the next attempt searches the table again instead of retrying it forever.
    if (++bearerFailures >= 2) {
      bearerFailures = 0;
      if (prefs.getString("apnOk", "").length()) {
        Serial.println("[lte] forgetting the remembered APN - it connects but carries nothing");
        prefs.remove("apnOk");
      }
    }
    return false;
  }
  bearerFailures = 0;
  const int status = response.substring(marker + 15).toInt();
  // Third field of +HTTPACTION: 1,<status>,<length>
  long length = 0;
  const int firstComma = response.indexOf(',', marker + 13);
  const int secondComma = firstComma >= 0 ? response.indexOf(',', firstComma + 1) : -1;
  if (secondComma >= 0) length = response.substring(secondComma + 1).toInt();
  if (length > 0) {
    const String read = modemCommand("AT+HTTPREAD=0," + String(min(length, 512L)), 10000);
    const int open = read.indexOf('{');
    const int close = read.lastIndexOf('}');
    if (open >= 0 && close > open) responseBody = read.substring(open, close + 1);
  }
  modemCommand("AT+HTTPTERM");
  Serial.printf("[lte] HTTP %d (%ld byte body)\n", status, length);
  return status >= 200 && status < 300;
}

// Reads the compact ack the backend returns on both device routes.
void consumeAckBody(const String &responseBody, const String &eventId) {
  if (!responseBody.length()) return;
  JsonDocument doc;
  if (deserializeJson(doc, responseBody)) return;
  JsonObject root = doc.as<JsonObject>();
  // Both device routes answer { "data": { ... } }; tolerate a bare object too, so a
  // future envelope change degrades to "no ack" rather than a wrong one.
  JsonObject data = root["data"].is<JsonObject>() ? root["data"].as<JsonObject>() : root;
  applyServerAck(eventId,
                 data["emergencyId"] | "",
                 data["revision"].is<long>() ? data["revision"].as<long>() : -1,
                 data["tracking"].is<bool>() ? (data["tracking"].as<bool>() ? 1 : 0) : -1);
}

// ---- BLE frames ----------------------------------------------------------

// A BLE notification carries at most MTU-3 bytes, and the app negotiates MTU 247,
// so the ceiling is 244. The stored event is the full LTE document (~400 bytes),
// which the stack would silently truncate into unparseable JSON. Every BLE notify
// therefore goes out in this compact form, so a queued alert retried after a
// reconnect decodes exactly like a freshly pressed one.
String compactFrom(const String &fullEvent) {
  JsonDocument full;
  if (deserializeJson(full, fullEvent)) return String();
  JsonDocument compact;
  compact["k"] = "sos";
  compact["d"] = full["deviceId"];
  compact["e"] = full["eventId"];
  compact["t"] = full["buttonType"];
  compact["f"] = full["fingerprintVerified"];
  compact["v"] = full["firmwareVersion"];
  // Absent on an alert raised before the receiver had a fix, which is the normal
  // case. The phone forwards it without a location and the fixes follow.
  if (!full["location"].isNull()) {
    compact["lo"] = full["location"]["coordinates"][0];
    compact["la"] = full["location"]["coordinates"][1];
    compact["a"] = full["location"]["accuracyMeters"];
    compact["at"] = full["location"]["capturedAt"];
    compact["h"] = full["gnssHdop"];
    compact["s"] = full["gnssSatellites"];
  }
  String out; serializeJson(compact, out); return out;
}

void notifyEvent(const String &frame) {
  if (eventCharacteristic && frame.length()) {
    eventCharacteristic->setValue(frame.c_str());
    eventCharacteristic->notify();
  }
}

double accuracyFromHdop() { return max(5.0, fix.hdop * 5.0); }

void addLocation(JsonDocument &doc) {
  JsonObject location = doc["location"].to<JsonObject>();
  location["type"] = "Point";
  JsonArray coordinates = location["coordinates"].to<JsonArray>();
  coordinates.add(fix.lng);
  coordinates.add(fix.lat);
  location["accuracyMeters"] = accuracyFromHdop();
  location["capturedAt"] = fix.capturedAt;
  doc["gnssHdop"] = fix.hdop;
  doc["gnssSatellites"] = fix.satellites;
}

void deliverPending() {
  for (uint8_t i = 0; i < pendingSlots; ++i) {
    if (!pendingEvents[i].length()) continue;
    const String snapshot = pendingEvents[i];
    notifyEvent(compactFrom(snapshot));
    String responseBody;
    if (postOverLte("/device/emergencies", snapshot, responseBody)) {
      JsonDocument doc;
      const String eventId = deserializeJson(doc, snapshot) ? String() : String(doc["eventId"] | "");
      clearPending(eventId);
      consumeAckBody(responseBody, eventId);
    }
  }
}

/**
 * Raises one alert. Deliberately does not wait for satellites.
 *
 * A victim cannot stand still through a cold GNSS start, so the alert goes out on
 * the button release with whatever position is already in hand - usually none. The
 * backend files it as "waiting for GPS" and the streaming loop fills it in. The
 * fix is attached here only when one happens to be current.
 */
void createEmergency() {
  const uint32_t sequence = prefs.getUInt("sequence", 0) + 1;
  prefs.putUInt("sequence", sequence);
  const String eventId = deviceId + "-" + String(sequence);
  JsonDocument doc;
  doc["deviceId"] = deviceId; doc["eventId"] = eventId;
  doc["buttonType"] = "general_sos"; doc["fingerprintVerified"] = true;
  doc["authMethod"] = "fingerprint"; doc["transport"] = "lte";
  doc["firmwareVersion"] = firmwareVersion;
  const bool withFix = haveCurrentFix();
  if (withFix) { addLocation(doc); doc["deviceTimestamp"] = fix.capturedAt; }
  String fullEvent; serializeJson(doc, fullEvent);

  if (!queuePending(fullEvent)) {
    // Five pulses: the alert could not be written to flash, so a reset would lose
    // it. Say so distinctly rather than letting it look delivered.
    Serial.println("[sos] STORAGE FAILURE - could not persist the alert");
    blink(5, 120, 120);
    return;
  }
  Serial.printf("[sos] queued %s %s (%u in queue)\n", eventId.c_str(),
                withFix ? "with a current fix" : "with NO fix yet - waiting for GPS",
                pendingCount());
  startTracking(eventId);
  blink(1, 250, 0);                 // one pulse: queued

  notifyEvent(compactFrom(fullEvent));
  String responseBody;
  if (postOverLte("/device/emergencies", fullEvent, responseBody)) {
    clearPending(eventId);
    consumeAckBody(responseBody, eventId);
  }
  // One fingerprint scan authorises exactly one alert.
  verifiedAt = 0;
  refreshIdentity();
}

/**
 * Streams the current position for as long as the incident stays open.
 *
 * Nothing is queued: a stale position is worth less than the next one, which is
 * seconds away. The stream ends only on an explicit server answer, so a dropped
 * reply leaves the device transmitting rather than going quiet on a live alert.
 */
void streamLocation() {
  if (!active.tracking || !active.eventId.length()) return;
  if (!haveCurrentFix()) return;
  if (lastTrackAt && millis() - lastTrackAt < trackIntervalMs) return;
  lastTrackAt = millis();

  JsonDocument doc;
  doc["deviceId"] = deviceId;
  doc["eventId"] = active.eventId;
  doc["transport"] = "lte";
  doc["firmwareVersion"] = firmwareVersion;
  addLocation(doc);
  String body; serializeJson(doc, body);

  JsonDocument frame;
  frame["k"] = "loc";
  frame["d"] = deviceId;
  frame["e"] = active.eventId;
  frame["lo"] = fix.lng;
  frame["la"] = fix.lat;
  frame["a"] = accuracyFromHdop();
  frame["at"] = fix.capturedAt;
  frame["h"] = fix.hdop;
  frame["s"] = fix.satellites;
  frame["v"] = firmwareVersion;
  String compact; serializeJson(frame, compact);
  notifyEvent(compact);

  String responseBody;
  if (postOverLte("/device/emergencies/location", body, responseBody)) {
    consumeAckBody(responseBody, active.eventId);
  }
}

void enrollFingerprint() {
  Serial.println("[enroll] starting - place the SAME finger twice");
  enrollmentStatus = "place_first"; refreshIdentity();
  Serial.println("[enroll] place finger (1 of 2)");
  const uint32_t deadline = millis() + 60000;
  while (finger.getImage() != FINGERPRINT_OK && static_cast<int32_t>(deadline - millis()) > 0) { pumpHeartbeat(); pumpGnss(); delay(100); }
  if (finger.image2Tz(1) != FINGERPRINT_OK) goto failed;
  enrollmentStatus = "remove_finger"; refreshIdentity();
  Serial.println("[enroll] lift finger");
  while (finger.getImage() != FINGERPRINT_NOFINGER && static_cast<int32_t>(deadline - millis()) > 0) { pumpHeartbeat(); pumpGnss(); delay(100); }
  enrollmentStatus = "place_second"; refreshIdentity();
  Serial.println("[enroll] place the same finger again (2 of 2)");
  while (finger.getImage() != FINGERPRINT_OK && static_cast<int32_t>(deadline - millis()) > 0) { pumpHeartbeat(); pumpGnss(); delay(100); }
  if (finger.image2Tz(2) != FINGERPRINT_OK || finger.createModel() != FINGERPRINT_OK || finger.storeModel(1) != FINGERPRINT_OK) goto failed;
  fingerprintEnrolled = true; prefs.putBool("fingerprint", true); enrollmentStatus = "complete";
  Serial.println("[enroll] COMPLETE - template stored in sensor slot 1");
  blink(3); refreshIdentity(); return;
failed:
  enrollmentStatus = "failed";
  Serial.println("[enroll] FAILED - retry inside the pairing window");
  blink(2, 200, 200); refreshIdentity();
}

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *) override { Serial.println("[ble] phone connected"); }
  void onDisconnect(BLEServer *) override {
    Serial.println("[ble] phone disconnected, advertising again");
    BLEDevice::startAdvertising();
  }
};

class ConfigCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *characteristic) override {
    JsonDocument doc;
    if (deserializeJson(doc, characteristic->getValue())) return;
    const String ack = doc["ackEventId"] | "";
    if (ack.length()) {
      clearPending(ack);
      // The phone relays the same ack fields the cellular path reads, so a wearable
      // without a SIM learns its revision and its stop signal identically.
      applyServerAck(ack,
                     doc["emergencyId"] | "",
                     doc["revision"].is<long>() ? doc["revision"].as<long>() : -1,
                     doc["tracking"].is<bool>() ? (doc["tracking"].as<bool>() ? 1 : 0) : -1);
    }
    const String command = doc["command"] | "";
    if (command == "provision" && pairingOpen()) {
      const String token = doc["deviceToken"] | "";
      const String apiBase = doc["apiBase"] | "";
      const String apn = doc["apn"] | "";
      // Filename of a root CA already present in the modem's own filesystem, not the
      // certificate itself - a PEM would not fit in a BLE write, and the modem keeps
      // it across reboots once AT+CCERTDOWN has loaded it.
      const String caFile = doc["caFile"] | "";
      if (token.length() >= 32 && apiBase.length()) {
        prefs.putString("token", token); prefs.putString("apiBase", apiBase); prefs.putString("apn", apn);
        prefs.putString("caFile", caFile);
        directCellularEnabled = doc["cellularEnabled"] == true;
        prefs.putBool("cellular", directCellularEnabled); prefs.putBool("provisioned", true);
        // Re-provisioning can change the APN or the CA, so discard the cached bearer
        // and SSL context and let the next post rebuild them.
        bearerUp = false; tlsConfigured = false;
        // apiBase, apn and the CA filename are not secret; the token is never logged.
        Serial.printf("[ble] provisioned - apiBase=%s apn=%s ca=%s directLTE=%s\n",
                      apiBase.c_str(), apn.length() ? apn.c_str() : "(none)",
                      caFile.length() ? caFile.c_str() : "(none - server NOT verified)",
                      directCellularEnabled ? "enabled" : "disabled");
      } else {
        Serial.println("[ble] provision REJECTED - token or apiBase missing");
        requestBlink(2);
      }
    } else if (command == "enroll" && pairingOpen()) {
      if (fingerprintReady) {
        enrollmentRequested = true;
      } else {
        // Without this the app polls for 60 s and then reports a timeout, which
        // reads as "enrolment is broken" rather than "the sensor is not wired".
        enrollmentStatus = "failed";
        Serial.println("[enroll] REJECTED - fingerprint sensor is not responding");
        requestBlink(2);
      }
    }
    refreshIdentity();
  }
  void onRead(BLECharacteristic *) override { refreshIdentity(); }
};

void setupBle() {
  BLEDevice::init("TanzAlert Wearable");
  BLEServer *server = BLEDevice::createServer(); server->setCallbacks(new ServerCallbacks());
  BLEService *service = server->createService(serviceUuid);
  eventCharacteristic = service->createCharacteristic(eventUuid, BLECharacteristic::PROPERTY_NOTIFY); ADD_CCCD(eventCharacteristic);
  heartbeatCharacteristic = service->createCharacteristic(heartbeatUuid, BLECharacteristic::PROPERTY_NOTIFY); ADD_CCCD(heartbeatCharacteristic);
  configCharacteristic = service->createCharacteristic(configUuid, BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_WRITE);
  configCharacteristic->setCallbacks(new ConfigCallbacks()); refreshIdentity(); service->start();
  BLEAdvertising *advertising = BLEDevice::getAdvertising(); advertising->addServiceUUID(serviceUuid); advertising->start();
}

// ---- serial diagnostics -------------------------------------------------
// Typed into the monitor as single letters. These exist because the faults that
// actually strand this device - a silent scanner, a button that reads as
// permanently pressed, a receiver that never gets a fix - are all invisible from
// the app and all need to be told apart from a firmware bug without recompiling.

void printPins() {
  Serial.println("--- live pad levels ---");
  Serial.printf("  button   GPIO%-2u = %d   (pull-up: 1 = released, 0 = pressed/shorted to GND)\n",
                Pins::emergencyButton, digitalRead(Pins::emergencyButton));
  Serial.printf("  status LED GPIO%-2u = %d\n", Pins::statusLed, digitalRead(Pins::statusLed));
  Serial.printf("  scanner RX GPIO%-2u = %d  (an idle UART line sits at 1; 0 means unpowered or miswired)\n",
                Pins::fingerprintRx, digitalRead(Pins::fingerprintRx));
  Serial.printf("  gps RX   GPIO%-2u = %d  (a powered NEO-6M talks constantly, so this flickers)\n",
                Pins::gpsRx, digitalRead(Pins::gpsRx));
  Serial.printf("  modem RX GPIO%-2u = %d  (an idle UART line sits at 1)\n",
                Pins::modemRx, digitalRead(Pins::modemRx));
  Serial.println("-----------------------");
}

// Walks every baud rate an R502S-A ships with, then repeats with the two data
// wires swapped, which is the single most common wiring mistake.
void probeFingerprint() {
  static const uint32_t bauds[] = {57600, 9600, 19200, 38400, 115200};
  Serial.println("[probe] hunting for the fingerprint scanner...");
  for (uint8_t swapped = 0; swapped < 2; ++swapped) {
    const uint8_t rx = swapped ? Pins::fingerprintTx : Pins::fingerprintRx;
    const uint8_t tx = swapped ? Pins::fingerprintRx : Pins::fingerprintTx;
    for (uint8_t i = 0; i < sizeof(bauds) / sizeof(bauds[0]); ++i) {
      fingerprintSerial.begin(bauds[i], SERIAL_8N1, rx, tx);
      finger.begin(bauds[i]);
      delay(120);
      const bool responded = finger.verifyPassword();
      Serial.printf("  rx=GPIO%-2u tx=GPIO%-2u %6lu baud : %s\n",
                    rx, tx, (unsigned long)bauds[i], responded ? "RESPONDED" : "silent");
      if (responded) {
        fingerprintReady = true;
        Serial.printf("[probe] found it. Set fingerprintRx=%u, fingerprintTx=%u and %lu baud in main.cpp.\n",
                      rx, tx, (unsigned long)bauds[i]);
        refreshIdentity();
        return;
      }
    }
  }
  // Put the configured wiring back so normal operation is unaffected.
  fingerprintSerial.begin(57600, SERIAL_8N1, Pins::fingerprintRx, Pins::fingerprintTx);
  finger.begin(57600);
  fingerprintReady = finger.verifyPassword();
  refreshIdentity();
  Serial.println("[probe] silent on every combination. Check 3V3 and GND at the sensor first:");
  Serial.println("        a scanner with no power cannot answer on any pin or baud rate.");
}

// Tells "nothing is wired here" apart from "something is holding the pad low",
// then watches the pad so a real press can be seen as it happens.
void probeButton() {
  const uint8_t pin = Pins::emergencyButton;
  pinMode(pin, INPUT_PULLUP);   delay(20); const int withPullUp = digitalRead(pin);
  pinMode(pin, INPUT_PULLDOWN); delay(20); const int withPullDown = digitalRead(pin);
  pinMode(pin, INPUT_PULLUP);   delay(20);
  Serial.printf("[button] GPIO%u reads %d with an internal pull-up, %d with a pull-down\n",
                pin, withPullUp, withPullDown);
  if (withPullUp == 1 && withPullDown == 0) {
    Serial.println("[button] the pad follows the internal pull, so nothing is holding it:");
    Serial.println("         the button is open (not pressed) and the pin is healthy.");
  } else if (withPullUp == 0 && withPullDown == 0) {
    Serial.println("[button] the pad stays LOW even with the pull-up on, so it is tied to GND.");
    Serial.println("         Most likely: a 4-pin tactile switch wired across a pair that is");
    Serial.println("         ALREADY connected inside the switch, so the contact never opens.");
    Serial.println("         Use two pins on OPPOSITE sides of the switch body, or test with a");
    Serial.println("         multimeter in continuity mode before soldering.");
  } else {
    Serial.println("[button] the pad stays HIGH even with the pull-down on: it is tied to 3V3.");
  }
  Serial.println("[button] watching for 10 s - press and release the button now...");
  int last = digitalRead(pin);
  Serial.printf("  t=0.0s level=%d\n", last);
  const uint32_t until = millis() + 10000;
  uint8_t changes = 0;
  while (static_cast<int32_t>(until - millis()) > 0) {
    const int now = digitalRead(pin);
    if (now != last) {
      last = now; ++changes;
      Serial.printf("  t=%.1fs level=%d  <-- %s\n", (10000.0 - (until - millis())) / 1000.0,
                    now, now == 0 ? "pressed" : "released");
    }
    pumpHeartbeat(); pumpGnss();
    delay(10);
  }
  Serial.printf("[button] %u transition(s) seen in 10 s.\n", changes);
  if (!changes) Serial.println("         No change at all means the wiring never opens or closes the circuit.");
}

void probeModem() {
  Serial.printf("[probe] sending AT on GPIO%u/%u (LP_UART), 3 tries...\n", Pins::modemRx, Pins::modemTx);
  for (uint8_t i = 0; i < 3; ++i) {
    String reply = modemCommand("AT", 1500);
    reply.replace("\r", "<CR>"); reply.replace("\n", "<LF>");
    Serial.printf("  try %u: %s\n", i + 1, reply.length() ? reply.c_str() : "(nothing received)");
    if (reply.indexOf("OK") >= 0) { Serial.println("[probe] the modem is answering."); return; }
  }
  Serial.printf("[probe] no reply. Check modem TXD->GPIO%u, RXD->GPIO%u, a shared GND, and modem power.\n",
                Pins::modemRx, Pins::modemTx);
  Serial.println("        A modem plugged only into the PC by USB cannot be reached from here.");
  Serial.println("        These two pads are the C6's fixed low-power UART; they cannot be moved.");
}

// Separates "no satellites yet" from "no receiver on this pin", which look the
// same from the app and need completely different fixes.
void probeGnss() {
  Serial.printf("[probe] listening to the NEO-6M on GPIO%u for 5 s...\n", Pins::gpsRx);
  const uint32_t before = gpsBytes;
  const uint32_t until = millis() + 5000;
  while (static_cast<int32_t>(until - millis()) > 0) { pumpGnss(); pumpHeartbeat(); delay(10); }
  const uint32_t received = gpsBytes - before;
  Serial.printf("[gps] %lu bytes in 5 s, last NMEA %s\n", (unsigned long)received,
                lastNmeaAt ? (String((millis() - lastNmeaAt) / 1000) + "s ago").c_str() : "never");
  if (!received) {
    Serial.printf("[gps] NOTHING received. Check NEO-6M TX->GPIO%u, its power, and a shared GND.\n",
                  Pins::gpsRx);
    Serial.println("      A powered receiver talks at 9600 baud even with no satellites in view.");
  } else if (!fix.valid) {
    Serial.println("[gps] sentences arrive but there is no fix yet: the receiver is wired correctly");
    Serial.println("      and still searching. Go outdoors with a clear view of the sky; a cold");
    Serial.println("      start can take several minutes.");
  } else {
    Serial.printf("[gps] fix %s,%s hdop=%s sats=%d at %s (%lus old)\n",
                  String(fix.lat, 6).c_str(), String(fix.lng, 6).c_str(),
                  String(fix.hdop, 1).c_str(), fix.satellites, fix.capturedAt.c_str(),
                  (unsigned long)((millis() - fix.receivedAt) / 1000));
  }
}

// Walks the preflight the SIMCom application note asks for before any HTTP(S)
// command: SIM present, signal, registration, bearer. Direct LTE delivery fails at
// exactly one of these, and the HTTP error alone never says which.
void probeLte() {
  Serial.println("[probe] LTE readiness...");
  struct { const char *command; const char *meaning; } checks[] = {
    {"AT+CPIN?", "SIM: expect +CPIN: READY"},
    {"AT+CSQ", "signal: first number 10-31 is usable, 99 is no signal"},
    {"AT+CREG?", "registration: expect ,1 (home) or ,5 (roaming)"},
    {"AT+CPSI?", "radio: expect LTE,Online"},
    {"AT+CGACT?", "bearer: expect +CGACT: 1,1"},
  };
  for (auto &check : checks) {
    String reply = modemCommand(check.command, 3000);
    reply.replace("\r", " "); reply.replace("\n", " "); reply.trim();
    Serial.printf("  %-10s %s\n", check.command, reply.length() ? reply.c_str() : "(no reply)");
    Serial.printf("  %-10s   %s\n", "", check.meaning);
  }
  const String apiBase = prefs.getString("apiBase", "");
  const String caFile = prefs.getString("caFile", "");
  detectCarrier();
  Serial.printf("[lte] apiBase=%s\n", apiBase.length() ? apiBase.c_str() : "(not provisioned)");
  Serial.printf("[lte] token=%s\n",
                prefs.getString("token", "").length() ? "present" : "MISSING");
  const String override_ = prefs.getString("apn", "");
  const String remembered = prefs.getString("apnOk", "");
  Serial.printf("[apn] sim=%s  override=%s  remembered=%s  active=%s\n",
                simBrands.c_str(),
                override_.length() ? override_.c_str() : "(none)",
                remembered.length() ? remembered.c_str() : "(none yet)",
                bearerUp ? (activeApn.length() ? activeApn.c_str() : "(blank)") : "(not connected)");
  Serial.printf("[lte] direct delivery=%s  server verification=%s\n",
                directCellularEnabled ? "enabled" : "DISABLED (re-pair to enable)",
                caFile.length() ? caFile.c_str() : "OFF - no CA loaded");
}

// Walks every APN candidate and reports which ones actually carry data. This is
// the carrier equivalent of the 'f' scanner hunt: it turns "cellular does not
// work" into a specific answer about this SIM, without recompiling.
void probeApn() {
  detectCarrier();
  String order[maxApnCandidates];
  const uint8_t count = buildApnOrder(order);
  Serial.printf("[probe] SIM reports %s. Trying %u APN candidate(s)...\n",
                simBrands.c_str(), count);
  uint8_t working = 0;
  String firstWorking;
  for (uint8_t i = 0; i < count; ++i) {
    const String &apn = order[i];
    const char *label = apn.length() ? apn.c_str() : "(blank - network assigned)";
    const bool ok = tryApn(apn);
    Serial.printf("  %-26s %s\n", label, ok ? "CARRIES DATA" : "no address");
    if (ok && !working++) firstWorking = apn;
    pumpHeartbeat();
    pumpGnss();
  }
  if (working) {
    activeApn = firstWorking;
    prefs.putString("apnOk", firstWorking);
    bearerUp = true;
    Serial.printf("[probe] %u of %u worked. Remembered %s for future boots.\n",
                  working, count,
                  firstWorking.length() ? firstWorking.c_str() : "(blank)");
    Serial.println("[probe] press 't' to confirm the backend is reachable on it.");
  } else {
    bearerUp = false;
    Serial.println("[probe] none of them carried data. That is almost never the APN:");
    Serial.println("        press 'l' and check the SIM is seated, has load//a data plan,");
    Serial.println("        the antenna is connected, and registration reports ,1 or ,5.");
  }
}

// Lists the certificates in the modem's filesystem. "no CA loaded" and "wrong CA
// filename provisioned" fail the handshake identically, and this is the only way to
// tell them apart.
void probeCerts() {
  String reply = modemCommand("AT+CCERTLIST", 5000);
  Serial.println("[probe] certificates in the modem filesystem:");
  Serial.println(reply.length() ? reply.c_str() : "  (no reply)");
  const String caFile = prefs.getString("caFile", "");
  if (!caFile.length()) {
    Serial.println("  No CA is provisioned on this device, so the server certificate is NOT");
    Serial.println("  verified. Load one with:");
    Serial.println("    AT+CCERTDOWN=\"ca.pem\",<byte length>");
    Serial.println("  then paste the PEM, and re-pair with MODEM_CA_FILE=ca.pem.");
  } else if (reply.indexOf(caFile) < 0) {
    Serial.printf("  MISMATCH: this device is provisioned for \"%s\", which is not in the\n",
                  caFile.c_str());
    Serial.println("  list above. The handshake will fail until the two names agree.");
  } else {
    Serial.printf("  OK: \"%s\" is present and will be used to verify the server.\n",
                  caFile.c_str());
  }
}

// Proves the whole direct-LTE path - bearer, TLS, DNS, backend - with a GET on the
// public health endpoint, so it can be verified without pressing the button and
// raising a real incident.
void probeDirectDelivery() {
  const String apiBase = prefs.getString("apiBase", "");
  if (!directCellularEnabled) {
    Serial.println("[probe] direct LTE is disabled on this device. Re-pair from the app");
    Serial.println("        with an HTTPS API URL configured.");
    return;
  }
  if (!apiBase.startsWith("https://")) {
    Serial.println("[probe] not provisioned for direct LTE: the API URL is not https://");
    return;
  }
  Serial.printf("[probe] GET %s/health over cellular...\n", apiBase.c_str());
  modemCommand("AT+HTTPTERM");
  if (!ensureBearer()) return;
  if (!ensureTls()) return;
  if (modemCommand("AT+HTTPINIT", 5000).indexOf("OK") < 0) {
    Serial.println("[probe] HTTPINIT failed");
    bearerUp = false;
    return;
  }
  modemCommand("AT+HTTPPARA=\"URL\",\"" + apiBase + "/health\"");
  modemCommand("AT+HTTPPARA=\"SSLCFG\"," + String(tlsContext));
  while (modem.available()) modem.read();
  modem.println("AT+HTTPACTION=0");
  String response;
  const uint32_t deadline = millis() + 30000;
  while (static_cast<int32_t>(deadline - millis()) > 0) {
    while (modem.available()) response += static_cast<char>(modem.read());
    if (response.indexOf("+HTTPACTION:") >= 0) break;
    pumpHeartbeat(); pumpGnss();
    delay(10);
  }
  const int marker = response.indexOf("+HTTPACTION: 0,");
  if (marker < 0) {
    Serial.println("[probe] no answer. Press 'l' for the LTE preflight - this is almost always");
    Serial.println("        no registration, no antenna, or the wrong APN.");
    bearerUp = false;
  } else {
    const int status = response.substring(marker + 15).toInt();
    if (status >= 200 && status < 300) {
      const String body = modemCommand("AT+HTTPREAD=0,256", 10000);
      Serial.printf("[probe] HTTP %d - direct LTE delivery works end to end.\n", status);
      if (body.indexOf("status") >= 0) Serial.println("[probe] the backend answered its health check.");
    } else if (status >= 700) {
      // The A76XX reports TLS and network failures as 7xx rather than an HTTP status.
      Serial.printf("[probe] TLS/network error %d. Press 'c' to check the CA, and confirm the\n", status);
      Serial.println("        API host matches the certificate it actually serves.");
    } else {
      Serial.printf("[probe] HTTP %d - the radio path works; the backend refused the request.\n", status);
    }
  }
  modemCommand("AT+HTTPTERM");
}

void printBanner() {
  Serial.println();
  Serial.println("=========== TanzAlert wearable ===========");
  Serial.printf("firmware           : %s\n", firmwareVersion);
  Serial.printf("deviceId           : %s\n", deviceId.c_str());
  if (fingerprintReady) {
    Serial.println("fingerprint sensor : OK");
  } else {
    Serial.printf("fingerprint sensor : NOT RESPONDING - check 3V3/GND, sensor TX->GPIO%u, sensor RX->GPIO%u, 57600 baud\n",
                  Pins::fingerprintRx, Pins::fingerprintTx);
  }
  Serial.printf("fingerprint enrolled: %s\n", fingerprintEnrolled ? "yes" : "no");
  Serial.printf("provisioned        : %s\n", prefs.getBool("provisioned", false) ? "yes" : "no");
  if (directCellularEnabled) {
    const String caFile = prefs.getString("caFile", "");
    Serial.printf("direct LTE         : enabled, server cert %s\n",
                  caFile.length() ? ("verified against " + caFile).c_str()
                                  : "NOT VERIFIED - no CA loaded (press 'c')");
    const String remembered = prefs.getString("apnOk", "");
    Serial.printf("sim / apn          : %s / %s\n",
                  simBrands.length() ? simBrands.c_str() : "not read yet (press 'l')",
                  bearerUp ? (activeApn.length() ? activeApn.c_str() : "(blank)")
                           : remembered.length()
                               ? (remembered + " (remembered)").c_str()
                               : "will be found automatically (press 'a')");
  } else {
    Serial.println("direct LTE         : disabled - re-pair from the app to enable");
  }
  Serial.printf("gps                : %s\n",
                haveCurrentFix()
                  ? (String("fix, ") + String(fix.satellites) + " satellites").c_str()
                  : (fix.valid ? "stale fix - searching again" : "no fix yet - searching"));
  Serial.printf("queued alerts      : %u\n", pendingCount());
  if (active.tracking) {
    Serial.printf("tracking           : %s revision %lu - streaming until dispatch resolves it\n",
                  active.eventId.c_str(), (unsigned long)active.revision);
  } else {
    Serial.println("tracking           : idle");
  }
  Serial.printf("pins: fp=%u/%u gps=%u modem=%u/%u btn=%u led=%u\n",
                Pins::fingerprintRx, Pins::fingerprintTx, Pins::gpsRx,
                Pins::modemRx, Pins::modemTx,
                Pins::emergencyButton, Pins::statusLed);
  Serial.printf("button now         : %s\n",
                digitalRead(Pins::emergencyButton) == LOW
                  ? "PRESSED - if nothing is touching it, it is miswired or stuck"
                  : "released");
  Serial.println("-----------------------------------------");
  Serial.println("scan finger -> 3 pulses, then TAP the button within 30s = SOS (sent at once)");
  Serial.printf("hold %lus = pairing window (scan finger first if enrolled)\n",
                (unsigned long)(pairingHoldMs / 1000));
  Serial.println("pulses: 1 queued  3 server confirmed  2 rejected  5 storage failure");
  Serial.println("serial keys: p = pad levels  b = button test  f = hunt for scanner");
  Serial.println("             m = modem AT    g = gps status   l = lte preflight");
  Serial.println("             a = hunt for a working APN        c = modem certs");
  Serial.println("             t = test direct LTE delivery end to end");
  Serial.println("=========================================");
}

void setup() {
  Serial.begin(115200);
  // The prebuilt SDK keeps UART0 as ESP-IDF's primary console, so ROM/IDF log lines
  // would otherwise be clocked out of UART0's TX pin into the fingerprint scanner.
  // Unhook the ROM print channel from UART0; the USB Serial/JTAG channel stays.
  esp_rom_install_channel_putc(1, nullptr);
  pinMode(Pins::statusLed, OUTPUT); pinMode(Pins::emergencyButton, INPUT_PULLUP);
  prefs.begin("safealert", false);
  // esp_efuse_mac_get_default() hands back the 8-byte EUI-64 on the C6
  // (MAC[0..2] + FF:FE + MAC[3..5]), so the low 32 bits an earlier build used were
  // the Espressif OUI plus the EUI-64 filler - byte-identical on every C6 and
  // therefore useless as the globally unique key the backend indexes on. The full
  // 6-byte base MAC is unique per chip.
  uint8_t mac[6] = {0};
  esp_read_mac(mac, ESP_MAC_BASE);
  char macHex[13];
  snprintf(macHex, sizeof(macHex), "%02X%02X%02X%02X%02X%02X",
           mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
  deviceId = String("SA-ESP32-") + macHex;
  fingerprintEnrolled = prefs.getBool("fingerprint", false);
  directCellularEnabled = prefs.getBool("cellular", false);
  loadPending();
  loadActive();
  fingerprintSerial.begin(57600, SERIAL_8N1, Pins::fingerprintRx, Pins::fingerprintTx);
  finger.begin(57600); fingerprintReady = finger.verifyPassword();
  gps.begin(9600, SERIAL_8N1, Pins::gpsRx, -1);
  modem.begin(115200, SERIAL_8N1, Pins::modemRx, Pins::modemTx);
  setupBle();

  if (active.tracking) {
    Serial.printf("[track] resuming %s after reset - dispatch has not resolved it yet\n",
                  active.eventId.c_str());
  }

  delay(200);  // let a freshly attached serial monitor catch the banner
  printBanner();
}

void loop() {
  if (Serial.available()) {
    const int key = Serial.read();
    while (Serial.available()) Serial.read();   // swallow the rest of the line
    switch (key) {
      case 'p': case 'P': printPins(); break;
      case 'f': case 'F': probeFingerprint(); break;
      case 'b': case 'B': probeButton(); break;
      case 'm': case 'M': probeModem(); break;
      case 'g': case 'G': probeGnss(); break;
      case 'l': case 'L': probeLte(); break;
      case 'a': case 'A': probeApn(); break;
      case 'c': case 'C': probeCerts(); break;
      case 't': case 'T': probeDirectDelivery(); break;
      default: printBanner(); break;
    }
  }
  pumpGnss();
  servicePendingBlink();
  if (enrollmentRequested) { enrollmentRequested = false; enrollFingerprint(); }
  if (fingerprintReady && finger.getImage() == FINGERPRINT_OK) {
    // Staged so the serial log says which step failed, instead of failing silently.
    if (finger.image2Tz() != FINGERPRINT_OK) {
      Serial.println("[finger] unusable image - press flat and firmly, clean the sensor");
      blink(2, 200, 200);
    } else if (finger.fingerSearch() != FINGERPRINT_OK) {
      Serial.println("[finger] NO MATCH - this finger is not the enrolled one");
      blink(2, 200, 200);
    } else {
      verifiedAt = millis();
      Serial.printf("[finger] verified - %us authorisation window open\n",
                    (unsigned)(fingerprintWindowMs / 1000));
      blink(3);
    }
    while (finger.getImage() != FINGERPRINT_NOFINGER) { pumpGnss(); delay(50); }
  }

  const bool rawPressed = digitalRead(Pins::emergencyButton) == LOW;
  if (rawPressed != buttonRaw) { buttonRaw = rawPressed; buttonChangedAt = millis(); }
  if (millis() - buttonChangedAt >= buttonDebounceMs) buttonStable = buttonRaw;
  const bool pressed = buttonStable;

  if (pressed && buttonDownAt == 0) {
    buttonDownAt = millis(); buttonHandled = false;
    Serial.println("[button] pressed");
  }
  // Reaching the pairing hold consumes the press. Marking it handled here is what
  // guarantees the release cannot also fire an SOS.
  if (pressed && !buttonHandled && millis() - buttonDownAt >= pairingHoldMs) {
    if (!fingerprintEnrolled || fingerprintWindowOpen()) {
      pairingUntil = millis() + pairingWindowMs; blink(3, 300, 100); refreshIdentity();
      Serial.printf("[button] %lus hold -> PAIRING WINDOW OPEN for %lus\n",
                    (unsigned long)(pairingHoldMs / 1000),
                    (unsigned long)(pairingWindowMs / 1000));
    } else {
      Serial.printf("[button] hold REJECTED - scan the enrolled finger first, then hold within %us\n",
                    (unsigned)(fingerprintWindowMs / 1000));
      blink(2, 200, 200);
    }
    buttonHandled = true;
  }
  if (!pressed && buttonDownAt) {
    const uint32_t held = millis() - buttonDownAt;
    Serial.printf("[button] released after %lums\n", (unsigned long)held);
    // A tap - anything released before the pairing hold - is the SOS gesture. It
    // needs an enrolled finger verified within the last 30 s and nothing else:
    // notably not a GNSS fix.
    if (!buttonHandled && fingerprintEnrolled && fingerprintWindowOpen()) {
      Serial.println("[sos] authorised by fingerprint + button - sending now");
      createEmergency();
    } else if (!buttonHandled) {
      Serial.printf("[sos] REJECTED - enrolled=%d verifiedWithin%us=%d\n",
                    fingerprintEnrolled ? 1 : 0,
                    (unsigned)(fingerprintWindowMs / 1000),
                    fingerprintWindowOpen() ? 1 : 0);
      blink(2, 200, 200);
    }
    buttonDownAt = 0; buttonHandled = false;
  }

  streamLocation();

  if (millis() - lastHeartbeat >= heartbeatIntervalMs) {
    lastHeartbeat = millis();
    if (heartbeatCharacteristic) { heartbeatCharacteristic->setValue(String(millis()).c_str()); heartbeatCharacteristic->notify(); }
    // Read the SIM once the modem has had time to finish its own boot, so the app
    // can name the carrier before any alert is sent. Not done in setup(): a modem
    // asked for its IMSI too early simply answers nothing. A missing or locked SIM
    // backs off to once a minute rather than blocking the loop for 3 s on every
    // heartbeat, while still noticing a SIM inserted later.
    if (directCellularEnabled && !simPlmn.length() &&
        static_cast<int32_t>(millis() - nextCarrierReadAt) >= 0) {
      detectCarrier();
      nextCarrierReadAt = millis() + 60000;
    }
    if (hasPending()) deliverPending();
    refreshIdentity();
  }
  delay(20);
}
