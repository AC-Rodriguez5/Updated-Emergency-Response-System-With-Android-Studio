#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// --- SafeAlert BLE GATT UUIDs (BLE-004) ---
#define SERVICE_UUID           "9f4d0001-7d6a-4b85-9e74-2f4d8e8d0001"
#define BUTTON_CHAR_UUID       "9f4d0002-7d6a-4b85-9e74-2f4d8e8d0002"
#define BATTERY_CHAR_UUID      "00002a19-0000-1000-8000-00805f9b34fb"
#define HEARTBEAT_CHAR_UUID    "9f4d0003-7d6a-4b85-9e74-2f4d8e8d0003"

// --- Hardware Config (BLE-001) ---
#define PIN_BTN_MEDICAL      18
#define PIN_BTN_CRIME        19
#define PIN_BTN_FIRE         21
#define PIN_BTN_SOS          22
#define PIN_BATTERY_ADC      34

#define FIRMWARE_VERSION     "1.0.0"
#define DEBOUNCE_DELAY_MS    1000 // BLE-006: 1000ms debounce

BLEServer* pServer = NULL;
BLECharacteristic* pButtonCharacteristic = NULL;
BLECharacteristic* pBatteryCharacteristic = NULL;
BLECharacteristic* pHeartbeatCharacteristic = NULL;

bool deviceConnected = false;
String deviceId = "SA-ESP32-";
uint32_t sequenceNo = 1;
unsigned long lastHeartbeat = 0;
unsigned long lastButtonPress = 0;

class ServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
      deviceConnected = true;
      Serial.println("Phone Connected!");
    }
    void onDisconnect(BLEServer* pServer) {
      deviceConnected = false;
      Serial.println("Phone Disconnected. Restarting advertising...");
      BLEDevice::startAdvertising();
    }
};

// Read Battery level mapping (Dummy calibration 0-100%)
int getBatteryLevel() {
    int adcVal = analogRead(PIN_BATTERY_ADC);
    int level = map(adcVal, 1800, 4095, 0, 100);
    return constrain(level, 0, 100);
}

// BLE-005: Formats the JSON Event payload
void triggerEmergency(String type) {
    unsigned long now = millis();
    
    // BLE-006: Hardware Debounce
    if (now - lastButtonPress < DEBOUNCE_DELAY_MS) return;
    lastButtonPress = now;

    if (deviceConnected) {
        String eventId = deviceId + "-" + String(sequenceNo);
        int battery = getBatteryLevel();
        
        // Construct JSON Payload
        char payload[256];
        snprintf(payload, sizeof(payload), 
            "{\"deviceId\":\"%s\",\"eventId\":\"%s\",\"sequenceNo\":%d,\"button\":\"%s\",\"battery\":%d,\"firmwareVersion\":\"%s\"}", 
            deviceId.c_str(), eventId.c_str(), sequenceNo, type.c_str(), battery, FIRMWARE_VERSION);

        Serial.print("Sending Alert: ");
        Serial.println(payload);

        pButtonCharacteristic->setValue(payload);
        pButtonCharacteristic->notify();
        
        sequenceNo++;
    }
}

void setup() {
    Serial.begin(115200);
    
    pinMode(PIN_BTN_MEDICAL, INPUT_PULLUP);
    pinMode(PIN_BTN_CRIME, INPUT_PULLUP);
    pinMode(PIN_BTN_FIRE, INPUT_PULLUP);
    pinMode(PIN_BTN_SOS, INPUT_PULLUP);

    // Generate Device ID from MAC (BLE-002)
    uint64_t chipid = ESP.getEfuseMac();
    uint16_t last4 = (uint16_t)(chipid >> 32); 
    char idSuffix[5];
    sprintf(idSuffix, "%04X", last4);
    deviceId += String(idSuffix);

    Serial.println("Initializing SafeAlert BLE Device: " + deviceId);

    BLEDevice::init(deviceId.c_str());
    pServer = BLEDevice::createServer();
    pServer->setCallbacks(new ServerCallbacks());

    BLEService *pService = pServer->createService(SERVICE_UUID);

    pButtonCharacteristic = pService->createCharacteristic(
        BUTTON_CHAR_UUID,
        BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY
    );
    pButtonCharacteristic->addDescriptor(new BLE2902());

    pBatteryCharacteristic = pService->createCharacteristic(
        BATTERY_CHAR_UUID,
        BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY
    );
    pBatteryCharacteristic->addDescriptor(new BLE2902());

    pHeartbeatCharacteristic = pService->createCharacteristic(
        HEARTBEAT_CHAR_UUID,
        BLECharacteristic::PROPERTY_NOTIFY
    );
    pHeartbeatCharacteristic->addDescriptor(new BLE2902());

    pService->start();

    BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
    pAdvertising->addServiceUUID(SERVICE_UUID);
    pAdvertising->setScanResponse(true);
    pAdvertising->setMinPreferred(0x06);  
    BLEDevice::startAdvertising();
    
    Serial.println("BLE Advertising Started. Waiting for pairing...");
}

void loop() {
    // Check physical buttons
    if (digitalRead(PIN_BTN_MEDICAL) == LOW) triggerEmergency("medical");
    else if (digitalRead(PIN_BTN_CRIME) == LOW) triggerEmergency("crime");
    else if (digitalRead(PIN_BTN_FIRE) == LOW) triggerEmergency("fire");
    else if (digitalRead(PIN_BTN_SOS) == LOW) triggerEmergency("general_sos");

    // Send Heartbeat and Battery every 10 seconds (BLE-024)
    if (deviceConnected && millis() - lastHeartbeat > 10000) {
        lastHeartbeat = millis();
        
        int bat = getBatteryLevel();
        uint8_t batPayload[1] = {(uint8_t)bat};
        pBatteryCharacteristic->setValue(batPayload, 1);
        pBatteryCharacteristic->notify();

        pHeartbeatCharacteristic->setValue("ping");
        pHeartbeatCharacteristic->notify();
    }
    delay(50); // Small delay to prevent CPU hogging
}