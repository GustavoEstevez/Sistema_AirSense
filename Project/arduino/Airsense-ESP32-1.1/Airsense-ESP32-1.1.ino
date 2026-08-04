#include <Wire.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include "SH1106Wire.h"
#include "Adafruit_SHT31.h"
#include "MQUnifiedsensor.h"

// ---- CONFIGURACIÓN WiFi ----
const char* WIFI_SSID     = "FRANGUSMEL";
const char* WIFI_PASSWORD = "ECLIPSE88";

// ---- CONFIGURACIÓN DJANGO ----
const char* SERVER_URL = "http://192.168.1.4:8000/dashboard/sensor/datos/";

// ---- PINES ----
#define MIC_PIN   34
#define MQ135_PIN 35

// ---- INSTANCIAS ----
SH1106Wire display(0x3C, 21, 22);
Adafruit_SHT31 sht31;
MQUnifiedsensor mq135("ESP32", 3.3, 12, MQ135_PIN, "MQ-135");

// ---- VARIABLES COMPARTIDAS ----
SemaphoreHandle_t datosMutex;
float g_temperatura = 0;
float g_humedad     = 0;
int   g_ruido        = 0;
float g_co2          = 0;

// ---- SEGUIMIENTO CONTINUO DE NIVEL ----
float biasDC     = 1900;
float nivelRuido = 0;

// ---- CALIBRACIÓN (ajustada con tus datos reales) ----
const float NIVEL_SILENCIO = 40;
const float NIVEL_FUERTE   = 170;
const float DB_SILENCIO    = 35;
const float DB_FUERTE      = 90;

// ---- PROMEDIO PARA EL POST ----
const int MAX_MUESTRAS_POST = 60;
int muestrasParaPost[MAX_MUESTRAS_POST];
int cantMuestrasPost = 0;

unsigned long lastDisplay = 0;
unsigned long lastSensoresLentos = 0;
const unsigned long INTERVALO_DISPLAY = 200;
const unsigned long INTERVALO_SENSORES_LENTOS = 2000;

// =============================================================
// TAREA DE RED (núcleo 0)
// =============================================================
void tareaRed(void *parametro) {
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    vTaskDelay(500 / portTICK_PERIOD_MS);
    Serial.print(".");
  }
  Serial.println("\nWiFi conectado");
  Serial.println(WiFi.localIP());

  WiFi.setSleep(false);   // <-- CAMBIO 1: apaga el modem sleep que ensucia el ADC

  for (;;) {
    vTaskDelay(2000 / portTICK_PERIOD_MS);
    if (WiFi.status() != WL_CONNECTED) continue;

    float temp, hum, co2val;
    int ruidoProm;
    xSemaphoreTake(datosMutex, portMAX_DELAY);
    temp = g_temperatura; hum = g_humedad; co2val = g_co2; ruidoProm = g_ruido;
    xSemaphoreGive(datosMutex);

    HTTPClient http;
    http.setConnectTimeout(1500);
    http.setTimeout(1500);
    http.begin(SERVER_URL);
    http.addHeader("Content-Type", "application/json");

    String body = "{";
    body += "\"temperatura\":" + String(temp, 1) + ",";
    body += "\"humedad\":"     + String(hum, 1)  + ",";
    body += "\"ruido\":"       + String(ruidoProm) + ",";
    body += "\"co2\":"         + String(co2val, 0);
    body += "}";

    int code = http.POST(body);
    Serial.println("HTTP POST: " + String(code));
    http.end();
  }
}

void setup() {
  Serial.begin(115200);
  analogSetAttenuation(ADC_11db);
  datosMutex = xSemaphoreCreateMutex();

  display.init();
  display.clear();
  display.setFont(ArialMT_Plain_10);
  display.drawString(0, 0, "Iniciando...");
  display.display();

  if (!sht31.begin(0x44)) Serial.println("SHT30 no encontrado");

  mq135.setRegressionMethod(1);
  mq135.setA(110.47); mq135.setB(-2.862);
  mq135.init();
  mq135.setRL(10);
  mq135.setR0(10);

  long sumaInicial = 0;
  for (int i = 0; i < 200; i++) { sumaInicial += analogRead(MIC_PIN); delayMicroseconds(500); }
  biasDC = sumaInicial / 200.0;
  Serial.printf("Bias DC inicial: %.1f\n", biasDC);

  xTaskCreatePinnedToCore(tareaRed, "TareaRed", 8192, NULL, 1, NULL, 0);

  display.clear();
  display.drawString(0, 0, "WiFi conectando...");
  display.display();
  delay(500);
}

