# SAAT Sequías · Cambios v6 (2026-11-23)

Versión de orden y estilo sobre la v5. No cambia el cálculo de índices, umbrales ni nivel técnico, ni la base de datos,
ni el workflow de ingesta. Incluye todos los cambios de la v4.1 y la v5.

## 1. Barra fija con la unidad activa
- Las pestañas y una barra verde oscuro quedan **fijas arriba** al desplazarse, en todas las pestañas.
- La barra muestra de forma destacada qué se está viendo: tipo (municipio completo / subcuenca), nombre, área, fuente,
  fecha del dato, SPEI-3 y la **sirena del nivel de alerta**; a la derecha, los selectores de municipio, unidad y fuente.
- En celular la barra se compacta (nombre + tres selectores en una fila).

## 2. Pestañas reordenadas y fusionadas
Orden: Inicio · Alertas · Mapa y subcuencas · Índices y fuentes · Umbrales · Dashboard · Historial · Metodología.
- **Subcuencas** se integró en **Mapa**: gráfico y tabla de subcuencas debajo del mapa. El gráfico usa el índice y la
  escala elegidos en el mapa (con «Nivel de alerta», CDD o Nivel técnico usa SPEI-3).
- **Comparativa fuentes** se integró en **Índices**: «Comparar fuentes» usa el mismo índice y escala que el análisis.

## 3. Alertas con los íconos del Manual de bolsillo SAAT (GOAL)
- `img/alerta_normal.png`, `alerta_verde.png`, `alerta_amarilla.png`, `alerta_roja.png` (recortados de la lámina de GOAL;
  «sin alerta» es la sirena en gris).
- Pestaña Alertas: (1) los cuatro niveles con su sirena, su umbral SPEI-3, el texto de GOAL y las unidades que están en
  cada uno (clic para seleccionarlas); (2) tarjeta por municipio con sirena, SPEI-3, SPI-3, racha seca, nivel técnico y
  conteo de subcuencas; (3) el desglose por municipio y subcuenca de la v5, con sirenas.
- Corregido el texto pegado «al 15 NovNivel técnico…» en el desglose (cada dato va en su línea).

## 4. Mapa
- Nueva capa **«Nivel de alerta»** (por defecto): subcuencas coloreadas por el semáforo SPEI-3, leyenda con sirenas y una
  sirena por municipio sobre el punto norte de su límite (no tapa las subcuencas).
- **Ficha emergente** (popup) al hacer clic en una subcuenca, en el municipio (zonas sin subcuenca, la sirena o el botón
  «Analizar municipio completo»): nivel de alerta, SPEI y SPI a 3/6/12 meses, racha seca, nivel técnico y botones a
  Resumen, Índices, Umbrales e Historial. Clic en otro municipio lo selecciona. Al pasar el cursor queda un rótulo corto.

## 5. Inicio, avisos y metodología
- Los avisos sobre los datos (cobertura de subcuencas, CHIRPS preliminar, estación seca, fuente) y la ficha técnica de la
  unidad pasan **al pie de todas las pestañas** («Ficha de la unidad y notas sobre los datos»). Arriba solo queda el aviso
  crítico de datos demostrativos.
- Las **Novedades** por versión pasan de Inicio al final de **Metodología**.
- El aviso «Abriste el archivo con doble clic… MODO DEMO» solo aparece si de verdad no se pudieron leer datos (antes salía
  siempre con file://, aunque la app leyera la base de datos en línea).

## Archivos
Modificados: `index.html`, `app.js`, `umbrales_ui.js` (nombres v6). Nuevos: `img/alerta_*.png`, `docs/CAMBIOS_v6.md`.
