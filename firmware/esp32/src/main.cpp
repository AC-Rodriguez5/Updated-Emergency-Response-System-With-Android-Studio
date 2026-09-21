#include <Arduino.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <Adafruit_Fingerprint.h>

namespace Pins {
constexpr uint8_t fingerprintRx = 26;
constexpr uint8_t fingerprintTx = 27;
constexpr uint8_t modemRx = 16;
constexpr uint8_t modemTx = 17;
constexpr uint8_t emergencyButton = 18;
constexpr uint8_t statusLed = 21;
}

constexpr char serviceUuid[] = "9f4d0001-7d6a-4b85-9e74-2f4d8e8d0001";
constexpr char eventUuid[] = "9f4d0002-7d6a-4b85-9e74-2f4d8e8d0002";
constexpr char heartbeatUuid[] = "9f4d0003-7d6a-4b85-9e74-2f4d8e8d0003";
constexpr char configUuid[] = "9f4d0004-7d6a-4b85-9e74-2f4d8e8d0004";
constexpr char firmwareVersion[] = "1.0.0";
constexpr uint32_t sosHoldMs = 2000;
constexpr uint32_t pairingHoldMs = 8000;
constexpr uint32_t fingerprintWindowMs = 30000;
constexpr uint32_t pairingWindowMs = 120000;

HardwareSerial fingerprintSerial(1);
HardwareSerial modem(2);
Adafruit_Fingerprint finger(&fingerprintSerial);
Preferences prefs;
BLECharacteristic *eventCharacteristic = nullptr;
BLECharacteristic *heartbeatCharacteristic = nullptr;
BLECharacteristic *configCharacteristic = nullptr;

String deviceId;
String pendingEvent;
String enrollmentStatus = "not_started";
bool fingerprintReady = false;
bool fingerprintEnrolled = false;
bool directCellularEnabled = false;
bool enrollmentRequested = false;
uint32_t verifiedAt = 0;
uint32_t pairingUntil = 0;
uint32_t buttonDownAt = 0;
uint32_t lastHeartbeat = 0;
bool buttonHandled = false;

void blink(uint8_t count, uint16_t onMs = 120, uint16_t offMs = 120) {
  for (uint8_t i = 0; i < count; ++i) {
    digitalWrite(Pins::statusLed, HIGH); delay(onMs);
    digitalWrite(Pins::statusLed, LOW); delay(offMs);
  }
}

String jsonIdentity() {
  JsonDocument doc;
  doc["deviceId"] = deviceId;
  doc["firmwareVersion"] = firmwareVersion;
  doc["fingerprintReady"] = fingerprintReady;
  doc["fingerprintEnrolled"] = fingerprintEnrolled;
  doc["pairingWindow"] = millis() < pairingUntil;
  doc["provisioned"] = prefs.getBool("provisioned", false);
  doc["directCellularEnabled"] = directCellularEnabled;
  doc["enrollmentStatus"] = enrollmentStatus;
  String result; serializeJson(doc, result); return result;
}

void refreshIdentity() {
  if (configCharacteristic) configCharacteristic->setValue(jsonIdentity().c_str());
}

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

bool parseCoordinate(String value, const String &hemisphere, double &out) {
  value.trim();
  if (!value.length() || (hemisphere != "N" && hemisphere != "S" && hemisphere != "E" && hemisphere != "W")) return false;
  const double raw = value.toDouble();
  const int degrees = static_cast<int>(raw / 100.0);
  out = degrees + (raw - degrees * 100.0) / 60.0;
  if (hemisphere == "S" || hemisphere == "W") out = -out;
  return isfinite(out);
}

bool acquireGnss(double &lat, double &lng, double &hdop, int &satellites, String &capturedAt) {
  modemCommand("AT+CGNSSPWR=1", 3000);
  const uint32_t deadline = millis() + 90000;
  while (static_cast<int32_t>(deadline - millis()) > 0) {
    digitalWrite(Pins::statusLed, (millis() / 700) % 2);
    const String response = modemCommand("AT+CGNSSINFO", 2500);
    const int marker = response.indexOf("+CGNSSINFO:");
    if (marker >= 0) {
      String line = response.substring(marker + 11);
      const int end = line.indexOf('\r');
      if (end >= 0) line = line.substring(0, end);
      String fields[24]; int count = 0; int start = 0;
      while (count < 24) {
        const int comma = line.indexOf(',', start);
        fields[count++] = comma < 0 ? line.substring(start) : line.substring(start, comma);
        if (comma < 0) break;
        start = comma + 1;
      }
      for (int i = 1; i + 2 < count; ++i) {
        fields[i].trim(); fields[i + 1].trim(); fields[i + 2].trim();
        if ((fields[i + 1] == "N" || fields[i + 1] == "S") && parseCoordinate(fields[i], fields[i + 1], lat) &&
            parseCoordinate(fields[i + 2], i + 3 < count ? fields[i + 3] : "", lng)) {
          String date, utc;
          for (int j = 0; j < i; ++j) {
            fields[j].trim();
            if (fields[j].length() == 6 && fields[j].toInt() > 0) {
              if (!date.length()) date = fields[j]; else utc = fields[j];
            }
          }
          if (date.length() == 6 && utc.length() >= 6) {
            capturedAt = "20" + date.substring(4, 6) + "-" + date.substring(2, 4) + "-" + date.substring(0, 2) +
                         "T" + utc.substring(0, 2) + ":" + utc.substring(2, 4) + ":" + utc.substring(4, 6) + "Z";
          }
          hdop = 5.0;
          satellites = 0;
          if (capturedAt.length() && abs(lat) <= 90 && abs(lng) <= 180) {
            digitalWrite(Pins::statusLed, LOW); return true;
          }
        }
      }
    }
    delay(1000);
  }
  digitalWrite(Pins::statusLed, LOW); return false;
}

