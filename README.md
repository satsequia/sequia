# SAAT Sequía **v3** · Municipios y subcuencas · Corredor Seco de Honduras

Sistema de Alerta Anticipada Temprana (SAAT) ante sequías para **Cabañas** y
**Marcala** (La Paz) y **San Francisco** (Lempira). Consultoría **GOAL**, proyecto
ICSP (apoyo Irish Aid), ref. **HN-M26-53765**.
Autor: M.Sc. Roberto Elías Granados Chahín.

## Arquitectura (la del TDR 53765 y la RFO)

```
GitHub Actions (DIARIO, automático)  ──►  Firestore (base de datos en línea)  ──►  Web en GitHub Pages  ──►  Municipalidades
  CHIRPS final 1981→ + CHIRPS preliminar      v3_series: serie diaria por polígono       lee 1 resumen + la unidad abierta
  IMERG V07 Late (ClimateSERV, sin llave)     v3_meta/resumen: índices ya calculados     mapa, alertas, SPI/SPEI/CDD,
  NASA POWER (lluvia + temperatura)           v3_meta/estado                             comparativa, CSV
```

- **Descarga automática** diaria (GitHub Actions, 17:17 hora de Honduras).
- **Base de datos** en línea: Firestore (proyecto `satsequia-3b2a9`, el mismo de v1/v2).
- **Aplicación web** en GitHub Pages: no se instala nada; se abre con un enlace.
- **Casi tiempo real:** CHIRPS preliminar (≈ 2–5 días de latencia) se reemplaza solo
  por CHIRPS final cuando éste sale (≈ 4–6 semanas); IMERG Late ≈ 1 día; POWER ≈ 2–3 días.

## Qué cambia respecto a la v2

| | v2 | **v3** |
|---|---|---|
| Unidad de análisis | Un **punto** por municipio | **Polígonos**: municipio completo + **54 subcuencas con influencia** |
| CHIRPS | Solo Cabañas, zonas *placeholder* fuera del municipio | 3 municipios y todas las subcuencas, **promedio ponderado por área**, final + **preliminar** |
| IMERG | Demo (pendiente Earthdata) | **Real**: V07 Late vía ClimateSERV **sin credenciales**, desde 2000 |
| NASA POWER | 1 punto por municipio (en San Francisco, otra celda) | Por **celda** POWER ponderada por área, guardado en la base de datos |
| Actualización | Semanal | **Diaria** |
| Lecturas por visita | Todas las series | **1 resumen** + la unidad abierta (≈ 4–5 lecturas) |
| Mapa / pestañas | Círculos | Límites + **coropleta de subcuencas**, pestaña **Subcuencas**, alertas por subcuenca, **CSV** |

Índices, umbrales y motor de cálculo **no cambian** (validados 2026-09-14).

## Estructura

```
index.html                    Interfaz
app.js                        Interfaz: carga de datos (Firestore → respaldo), mapa, pestañas
ingest/motor_unidades.js      Capa de datos + índices por polígono (la usan la web y resumen.js)
ingest/indices.js / .py       Motor de índices SPI/SPEI/CDD (JS y referencia Python)
ingest/build_geo.py           Límites + subcuencas: UTM→WGS84, áreas, pesos CHIRPS/IMERG/POWER
ingest/chirps_zonal.py        CHIRPS final + preliminar por polígono
ingest/imerg_climateserv.py   IMERG V07 Late (ClimateSERV id 226) por polígono
ingest/power_celdas.py        NASA POWER por celda (lluvia, Tmáx, Tmín)
ingest/resumen.js             Precalcula v3_meta/resumen con el MISMO motor de la web
ingest/firestore_sync.py      bajar / subir documentos a Firestore
ingest/saat_comun.py          Formato y codificación de los documentos
ingest/catalogo_unidades.py   Genera docs/UNIDADES_ANALISIS.md
geo_fuente/                   GeoJSON originales de ArcGIS (EPSG:32616) + nombres_subcuencas.csv
data/geo_saat.js              Límites WGS84 + pesos (lo carga la web)
data/unidades.json            Catálogo de unidades + pesos (lo usa la ingesta)
data/semilla/*.json           Carga inicial de Firestore y RESPALDO de la web si Firestore no responde
data/limites/*.geojson        Límites y subcuencas WGS84 con atributos (para SIG)
data/chirps_unidades.js       Respaldo histórico del 30-sep (CHIRPS final a 31-ago); la web ya no lo usa
firestore.rules               Reglas (lectura pública de v3; escritura sólo la ingesta)
ingest_v3.yml                 Workflow → mover a .github/workflows/
docs/PUESTA_EN_MARCHA_v3.md   Pasos para publicarla (leer primero)
docs/METODOLOGIA_SEQUIA.md    Metodología
docs/UNIDADES_ANALISIS.md     Catálogo de subcuencas
docs/CAMBIOS_v3.md            Registro de cambios y hallazgos
```

## Puesta en marcha

Ver **`docs/PUESTA_EN_MARCHA_v3.md`** (5 pasos: subir el repo, mover el workflow,
publicar reglas, correr la carga inicial, activar Pages).

## Costo de Firestore (plan gratuito Spark)

| | Cuota gratis/día | Uso estimado |
|---|---|---|
| Lecturas | 50 000 | ingesta ≈ 120/día · cada visita ≈ 4–5 (más ≈ 2 por cada subcuenca que se abra) |
| Escrituras | 20 000 | ≈ 120/día (una corrida diaria) |
| Almacenamiento | 1 GiB | ≈ 6 MB |

En el plan Spark no hay tarjeta asociada: no puede generar cobros.

## Validar el motor
```bash
cd ingest && python indices.py
cd ../docs && node test_indices.js
```

## Limitaciones conocidas (leer antes de reportar resultados)

1. **Resolución CHIRPS (≈29 km²/píxel)**: 24 de 54 subcuencas tienen < 1.5 píxeles
   efectivos; sus diferencias con las vecinas no son físicas.
2. **IMERG (0.1°, ≈ 120 km²/píxel)** es aún más grueso; y su referencia es **2001–2020**
   (20 años) porque la serie empieza en 2000.
3. **NASA POWER no diferencia municipios** (los tres en la misma celda).
4. **Cobertura de subcuencas en Cabañas: 89.8 %**; SFR-H01/H16 muy extensas; SFR-H14/H18
   sin área dentro del municipio.
5. **CHIRPS preliminar** puede cambiar al publicarse el final (la app lo marca).
6. **Sin corrección de sesgo** con estaciones ni corrección altitudinal de temperatura:
   valores técnicos, no oficiales.

> Los valores marcados **MODO DEMO** son sintéticos (sólo si no hay base de datos ni respaldo).
