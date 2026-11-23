# SAAT Sequía v5 — Cambios (2026-11-15)

Consultoría HN-M26-53765 · GOAL / ICSP / Irish Aid · M.Sc. Roberto Elías Granados Chahín

La v5 parte de la v4.1 (todas sus correcciones están incluidas; ver `CAMBIOS_v4.md`) e incorpora el producto
«Umbrales de Alerta Temprana» del Bloque 3. Es una **propuesta pendiente de validación** con GOAL y los municipios
(taller de diciembre de 2026).

## 1. Umbrales por ciclo productivo
- `data/umbrales.js` (estático, 55 unidades): lluvia acumulada (mm) equivalente a SPI −1.0 / −1.5 / −2.0 al fin de cada
  mes de la **primera** (may–jul), la **postrera** (ago–oct) y la **estación lluviosa** (may–oct). CHIRPS v2.0 sin
  corrección de sesgo, referencia 1991–2020. Se genera con
  `04_Bloque3_App_Boletines_Cierre/Umbrales/scripts/b3_05_umbrales_app.py` a partir de `datos/umbrales.json`.

## 2. Nivel técnico de alerta (`ingest/umbrales_motor.js`)
- Nivel técnico = el mayor entre (1) la lluvia acumulada del ciclo frente a sus umbrales, evaluada al fin de cada mes
  desde el 2.º mes del ciclo, y (2) el SPEI-3 con dos meses completos seguidos bajo el umbral entre mayo y octubre.
- Siempre con CHIRPS, sea cual sea la fuente activa (los umbrales son milímetros de CHIRPS).
- «Vigente» = última evaluación; de noviembre a abril se muestra el nivel con que cerró la temporada.
- `ingest/resumen.js` lo calcula cada día para las 55 unidades y lo guarda en `v3_meta/resumen` (campo `tec` de la
  fuente `chirps`): mapa, tabla y alertas no necesitan leer la serie de cada unidad. Mientras la ingesta no haya corrido
  con la v5, las unidades no abiertas aparecen «sin evaluar».
- Verificación: con los mismos datos, el motor reproduce año por año (1981–2025, tres municipios) el nivel técnico y el
  SPEI-3 persistente del retroanálisis del documento de umbrales.

## 3. Interfaz
- **Pestaña 🎯 Umbrales** (`umbrales_ui.js`): nivel técnico vigente; lluvia acumulada del ciclo frente a las franjas de
  umbral, con comparación de hasta 5 años; tabla de umbrales de la unidad (mm y % de la normal) con lo observado en la
  temporada; retroanálisis 1981 → hoy de la unidad; matriz de decisión y regla de activación propuestas; CSV de umbrales.
- **Inicio**: tarjeta con el nivel técnico y sus dos componentes.
- **Mapa**: nueva opción «Nivel técnico». **Subcuencas**: nueva columna. **Alertas**: nivel técnico por municipio.
- **Metodología**: sección sobre umbrales y nivel técnico.
- El semáforo SPEI-3 existente no se modifica; el nivel técnico se muestra aparte.

## 3b. Mapas (2026-11-20)
- **Esri topográfico como mapa base por defecto** (actualizado 2026-11-23) en todos los mapas: pestaña Mapa y mapa por
  subcuenca del Dashboard. Reemplaza a OpenStreetMap, que se había puesto por defecto el 2026-11-20, porque la política
  de uso de OSM bloquea teselas en algunos contextos (archivo abierto con doble clic, uso intensivo). OpenStreetMap,
  Esri gris claro, Esri satélite y OpenTopoMap siguen disponibles en el control de capas de la pestaña Mapa.
- Se quitó el rectángulo negro que el navegador dibujaba alrededor de un polígono al hacer clic (contorno de foco);
  la unidad seleccionada se sigue marcando con el borde lima.

## 4. Lo que no cambia
- Firestore (colecciones, reglas), workflow de ingesta, motor de índices y pestañas existentes.

## 5. Limitaciones y pendientes
- Los umbrales no se recalculan solos: hay que regenerar `data/umbrales.js` si cambia el periodo de referencia, la
  delimitación de subcuencas o se corrige el sesgo de CHIRPS.
- Días secos consecutivos y péntadas (Ficha SAAT) deben medirse con pluviómetros comunitarios; su integración queda para
  la siguiente versión, cuando GOAL entregue los datos y el formato (piloto San Francisco).
- Módulo de boletines (web + PDF): pendiente.