// --- CAMBIO 2: nueva función, lectura del mic con filtro de mediana ---
int leerMicMediana() {
  const int N = 15;
  int muestras[N];
  for (int i = 0; i < N; i++) {
    muestras[i] = analogRead(MIC_PIN);
  }
  for (int i = 0; i < N - 1; i++) {
    for (int j = i + 1; j < N - i - 1; j++) {
      if (muestras[j] > muestras[j + 1]) {
        int tmp = muestras[j];
        muestras[j] = muestras[j + 1];
        muestras[j + 1] = tmp;
      }
    }
  }
  return muestras[N / 2];
}

// =============================================================
// LOOP PRINCIPAL (núcleo 1): solo mic + display
// =============================================================
void loop() {
  unsigned long now = millis();

  // --- Muestreo con filtro de mediana en vez de analogRead crudo ---
  int muestra = leerMicMediana();
  if (muestra > 0 && muestra < 4095) {
    biasDC += (muestra - biasDC) * 0.0005;
    float desviacion = abs(muestra - biasDC);

    float maxSalto = 40.0;
    if (desviacion - nivelRuido > maxSalto) {
      desviacion = nivelRuido + maxSalto;
    }

    if (desviacion > nivelRuido) {
      nivelRuido += (desviacion - nivelRuido) * 0.3;
    } else {
      nivelRuido += (desviacion - nivelRuido) * 0.02;
    }
  }

  if (now - lastDisplay >= INTERVALO_DISPLAY) {
    int ruidoInstant = DB_SILENCIO + (nivelRuido - NIVEL_SILENCIO) *
                        (DB_FUERTE - DB_SILENCIO) / (NIVEL_FUERTE - NIVEL_SILENCIO);
    ruidoInstant = constrain(ruidoInstant, 25, 100);

    if (cantMuestrasPost < MAX_MUESTRAS_POST) {
      muestrasParaPost[cantMuestrasPost++] = ruidoInstant;
    }

    Serial.printf("bias:%.1f nivelRuido:%.1f -> ruidoInstant:%d (n=%d)\n",
      biasDC, nivelRuido, ruidoInstant, cantMuestrasPost);

    lastDisplay = now;
  }

  if (now - lastSensoresLentos >= INTERVALO_SENSORES_LENTOS) {
    float t = sht31.readTemperature();
    float h = sht31.readHumidity();
    if (isnan(t)) t = 0;
    if (isnan(h)) h = 0;

    mq135.update();
    float c = constrain(mq135.readSensor(), 0, 5000);

    long suma = 0;
    for (int i = 0; i < cantMuestrasPost; i++) suma += muestrasParaPost[i];
    int promedioFinal = cantMuestrasPost > 0 ? suma / cantMuestrasPost : 0;

    xSemaphoreTake(datosMutex, portMAX_DELAY);
    g_temperatura = t;
    g_humedad = h;
    g_co2 = c;
    g_ruido = promedioFinal;
    xSemaphoreGive(datosMutex);

    display.clear();
    display.setFont(ArialMT_Plain_10);
    display.drawString(0, 0,  "Temp:  " + String(t, 1) + " C");
    display.drawString(0, 14, "Hum:   " + String(h, 1) + " %");
    display.drawString(0, 28, "Ruido: " + String(promedioFinal) + " dB");
    display.drawString(0, 42, "CO2:   " + String(c, 0) + " ppm");
    display.display();

    Serial.printf(">>> Promedio final (display + POST): %d dB\n", promedioFinal);

    cantMuestrasPost = 0;
    lastSensoresLentos = now;
  }
}