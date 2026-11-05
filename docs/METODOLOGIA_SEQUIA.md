# Metodología de índices de sequía · SAAT Sequía v3 · GOAL

Consultoría **HN-M26-53765** — Fortalecimiento de SAAT ante sequías, Corredor Seco
(municipios Cabañas y Marcala, La Paz; San Francisco, Lempira). Cliente: GOAL
(proyecto ICSP, apoyo Irish Aid).

Este documento describe y **valida contra documentación oficial** la metodología de
los tres índices integrados en la herramienta: **SPI**, **SPEI** y **CDD**, con
tres fuentes comparativas de precipitación. Validación de índices: **2026-09-14**.
**v3 (2026-09-30):** el cálculo pasa de un punto a **polígonos** (municipio completo y
subcuencas con influencia) — ver sección 0 y `docs/UNIDADES_ANALISIS.md`.

---

## 0. Arquitectura de datos (v3, 2026-10-12)

GitHub Actions descarga **a diario** CHIRPS (final + preliminar), IMERG V07 Late y NASA
POWER, calcula las series por polígono y las guarda en **Firestore** (`v3_series`, un
documento por fuente y unidad, serie diaria comprimida). Con el mismo código de la web
(`ingest/motor_unidades.js`) precalcula `v3_meta/resumen` (SPEI-3, SPI-3, CDD actuales de
todas las unidades), que la web lee en una sola consulta. La web lee además la serie de la
unidad abierta y calcula en el navegador todas las escalas y gráficos.

## 0.1 Unidades de análisis por polígono (v3)

- **Polígonos.** Límites municipales oficiales (COD_MUNI 1203 Cabañas, 1208 Marcala,
  1317 San Francisco) y subcuencas con influencia delimitadas en ArcGIS Pro
  (`Sequia_GOAL.aprx`), exportadas en **UTM 16N (EPSG:32616)**. `ingest/build_geo.py`
  las repara (`make_valid`), calcula áreas en UTM y las reproyecta a **WGS84**.
- **Promedio areal ponderado.** Para una unidad U y un píxel i de la fuente:
  `w_i = área(píxel_i ∩ U) / área(U)`, con `Σ w_i = 1`. La lluvia diaria de U es
  `P_U(t) = Σ w_i · P_i(t)`. Se exige dato en ≥ 50 % del área para aceptar el día.
  Así un polígono pequeño toma el valor del píxel que lo contiene y uno grande integra
  todos los que cubre (método estándar de estadística zonal ponderada por área).
- **Índices sobre la serie areal.** SPI, SPEI y CDD se calculan sobre `P_U(t)` (no se
  promedian índices de píxeles), lo cual es coherente con la definición de cada índice.
- **Resolución efectiva.** Se reporta `píxeles efectivos = 1 / Σ w_i²`. Con valores
  ≈ 1 la unidad es menor que un píxel CHIRPS (≈ 29 km²) y su serie es casi idéntica a
  la de sus vecinas: las diferencias entre subcuencas pequeñas **no son físicas**.
- **IMERG.** Rejilla 0.1° (bordes en múltiplos de 0.1°); mismos pesos de área.
- **Huecos.** Un mes con más del 10 % de días sin dato no se usa en los acumulados (el
  índice queda "sin dato" en las ventanas que lo incluyen); con ≤ 10 % se prorratea.
- **NASA POWER.** Rejilla MERRA-2 de 0.5° lat × 0.625° lon (bordes en lat k·0.5+0.25 y
  lon k·0.625+0.3125), **verificada empíricamente** contra la API el 2026-09-30
  (puntos a ambos lados de cada borde devuelven series distintas; dentro de la celda,
  idénticas). Se consulta el **centro** de cada celda y se combinan con los mismos
  pesos de área. **Los tres municipios caen en la misma celda (14.0°N, −88.125°)**:
  POWER no distingue entre municipios ni entre la mayoría de subcuencas.
- **Temperatura / PET.** Tmáx/Tmín POWER ponderadas por área; Ra con la latitud del
  centroide de la unidad. Sin corrección altitudinal (pendiente: gradiente con DEM).
  Como el SPEI se estandariza contra la propia historia de la unidad, un sesgo
  térmico aproximadamente constante afecta poco al índice (inferencia, no verificado).


---

## 1. SPI — Índice de Precipitación Estandarizado

- **Definición.** McKee, Doesken & Kleist (1993). Mide cuántas desviaciones
  estándar se aparta la precipitación acumulada respecto a su valor esperado en un
  periodo de referencia.
