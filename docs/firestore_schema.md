# Modelo de datos · Firestore · SAAT Sequía

Diseñado para **lecturas baratas desde la web**: el frontend lee ~3 documentos
por municipio (una serie mensual por zona) y calcula el SPI en el navegador.
El detalle diario se guarda aparte, solo para análisis de canícula/pentadas.

```
config/app
  spi:        { normal:[-0.5,0.5], verde:-1.0, amarilla:-1.5, roja:-2.0 }
  periodo_referencia: { inicio:1991, fin:2020 }

municipios/{muni}                         ← p.ej. "cabanas"
  id, nombre, departamento, lat, lng, activo
  zonas: [ {id,nombre,rango}, ... ]

municipios/{muni}/series/{zona}           ← "alta" | "media" | "baja"  ★ lo lee la web
  zona, nombre, rango, fuente
  monthly: { "1981-01": 12.3, "1981-02": 8.1, ... }   ← total mensual (mm)
  actualizado

municipios/{muni}/daily/{zona}-{YYYY}     ← detalle diario por zona-año (análisis)
  zona, anio
  values: { "1981-01-01": 0.0, "1981-01-02": 4.2, ... }

municipios/{muni}/spi/{YYYY-MM}           ← opcional (SPI precalculado por zona)
  por_zona: { alta:{spi1,spi3,spi6,spi12}, media:{...}, baja:{...} }

municipios/{muni}/alertas/{YYYY-MM-DD}    ← opcional (bitácora de alertas emitidas)
  nivel, spi, zona, generado
```

## Por qué así
- **`series/{zona}.monthly`** es un solo documento pequeño (~540 números por
  45 años) → el SPI se calcula en el cliente sin miles de lecturas.
- **`daily/{zona}-{YYYY}`** aísla el volumen diario; solo se lee cuando se
  necesita canícula, pentadas o inicio/fin de estación lluviosa.
- La escritura la hace únicamente el **Admin SDK** desde GitHub Actions
  (`ingest/climateserv_chirps.py`), por eso las reglas cierran la escritura
  pública (ver `firestore.rules`).

## Replicación a otros municipios
Añadir `ingest/zones/{muni}.geojson` con las zonas altitudinales, correr
`seed_{muni}.py` (o parametrizar el seed) y disparar el workflow con ese
`municipio`. La web solo necesita marcar `activo:true` en su documento.