bool postOverLte(const String &body) {
  if (!directCellularEnabled) return false;
  const String apiBase = prefs.getString("apiBase", "");
  const String token = prefs.getString("token", "");
  const String apn = prefs.getString("apn", "");
  if (!apiBase.startsWith("https://") || !token.length() || !apn.length()) return false;
  modemCommand("AT+HTTPTERM");
  modemCommand("AT+CGDCONT=1,\"IP\",\"" + apn + "\"");
  modemCommand("AT+NETOPEN", 10000);
  if (modemCommand("AT+HTTPINIT", 5000).indexOf("OK") < 0) return false;
  modemCommand("AT+HTTPPARA=\"URL\",\"" + apiBase + "/device/emergencies\"");
  modemCommand("AT+HTTPPARA=\"CONTENT\",\"application/json\"");
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
    delay(10);
  }
  modemCommand("AT+HTTPTERM");
  const int marker = response.indexOf("+HTTPACTION: 1,");
  if (marker < 0) return false;
  const int status = response.substring(marker + 15).toInt();
  return status >= 200 && status < 300;
}

void deliverPending() {
  if (!pendingEvent.length()) return;
  if (eventCharacteristic) {
    eventCharacteristic->setValue(pendingEvent.c_str());
    eventCharacteristic->notify();
  }
  if (postOverLte(pendingEvent)) {
    pendingEvent = ""; prefs.remove("pending");
    digitalWrite(Pins::statusLed, HIGH); delay(1000); digitalWrite(Pins::statusLed, LOW);
  }
}

void createEmergency() {
  double lat, lng, hdop; int satellites; String capturedAt;
  if (!acquireGnss(lat, lng, hdop, satellites, capturedAt)) { blink(2, 180, 180); return; }
  const uint32_t sequence = prefs.getUInt("sequence", 0) + 1;
  prefs.putUInt("sequence", sequence);
  const String eventId = deviceId + "-" + String(sequence);
  JsonDocument doc;
  doc["deviceId"] = deviceId; doc["eventId"] = eventId;
  doc["buttonType"] = "general_sos"; doc["fingerprintVerified"] = true;
  doc["authMethod"] = "fingerprint"; doc["transport"] = "lte";
  doc["firmwareVersion"] = firmwareVersion; doc["deviceTimestamp"] = capturedAt;
  doc["gnssHdop"] = hdop; doc["gnssSatellites"] = satellites;
  JsonObject location = doc["location"].to<JsonObject>();
  location["type"] = "Point";
  JsonArray coordinates = location["coordinates"].to<JsonArray>(); coordinates.add(lng); coordinates.add(lat);
  location["accuracyMeters"] = max(5.0, hdop * 5.0); location["capturedAt"] = capturedAt;
  serializeJson(doc, pendingEvent); prefs.putString("pending", pendingEvent);

  JsonDocument compact;
  compact["d"] = deviceId; compact["e"] = eventId; compact["t"] = "general_sos";
  compact["f"] = true; compact["lo"] = lng; compact["la"] = lat;
  compact["a"] = max(5.0, hdop * 5.0); compact["at"] = capturedAt;
  compact["h"] = hdop; compact["s"] = satellites; compact["v"] = firmwareVersion;
  String bleEvent; serializeJson(compact, bleEvent);
  if (eventCharacteristic) { eventCharacteristic->setValue(bleEvent.c_str()); eventCharacteristic->notify(); }
  if (postOverLte(pendingEvent)) { pendingEvent = ""; prefs.remove("pending"); }
}

void enrollFingerprint() {
  enrollmentStatus = "place_first"; refreshIdentity();
  const uint32_t deadline = millis() + 60000;
  while (finger.getImage() != FINGERPRINT_OK && static_cast<int32_t>(deadline - millis()) > 0) delay(100);
  if (finger.image2Tz(1) != FINGERPRINT_OK) goto failed;
  enrollmentStatus = "remove_finger"; refreshIdentity();
  while (finger.getImage() != FINGERPRINT_NOFINGER && static_cast<int32_t>(deadline - millis()) > 0) delay(100);
  enrollmentStatus = "place_second"; refreshIdentity();
  while (finger.getImage() != FINGERPRINT_OK && static_cast<int32_t>(deadline - millis()) > 0) delay(100);
  if (finger.image2Tz(2) != FINGERPRINT_OK || finger.createModel() != FINGERPRINT_OK || finger.storeModel(1) != FINGERPRINT_OK) goto failed;
  fingerprintEnrolled = true; prefs.putBool("fingerprint", true); enrollmentStatus = "complete"; blink(3); refreshIdentity(); return;
failed:
  enrollmentStatus = "failed"; blink(2, 200, 200); refreshIdentity();
}

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *) override {}
  void onDisconnect(BLEServer *) override { BLEDevice::startAdvertising(); }
};

class ConfigCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *characteristic) override {
    JsonDocument doc;
    if (deserializeJson(doc, characteristic->getValue())) return;
    const String ack = doc["ackEventId"] | "";
    if (ack.length() && pendingEvent.indexOf(ack) >= 0) { pendingEvent = ""; prefs.remove("pending"); }
    const String command = doc["command"] | "";
    if (command == "provision" && millis() < pairingUntil) {
      const String token = doc["deviceToken"] | "";
      const String apiBase = doc["apiBase"] | "";
      const String apn = doc["apn"] | "";
      if (token.length() >= 32 && apiBase.length()) {
        prefs.putString("token", token); prefs.putString("apiBase", apiBase); prefs.putString("apn", apn);
        directCellularEnabled = doc["cellularEnabled"] == true;
        prefs.putBool("cellular", directCellularEnabled); prefs.putBool("provisioned", true);
      }
    } else if (command == "enroll" && millis() < pairingUntil && fingerprintReady) {
      enrollmentRequested = true;
    }
    refreshIdentity();
  }
  void onRead(BLECharacteristic *) override { refreshIdentity(); }
};

void setupBle() {
  BLEDevice::init("TanzAlert Wearable");
  BLEServer *server = BLEDevice::createServer(); server->setCallbacks(new ServerCallbacks());
  BLEService *service = server->createService(serviceUuid);
  eventCharacteristic = service->createCharacteristic(eventUuid, BLECharacteristic::PROPERTY_NOTIFY); eventCharacteristic->addDescriptor(new BLE2902());
  heartbeatCharacteristic = service->createCharacteristic(heartbeatUuid, BLECharacteristic::PROPERTY_NOTIFY); heartbeatCharacteristic->addDescriptor(new BLE2902());
  configCharacteristic = service->createCharacteristic(configUuid, BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_WRITE);
  configCharacteristic->setCallbacks(new ConfigCallbacks()); refreshIdentity(); service->start();
  BLEAdvertising *advertising = BLEDevice::getAdvertising(); advertising->addServiceUUID(serviceUuid); advertising->start();
}

void setup() {
  Serial.begin(115200);
  pinMode(Pins::statusLed, OUTPUT); pinMode(Pins::emergencyButton, INPUT_PULLUP);
  prefs.begin("safealert", false);
  deviceId = "SA-ESP32-" + String(static_cast<uint32_t>(ESP.getEfuseMac()), HEX); deviceId.toUpperCase();
  fingerprintEnrolled = prefs.getBool("fingerprint", false);
  directCellularEnabled = prefs.getBool("cellular", false);
  pendingEvent = prefs.getString("pending", "");
  fingerprintSerial.begin(57600, SERIAL_8N1, Pins::fingerprintRx, Pins::fingerprintTx);
  finger.begin(57600); fingerprintReady = finger.verifyPassword();
  modem.begin(115200, SERIAL_8N1, Pins::modemRx, Pins::modemTx);
  setupBle();
}

void loop() {
  if (enrollmentRequested) { enrollmentRequested = false; enrollFingerprint(); }
  if (fingerprintReady && finger.getImage() == FINGERPRINT_OK && finger.image2Tz() == FINGERPRINT_OK && finger.fingerSearch() == FINGERPRINT_OK) {
    verifiedAt = millis(); blink(3);
    while (finger.getImage() != FINGERPRINT_NOFINGER) delay(50);
  }
  const bool pressed = digitalRead(Pins::emergencyButton) == LOW;
  if (pressed && buttonDownAt == 0) { buttonDownAt = millis(); buttonHandled = false; }
  if (pressed && !buttonHandled && millis() - buttonDownAt >= pairingHoldMs) {
    if (!fingerprintEnrolled || (verifiedAt && millis() - verifiedAt <= fingerprintWindowMs)) {
      pairingUntil = millis() + pairingWindowMs; blink(3, 300, 100); refreshIdentity();
    } else blink(2, 200, 200);
    buttonHandled = true;
  }
  if (!pressed && buttonDownAt) {
    const uint32_t held = millis() - buttonDownAt;
    if (!buttonHandled && held >= sosHoldMs && fingerprintEnrolled && verifiedAt && millis() - verifiedAt <= fingerprintWindowMs) createEmergency();
    else if (!buttonHandled && held >= sosHoldMs) blink(2, 200, 200);
    buttonDownAt = 0; buttonHandled = false;
  }
  if (millis() - lastHeartbeat >= 5000) {
    lastHeartbeat = millis();
    if (heartbeatCharacteristic) { heartbeatCharacteristic->setValue(String(millis()).c_str()); heartbeatCharacteristic->notify(); }
    if (pendingEvent.length()) deliverPending();
    refreshIdentity();
  }
  delay(20);
}
