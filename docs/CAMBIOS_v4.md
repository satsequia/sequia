# SAAT Sequía v4 — Cambios (2026-11-05)

Consultoría HN-M26-53765 · GOAL / ICSP / Irish Aid · M.Sc. Roberto Elías Granados Chahín

## 1. Pestaña Historial (nueva)

Responde a la solicitud de GOAL (reunión del 4-nov-2026) de una vista histórica por municipio y subcuenca para
validar con los actores municipales antes del taller de diciembre.

- **Indicadores:** SPEI y SPI de 1, 3, 6 y 12 meses; racha seca más larga del mes (CDD, P < 1 mm); lluvia del mes en %
  de su normal 1991–2020. Fuente: CHIRPS v2.0 (oficial del SAAT).
- **Filtros combinables:** rango de años (con atajos Todo, 1991–2020, últimos 10/20); meses libres o por época
  (estación lluviosa may–oct, primera may–jul, canícula jul–ago, postrera sep–nov, estación seca dic–abr);
  severidad (≤ −1.0 / −1.5 / −2.0; ≥ 5/10/15 d; ≤ 75/50/25 %); fase ENOS del mes (ONI ≥ +0.5 El Niño, ≤ −0.5 La Niña).
- **Salidas:** indicadores de frecuencia; tabla de color año × mes; serie mensual con ONI; comparación de hasta 6 años
  (clic en el año de la tabla); ranking de años más secos; catálogo de eventos (McKee et al., 1993: índice < 0 que llega a
  ≤ −1.0; magnitud = suma de |índice|); canícula y estación lluviosa por año (Bloque 2, pasos 9 y 10); CSV de lo filtrado.
- **Avisos automáticos** cuando el filtro incluye la estación seca (escalas de 1–3 meses y % de lluvia referenciales).

### Datos
- `ingest/historial.js` (nuevo) corre en la ingesta diaria después de `resumen.js` y escribe
  `v3_series/hist__{unidad}` (55 documentos, ≈ 28 KB c/u) y `v3_series/hist__oni` (ONI NOAA-CPC; si la descarga
  falla se conserva el anterior). Usa el motor de la app y verifica en cada corrida que sus valores coinciden con
  `spiAt`/`speiAt` (si no coinciden, la corrida falla).
- La web lee **1 documento por unidad** al abrir la pestaña (más 1 para el ONI). Respaldo: `data/semilla/hist__*.json`.
- Comprobación con el Bloque 2 (Cabañas, sep-2026): P 276 mm, SPI-3 −2.43, SPEI-3 −2.22, SPEI-12 −2.16 = Tabla 15 del informe.
- No requiere cambiar `firestore.rules` (se usa la colección `v3_series`, de lectura pública).

## 2. Dashboard: clima de referencia (nuevo)

- Tarjetas: lluvia anual normal, % de mayo a octubre, CV, temperatura media/máx./mín., meses más cálido y fresco,
  elevación, estación lluviosa y canícula normales, tendencia de la lluvia anual (Sen, Mann-Kendall).
- Climograma 1991–2020 (lluvia + Tmáx/Tmed/Tmín), lluvia anual 1981–2025 con años ENOS, tabla comparativa de municipios.
- **Mapa por subcuenca** del municipio (lluvia anual, % may–oct, Tmáx, Tmed, Tmín) en escala de color común a los tres
  municipios; leyenda fuera del mapa; clic → ventana con los valores y botón para analizar la subcuenca.
- Datos estáticos: `data/clima_ref.js` (`03_Bloque2_Analisis_Sequia/scripts/b2_13_clima_ref_app.py`) y
  `data/canicula_hist.js` (`b2_14_canicula_app.py`). Temperatura = NASA POWER − 0.0065 · (z_unidad − 927 m), igual que
  la Tabla 13 del Bloque 1 (se reproducen sus valores). Las diferencias de temperatura entre subcuencas provienen
  solo de la elevación: POWER (0.5°) no distingue subcuencas vecinas.

## 3. Otros
- Se retiraron las referencias a sistemas externos en textos, leyendas y comentarios (app, motor, documentación).
- Versión visible: v4. Los nombres de colecciones (`v3_series`, `v3_meta`) no cambian.

## 4. Pendiente (v5)
- Pluviómetros comunitarios (piloto San Francisco) cuando GOAL entregue los datos y el formato.
