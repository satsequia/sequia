# Registro de cambios y hallazgos · SAAT Sequías v3

**Fecha:** 2026-09-30 · **Autor:** M.Sc. Roberto Elías Granados Chahín · Consultoría GOAL HN-M26-53765

## 1. Objetivo de la versión

Sustituir el análisis por **punto** de la v2 por un análisis por **polígono** usando
los límites municipales y las subcuencas con influencia entregadas desde el SIG del
proyecto (`SIG_Sequia\json\`). La v1 (`SAT_Sequia_GOAL_repo`) y la v2
(`SAT_Sequia_GOAL_v2`) quedan **intactas**.

## 2. Insumos recibidos

| Archivo | Contenido | CRS |
|---|---|---|
| `municipio_cabañas.geojson` | Cabañas, COD_MUNI 1203, 155.14 km² | EPSG:32616 |
| `municipio_marcala.geojson` | Marcala, COD_MUNI 1208, 218.31 km² | EPSG:32616 |
| `municipio_san_francisco.geojson` | San Francisco, COD_MUNI 1317, 137.57 km² | EPSG:32616 |
| `cuencas_cabañas.geojson` | 14 subcuencas (HydroID 42–55) | EPSG:32616 |
| `cuencas_marcala.geojson` | 20 subcuencas (HydroID 22–41) | EPSG:32616 |
| `cuencas_san_francisco.geojson` | 21 subcuencas (HydroID 1–21) | EPSG:32616 |

Se copiaron a `geo_fuente/` sin modificar su contenido; solo se cambió `ñ`→`n` en el
nombre de archivo (compatibilidad web/Git). Las subcuencas **no traen nombre**; la app
usa `Subcuenca H##` hasta que se llene `geo_fuente/nombres_subcuencas.csv`.

## 3. Cambios principales

1. **Unidades de análisis por polígono** — 3 municipios + 54 subcuencas analizables.
2. **CHIRPS por polígono para los tres municipios** — promedio ponderado por área,
   diario 1981-01-01 → 2026-08-31, en `data/chirps_unidades.js` (2.5 MB).
3. **NASA POWER por celda** — se consultan las 4 celdas POWER que tocan las unidades y
   se combinan por área (antes: un punto por municipio).
4. **Mapa** con límites municipales, coropleta de subcuencas (SPEI-3, SPI-3 o CDD),
   etiquetas H##, rejilla CHIRPS y celdas POWER opcionales; leyenda fuera del mapa.
5. **Pestaña Subcuencas** (gráfico + tabla con área, % dentro del municipio, píxeles
   efectivos, SPEI-3, SPI-3, CDD, alerta) y **Alertas** agrupadas por municipio.
6. **Exportación CSV** (mensual con PET y diario) de la unidad activa.
7. ~~Arquitectura de datos simplificada (CHIRPS en un archivo del repositorio)~~ —
   **REVERTIDO el 2026-10-12** (ver sección 7): contradecía el TDR ("almacena resultados
   en base de datos") y la RFO firmada ("GitHub Pages + base de datos Firestore + GitHub
   Actions"). El archivo `data/chirps_unidades.js` se conserva sólo como respaldo histórico.
8. **Motor de índices como archivo único** (`ingest/indices.js`) cargado por la app y por
   el test de Node (antes estaba duplicado dentro del HTML). Sin cambios de cálculo:
   test de referencia sigue coincidiendo (SPEI-3 = 1.171871, SPI-3 = 1.207540).

## 4. Validación

- **CHIRPS v3 vs. Firestore v1 (ClimateSERV).** Para el píxel que contiene la zona
  “alta” de la v1 se compararon 360 meses (1991–2020): **correlación 1.000, sesgo
  −0.01 mm, error medio absoluto 0.02 mm**. La nueva vía de descarga (COG de CHC +
  IRIDL) entrega exactamente el mismo CHIRPS que ClimateSERV.
- **COG vs. IRIDL**: valores idénticos en días de prueba (p.ej. 2025-06-01, 8.983 mm).
- **Rejilla POWER** verificada con consultas a ambos lados de cada borde.
- **App** probada en Chromium (escritorio y móvil 390 px) sin errores de JavaScript;
  todas las unidades cargan CHIRPS y POWER reales.

## 5. Hallazgos importantes

1. **La v2 consultaba NASA POWER fuera de los municipios.** Coordenadas usadas en v2:
   Cabañas (14.05, −87.90) y San Francisco (14.40, −88.55). El límite real de Cabañas
   llega hasta −87.947 de longitud, y San Francisco está centrado en
   (14.13, −88.37). Consecuencia: en **Cabañas** el punto quedaba fuera del municipio
   pero dentro de la misma celda POWER, así que la serie POWER no cambia; en
   **San Francisco** el punto caía en **otra celda** (14.5°N, −88.75°), de modo que la
   serie POWER de la v2 para San Francisco no correspondía al municipio. La v3 lo
   corrige usando los polígonos.
2. **Las zonas “alta/media/baja” de la v1 también estaban desplazadas**: los tres
   rectángulos *placeholder* (longitudes −87.94 a −87.86) quedan **completamente fuera
   de Cabañas, al este** (el municipio termina en −87.947). Los datos CHIRPS de
   Firestore v1 y de la app v2 correspondían a esa zona vecina, no al municipio.
3. **Los tres municipios están en la misma celda NASA POWER** (14.0°N, −88.125°).
   POWER no puede diferenciar municipios ni la mayoría de subcuencas.
4. **24 de 54 subcuencas son menores que ~1.5 píxeles CHIRPS**: sus diferencias con
   las vecinas no son físicas.
5. **Delimitación a revisar en el SIG:**
   - Cabañas: las subcuencas cubren el **89.8 %** del municipio (≈ 16 km² sin subcuenca).
   - Cabañas: **H55** es una astilla de 0.01 km² (excluida del análisis, no borrada).
   - San Francisco: **H01 (891 km²)** y **H16 (872 km²)** son muy extensas (se extienden
     hasta La Paz); **H14** y **H18** tienen 0 % de área dentro del municipio
     (colindan a 8 m y 49 m del límite).
6. **Estado al 31-ago-2026 (CHIRPS, SPEI-3):** Cabañas −2.26, Marcala −2.40,
   San Francisco −2.49 → **sequía extrema / alerta roja** en los tres municipios y en
   todas sus subcuencas. NASA POWER da −1.25 (sequía moderada, alerta verde) para la
   celda común: la discrepancia CHIRPS–POWER observada en la v2 se mantiene y debe
   discutirse en el informe (ninguna de las dos está corregida con estaciones).

## 6. Pendientes

- Nombres oficiales de subcuencas (`geo_fuente/nombres_subcuencas.csv`).
- Revisar cobertura de Cabañas y la pertinencia de H01/H16/H14/H18 en San Francisco.
- Corrección de sesgo con estaciones (La Esperanza, Marcala, Erandique) — CENAOS.
- Corrección altitudinal de temperatura (DEM) para el PET.
- Logos oficiales ICSP / Irish Aid.
- Publicar en GitHub Pages, publicar reglas y correr la carga inicial (`docs/PUESTA_EN_MARCHA_v3.md`).

## 7. v3.1 · Vuelta a Firestore, CHIRPS preliminar, IMERG real y actualización diaria (2026-10-12)

**Motivo.** Alinear la v3 con el TDR 53765 y con la RFO (base de datos Firestore) y
acercar la app al tiempo real.

**Cambios**
1. **Firestore como almacén** (colecciones nuevas `v3_series` y `v3_meta`, conviven con
   las de v1/v2). Un documento por fuente y unidad con la serie diaria comprimida
   (≈ 45 KB CHIRPS, ≈ 26 KB IMERG; límite de Firestore 1 MiB).
2. **`v3_meta/resumen`** precalculado en GitHub Actions con el **mismo código** de la web
   (`ingest/motor_unidades.js` ejecutado en Node): mapa, alertas y tabla de subcuencas
   cuestan **1 lectura**; cada unidad abierta ≈ 3 lecturas más.
3. **CHIRPS preliminar** (CHC `prelim/global_daily/fixed`) para los días posteriores al
   último CHIRPS final; se reemplaza solo al publicarse el final. La app lo etiqueta
   **preliminar**. Latencia observada el 12-oct-2026: preliminar al 10-oct; final al 31-ago.
4. **IMERG V07 Late real vía ClimateSERV sin credenciales** (dataset 226). Verificación
   propia del 2026-10-12, a partir del hallazgo del proyecto La Esperanza: 226 (V07 Late)
   y 227 (V07 Early) devuelven datos hasta el día anterior; 26 y 91 (V06, los que trae
   por defecto el paquete `climateserv`) ya no devuelven datos. La serie en ClimateSERV
   empieza el **2000-06-08**. Se descarga la rejilla 0.1° (operación NetCDF) y el promedio
   por polígono se hace con pesos de área (igual que CHIRPS). Earthdata deja de ser necesario.
5. **NASA POWER** también se guarda en Firestore (4 celdas); la consulta en vivo desde el
   navegador queda sólo como respaldo.
6. **Actualización diaria** (antes semanal) a las 23:17 UTC, más un registro diminuto
   `data/estado_ingesta.json` que evita que GitHub desactive el cron por inactividad.
7. **Respaldo**: si Firestore no responde, la web lee `data/semilla/*.json` (mismo formato)
   y lo indica con la insignia *DATOS DE RESPALDO*.
8. PET del mes en curso: si aún no hay días de temperatura, se usa el PET climatológico
   1991–2020 de ese mes (antes el SPEI quedaba vacío los primeros días de cada mes).

9. **Huecos de la fuente.** IMERG en ClimateSERV no tiene datos para 2014-06-01…07,
   2023-12-31, 2024-01-01, **todo mayo de 2024** y 2026-01-21 (verificado: la petición
   devuelve vacío). Regla nueva del motor: un mes con > 10 % de días faltantes no se usa
   (índice "sin dato" en las ventanas que lo incluyen); con ≤ 10 % se prorratea. CHIRPS y
   POWER no tienen huecos.
10. **Validación de la tubería completa** con el emulador oficial de Firestore: carga
    inicial → bajar → CHIRPS/IMERG/POWER incremental → resumen → subir, y la web leyendo
    del emulador (4 lecturas al abrir; mapa, subcuencas y alertas sin lecturas extra;
    +2 por cada subcuenca abierta).

**Nota operativa.** El servidor de CHC limita temporalmente las descargas masivas (respuestas
403). La ingesta sólo descarga los días de preliminar que faltan (1–3 por corrida diaria) y
reintenta; si un día falla, la siguiente corrida lo completa. La semilla entregada el
13-oct-2026 llega con CHIRPS preliminar hasta el 10-oct-2026.

**Costo** (plan Spark, sin tarjeta → sin cobros): ingesta ≈ 120 lecturas + 120
escrituras/día; visita ≈ 4–5 lecturas. Cuota gratuita: 50 000 lecturas y 20 000
escrituras por día (precios verificados en la documentación de Firebase el 2026-09-30).

**Nota metodológica IMERG.** Al empezar en 2000, su referencia SPI/SPEI es 2001–2020
(20 años), menor que los 30 años recomendados; comparar con CHIRPS con cautela.
