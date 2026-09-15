#include <Arduino.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

static const char* SERVICE_UUID="9f4d0001-7d6a-4b85-9e74-2f4d8e8d0001";
static const char* BUTTON_UUID="9f4d0002-7d6a-4b85-9e74-2f4d8e8d0002";
static const char* HEARTBEAT_UUID="9f4d0003-7d6a-4b85-9e74-2f4d8e8d0003";
static const char* CONFIG_UUID="9f4d0004-7d6a-4b85-9e74-2f4d8e8d0004";
static const uint8_t BUTTON_PINS[]={18,19,21,22};
static const char* BUTTON_TYPES[]={"medical","crime","fire","general_sos"};
static constexpr size_t MAX_PENDING=16;
static Preferences preferences;
static String deviceId;
static uint32_t bootCounter,sequenceNo=0;
static JsonDocument pending;
static BLECharacteristic *buttonCharacteristic,*heartbeatCharacteristic,*configCharacteristic,*batteryCharacteristic;
static volatile bool connected=false;
static bool wasDown[4]={false,false,false,false};
static unsigned long lastPress[4]={0,0,0,0},lastHeartbeat=0,lastReplay=0;
static portMUX_TYPE ackMux=portMUX_INITIALIZER_UNLOCKED;
static char acknowledged[180]={0};

static void publishIdentity(){
  JsonDocument identity;identity["deviceId"]=deviceId;identity["firmwareVersion"]="2.0.0";identity["queuedEvents"]=pending.as<JsonArray>().size();
  String value;serializeJson(identity,value);configCharacteristic->setValue(value.c_str());
}
static bool persistQueue(){String value;serializeJson(pending,value);return preferences.putString("pending",value)>0;}
static int batteryLevel(){
#if BATTERY_CALIBRATED
  // Enable only after verifying the board's 2:1 divider and cell voltage curve.
  const float volts=analogReadMilliVolts(34)*2.0f/1000.0f;
  return constrain(static_cast<int>((volts-3.3f)/(4.2f-3.3f)*100.0f),0,100);
#else
  return -1; // Unknown is never shown as a fabricated percentage.
#endif
}
class ServerCallbacks:public BLEServerCallbacks{
  void onConnect(BLEServer*)override{connected=true;}
  void onDisconnect(BLEServer*)override{connected=false;BLEDevice::startAdvertising();}
};
class ConfigCallbacks:public BLECharacteristicCallbacks{
  void onRead(BLECharacteristic*)override{publishIdentity();}
  void onWrite(BLECharacteristic* characteristic)override{
    JsonDocument input;const auto raw=characteristic->getValue();
    if(raw.size()>256||deserializeJson(input,raw))return;
    const char* id=input["ackEventId"]|"";
    if(strlen(id)>=sizeof(acknowledged))return;
    portENTER_CRITICAL(&ackMux);strlcpy(acknowledged,id,sizeof(acknowledged));portEXIT_CRITICAL(&ackMux);
  }
};
static void enqueue(size_t button){
  if(pending.as<JsonArray>().size()>=MAX_PENDING){Serial.println("QUEUE FULL: event could not be saved. Check phone connection.");return;}
  JsonObject event=pending.as<JsonArray>().add<JsonObject>();
  event["deviceId"]=deviceId;event["eventId"]=deviceId+"-"+String(bootCounter)+"-"+String(++sequenceNo);
  event["sequenceNo"]=sequenceNo;event["button"]=BUTTON_TYPES[button];event["firmwareVersion"]="2.0.0";
  const int battery=batteryLevel();if(battery>=0)event["battery"]=battery;
  if(!persistQueue()){Serial.println("FLASH ERROR: emergency event not confirmed saved.");return;}
  publishIdentity();lastReplay=0;
}
void setup(){
  Serial.begin(115200);
  preferences.begin("safealert",false);bootCounter=preferences.getUInt("boot",0)+1;
  if(preferences.putUInt("boot",bootCounter)==0){Serial.println("Cannot save boot identity. Device halted.");while(true)delay(1000);}
  const String saved=preferences.getString("pending","[]");
  if(deserializeJson(pending,saved)||!pending.is<JsonArray>()){Serial.println("Stored emergency queue is unreadable. Service required.");while(true)delay(1000);}
  char suffix[13];snprintf(suffix,sizeof(suffix),"%012llX",ESP.getEfuseMac()&0xFFFFFFFFFFFFULL);deviceId=String("SA-ESP32-")+suffix;
  for(size_t i=0;i<4;i++)pinMode(BUTTON_PINS[i],INPUT_PULLUP);
  BLEDevice::init((String("SafeAlert-Panic-")+String(suffix).substring(8)).c_str());BLEDevice::setMTU(247);
  BLEServer* server=BLEDevice::createServer();server->setCallbacks(new ServerCallbacks());BLEService* service=server->createService(SERVICE_UUID);
  buttonCharacteristic=service->createCharacteristic(BUTTON_UUID,BLECharacteristic::PROPERTY_READ|BLECharacteristic::PROPERTY_NOTIFY);buttonCharacteristic->addDescriptor(new BLE2902());
  heartbeatCharacteristic=service->createCharacteristic(HEARTBEAT_UUID,BLECharacteristic::PROPERTY_NOTIFY);heartbeatCharacteristic->addDescriptor(new BLE2902());
  configCharacteristic=service->createCharacteristic(CONFIG_UUID,BLECharacteristic::PROPERTY_READ|BLECharacteristic::PROPERTY_WRITE);configCharacteristic->setCallbacks(new ConfigCallbacks());
  batteryCharacteristic=service->createCharacteristic("00002a19-0000-1000-8000-00805f9b34fb",BLECharacteristic::PROPERTY_READ|BLECharacteristic::PROPERTY_NOTIFY);batteryCharacteristic->addDescriptor(new BLE2902());
  publishIdentity();service->start();auto* advertising=BLEDevice::getAdvertising();advertising->addServiceUUID(SERVICE_UUID);advertising->setScanResponse(true);BLEDevice::startAdvertising();
}
void loop(){
  const unsigned long now=millis();
  for(size_t i=0;i<4;i++){
    const bool down=digitalRead(BUTTON_PINS[i])==LOW;
    if(down&&!wasDown[i]&&(lastPress[i]==0||now-lastPress[i]>=1000)){lastPress[i]=now;enqueue(i);}
    wasDown[i]=down; // One event per physical press, never repeated while held.
  }
  char ack[sizeof(acknowledged)];portENTER_CRITICAL(&ackMux);strlcpy(ack,acknowledged,sizeof(ack));acknowledged[0]=0;portEXIT_CRITICAL(&ackMux);
  if(ack[0]&&pending.as<JsonArray>().size()&&String(pending[0]["eventId"].as<const char*>())==ack){pending.as<JsonArray>().remove(0);persistQueue();publishIdentity();}
  if(connected&&pending.as<JsonArray>().size()&&(lastReplay==0||now-lastReplay>=2000)){
    String value;serializeJson(pending[0],value);buttonCharacteristic->setValue(value.c_str());buttonCharacteristic->notify();lastReplay=now;
  }
  if(connected&&now-lastHeartbeat>=10000){
    heartbeatCharacteristic->setValue("ping");heartbeatCharacteristic->notify();const int battery=batteryLevel();
    if(battery>=0){uint8_t value=static_cast<uint8_t>(battery);batteryCharacteristic->setValue(&value,1);batteryCharacteristic->notify();}
    lastHeartbeat=now;
  }
  delay(20);
}