- **Cálculo.** Se acumula la precipitación en la escala elegida (1, 3, 6, 12 meses),
  se ajusta una distribución **Gamma** (método de momentos) al periodo de referencia
  **1991–2020** y se estandariza a la normal: `SPI = Φ⁻¹(F_Gamma(x))`, con un ajuste
  para la probabilidad de cero (meses sin lluvia).
- **Verificación.** Se conserva además la aproximación **Wilson–Hilferty** (raíz
  cúbica) como contraste del ajuste Gamma.

## 2. SPEI — Índice Estandarizado de Precipitación-Evapotranspiración

- **Definición.** Vicente-Serrano, Beguería & López-Moreno (2010, *Journal of
  Climate*). Igual que el SPI pero sobre el **balance hídrico climático**
  `D = P − PET`, de modo que incorpora el efecto de la **temperatura / demanda
  evaporativa** — algo que el SPI no captura.
- **Distribución.** Los autores usan la **log-logística de 3 parámetros**, ajustada
  por **Momentos Ponderados por Probabilidad (PWM)**. Recomiendan PWM porque mantiene
  la desviación estándar consistente entre escalas y resuelve la no-convergencia del
  modelo en algunas regiones (confirmado en spei.csic.es y Climate Data Guide/UCAR).
- **Estandarización.** `SPEI = Φ⁻¹(F_loglog(D))` (inversa de la CDF normal aplicada a
  la CDF log-logística). Equivale a la aproximación racional de Abramowitz–Stegun del
  método original, pero sin ambigüedad de signo. Valores acotados a [−3, 3].
- **Ajuste PWM (implementado y validado).** PWM tipo-α, `w_s = media[(1−F)^s · x]`
  con posición de trazado `F=(i−0.35)/n` y `x` ascendente; parámetros
  `β=(2w₁−w₀)/(6w₁−w₀−6w₂)`, `α=(w₀−2w₁)β/[Γ(1+1/β)Γ(1−1/β)]`,
  `γ=w₀−αΓ(1+1/β)Γ(1−1/β)`. Requiere `β>1` (asimetría positiva de D); si la serie es
  casi simétrica o de asimetría negativa, el índice devuelve "sin dato suficiente"
  en lugar de un valor espurio.

### PET — Evapotranspiración potencial
- **Método base: Hargreaves.** `PET = 0.0023 · Ra · (Tmedia + 17.8) · √(Tmáx − Tmín)`,
  con **Ra** (radiación extraterrestre) calculada analíticamente por latitud y día del
  año (FAO-56, ec. 21) — no depende de la fuente de datos.
- **Temperatura.** De **NASA POWER** (T2M_MAX, T2M_MIN), única fuente de temperatura
  del sistema.
- **Refinamiento.** FAO-56 **Penman-Monteith** es una mejora posible (POWER entrega
  todas las variables); **Thornthwaite** es el piso mínimo. Los autores subrayan que
  el SPEI **no está ligado** a un único método de PET.
- **Advertencia.** El SPEI es sensible al método de PET, especialmente en clima
  **semiárido** (Corredor Seco). Se documenta el método (Hargreaves) y el periodo de
  referencia (1991–2020).

## 3. CDD — Días Secos Consecutivos

