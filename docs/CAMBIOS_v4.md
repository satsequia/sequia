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

---

# v4.1 — Revisión de código (2026-11-15)

Auditoría completa de la web y de la ingesta. No cambian los umbrales ni ningún valor de sequía (índices negativos, SPEI, CDD): con los datos del 4-nov-2026 el
resumen y el historial de las 55 unidades salen idénticos antes y después de los puntos 1–8. El punto 9 corrige el
SPI positivo (lado húmedo).

## Errores corregidos
1. **Cambio de año (motor).** La última fecha con dato se buscaba solo en el año calendario. Del 1 de enero hasta
   que la fuente publicara su primer dato del año nuevo (≈ 2–6 días) la app, el resumen y las alertas quedaban
   sin datos («SPEI-3: —», lluvia 0, −100 %). Ahora la fecha de corte lleva año (`asof = {y, m, d}`) y el año de
   análisis es el del último dato de la fuente activa; la comparativa de fuentes usa la fecha común con su año.
2. **Promedio histórico del CDD en diciembre (motor, `histCDD`).** En diciembre el promedio abr–nov 1991–2020
   recortaba noviembre al día del mes en curso (p. ej. el 2-dic daba 14.5 d en vez de 19.0 d en Cabañas), con lo
   que la racha de la temporada parecía peor frente a su referencia. Noviembre ahora entra completo.
3. **Racha máxima por año en Comparativa (motor, `cddMaxYear`).** Cada fuente llega ahora hasta SU último dato
   (antes se cortaba en la fecha de la fuente activa) y devuelve «sin dato» en vez de 0 si la temporada no ha empezado.
4. **Historial, CSV.** El % de la normal del mes en curso se exportaba contra la normal del mes completo; ahora se
   prorratea al día, igual que en pantalla.
5. **CSV mensual.** Ya no exporta filas de meses futuros que solo traían PET climatológico.
6. **Sin Chart.js (CDN caído).** Historial y clima de referencia ya no se interrumpen: tablas y mapas siguen.
7. **Ingesta CHIRPS (`chirps_zonal.py`).** El caché anual solo se guarda para años completos y con datos (un tramo
   parcial o vacío podía quedar como caché del año entero en una corrida *baseline* local).
8. **Workflow.** El registro de estado hace `git pull --rebase` antes del `push` (no falla si se subieron archivos
   al repositorio durante la corrida).

9. **SPI del lado húmedo (motor, `gammaCdf` en `indices.js` e `indices.py`).** La fracción continua de la Gamma
   incompleta usaba el término −n(n−a) en lugar de −(n−1)(n−1−a). El error solo actúa cuando la lluvia acumulada
   supera la media más el parámetro de escala (SPI ≳ +0.3): ahí el SPI salía sobreestimado, hasta +0.3 en la
   estación lluviosa (p. ej. +0.33 se mostraba como +0.59) y algo más en meses secos. **Los valores negativos no
   cambian**: alertas, umbrales, frecuencias de sequía y catálogo de eventos quedan igual, y el SPEI (log-logística)
   no usa esta función. Con la corrección el caso de prueba pasa de SPI-3 = 1.207540 a **1.136795**, coherente con
   Wilson-Hilferty (1.138642); se verificó contra `scipy.stats.gamma`. En el historial de Cabañas cambia ≈ 30 % de
   los meses (todos con SPI > +0.2). La misma función está en `03_Bloque2_Analisis_Sequia/scripts/indices_motor_v3.py`:
   en la base de datos del Bloque 2 cambia el 34 % de los valores de SPI (ninguno negativo).

10. **Filtro «Postrera» del Historial: agosto–octubre** (antes sep–nov), igual que la ventana de la postrera del
    documento de Umbrales de Alerta Temprana (Bloque 3). Queda pendiente verificarla con los técnicos agrícolas y
    los actores municipales en el taller de diciembre de 2026.

## Revisado y sin cambio
- Ventanas de febrero (28/29 días): la referencia usa el mismo día de corte que el objetivo. Se probó usar el mes
  completo de cada año y desplaza el SPEI-1 de febrero hasta 1 unidad; se conserva el método actual.
- Reglas de Firestore (lectura pública, escritura solo de la ingesta).

## Archivos modificados
`index.html`, `app.js`, `historial_clima.js`, `ingest/indices.js`, `ingest/indices.py`, `ingest/motor_unidades.js`, `ingest/historial.js`,
`ingest/chirps_zonal.py`, `docs/METODOLOGIA_SEQUIA.md`,
`ingest_v3.yml` (→ `.github/workflows/`), `docs/CAMBIOS_v4.md`. Tras subirlos, la corrida diaria regenera el resumen.