- **Definición.** OMM / **ETCCDI** (índice #16, *climdex*): **máximo número de días
  consecutivos con precipitación < 1 mm**.
- **Indicadores calculados:**
  - **Racha seca actual** (racha vigente al último día con dato) y **racha máxima
    del año** con sus fechas de inicio y fin.
  - **Promedio histórico** de la racha máxima de la **temporada lluviosa Abr–Nov**
    (1991–2020) — se arranca en abril para no inflar el promedio con la larga
    estación seca; se reporta desviación vs. promedio, **máx. histórico** y
    **percentil 90**.
  - **Racha máx. promedio del mes en curso** (histórico mes completo).
  - **Días secos / lluviosos** del mes en curso vs. promedio histórico del mes.
  - **Mapa de días** (heatmap rojo=seco / verde=lluvia) con la racha actual
    resaltada.
- Umbral de día seco: < 1 mm. Se calcula por cada una de las tres fuentes.

---

## 4. Umbrales de alerta (McKee 1993 — **idénticos para SPI y SPEI**)

Como SPI y SPEI se estandarizan ambos a media 0 y desviación 1, **comparten la misma
tabla de clasificación** (confirmado con AgriMetSoft citando McKee 1993 y Paulo et al.
2012, y con la propia literatura del SPEI). **No existen umbrales distintos para el
SPEI.**

| Valor del índice | Categoría | Alerta SAAT |
|---|---|---|
| ≥ 2.0 | Extremadamente húmedo | — |
| 1.5 a 2.0 | Muy húmedo | — |
| 1.0 a 1.5 | Moderadamente húmedo | — |
| −1.0 a 1.0 | Condiciones normales | Normal |
| −1.0 a −1.5 | Sequía moderada | **VERDE** (≤ −1.0) |
| −1.5 a −2.0 | Sequía severa | **AMARILLA** (≤ −1.5) |
| ≤ −2.0 | Sequía extrema | **ROJA** (≤ −2.0) |

---

## 5. Fuentes de precipitación (tres, comparativas)

| Fuente | Rol | Acceso | Rezago |
|---|---|---|---|
| **CHIRPS v2.0** (CHC/UCSB) | Línea base histórica 1981– y referencia de estandarización. **Siempre se mantiene.** | FINAL: COG diarios de CHC + IRIDL (días recientes). PRELIMINAR: CHC `prelim/global_daily/fixed` (suma exacta a la péntada) para los días posteriores al último final; se sustituye automáticamente al publicarse el final. Sin llave. | Final ≈ 4–6 semanas · Preliminar ≈ 2–5 días |
| **NASA POWER** | Fuente diaria abierta + **temperatura para el PET (SPEI)**. Resolución gruesa (celda ≈ 55 × 68 km). | API sin llave; la ingesta diaria guarda cada celda en Firestore | ≈ 2–3 días |
| **IMERG V07 Late (GPM)** | Comparativa satélite casi en tiempo real, 0.1°. Serie desde jun-2000 → **referencia SPI/SPEI 2001–2020** (20 años). | **ClimateSERV, dataset 226, sin credenciales** (verificado 2026-10-12; 227 = V07 Early; 26/91 = V06, ya sin datos). Se descarga la rejilla (operación NetCDF) y el promedio por polígono se hace con pesos de área. | ≈ 1 día |

**Diseño comparativo:** `SPEI(fuente) = estandarizar(P_fuente − PET_común)`, con PET
común (temperatura POWER). Así las diferencias entre las tres curvas del SPEI reflejan
el efecto de la **fuente de precipitación**, manteniendo constante la demanda
evaporativa.

> Google Earth Engine se descartó para el uso operativo-institucional (su uso gratuito
> quedó reservado a investigación/educación). IMERG se toma de **ClimateSERV** (NASA
> SERVIR), que lo sirve sin credenciales — ya no se requiere Earthdata.

---

## 6. Validación numérica del motor

El motor del navegador (`ingest/indices.js`) se validó contra la implementación de
referencia en Python (`ingest/indices.py`) sobre una serie sintética determinista de
30 años (lat 14.05°, escala 3 meses). **Coincidencia exacta a 6 decimales:**

| Cantidad | Python (referencia) | JavaScript (navegador) |
|---|---|---|
| SPEI-3 | 1.171871 | 1.171871 |
| SPI-3 (Gamma) | 1.207540 | 1.207540 |
| SPI-3 (Wilson-Hilferty) | 1.138642 | 1.138642 |
| PET julio (mm) | 163.7474 | 163.7474 |
| Ra medio julio (mm/día) | 15.5361 | 15.5361 |
| CDD | 30 | 30 |

El ajuste log-logística por PWM se validó adicionalmente contra
`scipy.stats.fisk` (recupera parámetros conocidos: α, β, γ).

---

## 7. Referencias

- McKee, T.B., Doesken, N.J., Kleist, J. (1993). *The relationship of drought
  frequency and duration to time scales.* 8th Conf. on Applied Climatology.
- Vicente-Serrano, S.M., Beguería, S., López-Moreno, J.I. (2010). *A Multiscalar
  Drought Index Sensitive to Global Warming: The SPEI.* Journal of Climate, 23(7).
- spei.csic.es — sitio oficial del SPEI (CSIC).
- Climate Data Guide, UCAR/NCAR — *Standardized Precipitation Evapotranspiration
  Index (SPEI)*.
- ETCCDI / climdex — definición del índice CDD (#16).
- Funk, C. et al. (2015). *The climate hazards infrared precipitation with stations —
  a new environmental record for monitoring extremes.* Scientific Data, 2, 150066.
- Allen et al. (1998). *FAO-56 Crop Evapotranspiration* (Ra, Hargreaves,
  Penman-Monteith).
