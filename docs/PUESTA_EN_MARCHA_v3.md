# Puesta en marcha · SAAT Sequías v3 (Firestore + actualización diaria)

Tiempo estimado: 20–30 minutos. No requiere instalar nada en la PC.
Autor: M.Sc. Roberto Elías Granados Chahín · Consultoría GOAL HN-M26-53765.

## 0. Antes de empezar

- Proyecto Firebase: **satsequia-3b2a9** (el mismo de v1/v2).
- Secreto de GitHub **FIREBASE_SERVICE_ACCOUNT** (la "llave robot"): ya existe en el
  repositorio `satsequia/sequia`. Si usas un repositorio nuevo, hay que crearlo ahí
  también (Firebase → ⚙ Configuración → Cuentas de servicio → Generar clave privada →
  pegar TODO el contenido del .json en GitHub → Settings → Secrets and variables →
  Actions → New repository secret). Ese .json nunca se sube al repo ni se comparte.
- **Ya no se necesita Earthdata**: IMERG viene de ClimateSERV sin credenciales.

## 1. Subir el código a GitHub

Decisión tuya (las dos funcionan):
- **Mismo repositorio `satsequia/sequia`** → la dirección pública
  `https://satsequia.github.io/sequia/` pasa a mostrar la v3. La v1 sigue guardada en
  tu carpeta (`SAT_Sequia_GOAL_repo`).
- **Repositorio nuevo** (p. ej. `satsequia/saat-v3`) → nueva dirección; hay que crear
  el secreto del paso 0.

Sube **todo el contenido** de `SAT_Sequia_GOAL_v3` (incluida `data/semilla/`).
No hace falta subir `_cache_chirps/` ni `_trabajo/` (están en `.gitignore`).

## 2. Activar la actualización automática

1. En el repositorio crea la carpeta `.github/workflows/` y mueve ahí
   `ingest_v3.yml` (desde la raíz).
2. Si el repositorio tiene el workflow viejo `chirps_ingest.yml` (v1), puedes
   desactivarlo (Actions → el workflow → ⋯ → Disable workflow). La v3 no lo necesita.
3. Settings → Actions → General → **Workflow permissions → Read and write** → Save
   (sirve para guardar el registro diario `data/estado_ingesta.json`).

## 3. Publicar las reglas de Firestore

Firebase → Firestore Database → **Reglas** → pegar el contenido de
`firestore.rules` → **Publicar**. Las reglas v3 conservan las de v1/v2 y añaden
lectura pública de `v3_series` y `v3_meta` (la escritura sigue siendo sólo de la
ingesta).

## 4. Carga inicial de la base de datos

GitHub → **Actions** → *Ingesta diaria SAAT v3 (Firestore)* → **Run workflow**:
1. `modo = semilla` → sube los ≈ 120 documentos preparados (1–2 minutos).
2. Al terminar, otra vez con `modo = incremental` → trae los días más recientes
   (CHIRPS preliminar, IMERG, POWER) y recalcula el resumen (≈ 5–10 minutos).

Desde ese momento corre **solo, todos los días a las 17:17 (hora de Honduras)**.

## 5. Publicar la web

Settings → **Pages** → Source: *Deploy from a branch* → rama `main`, carpeta `/ (root)`
→ Save. En 1–2 minutos queda en línea.

## 6. Verificar

- La insignia superior debe decir **● EN LÍNEA · BASE DE DATOS** (si dice
  *DATOS DE RESPALDO*, Firestore no respondió: revisar el paso 3 o 4).
- En Inicio, la fecha "datos al …" debe estar a pocos días de hoy, con la etiqueta
  **preliminar** si corresponde a CHIRPS preliminar.
- `data/estado_ingesta.json` en el repositorio muestra la última corrida y hasta
  qué fecha llegó cada fuente.

## Mantenimiento

| Situación | Qué hacer |
|---|---|
| Cambian las subcuencas o los límites | Reemplazar los GeoJSON de `geo_fuente/` (EPSG:32616, mismos nombres) y correr el workflow con `rebuild_geo = sí` y `modo = baseline` (1–2 h) |
| Nombres de subcuencas | Llenar `geo_fuente/nombres_subcuencas.csv` y correr `python ingest/build_geo.py` (los códigos no cambian; no hace falta re-descargar) |
| Una corrida falla | Se ve en Actions (ícono rojo). Los datos anteriores no se pierden; la siguiente corrida se pone al día |
| GitHub desactiva el cron | Ocurre si el repo pasa 60 días sin actividad; el registro diario lo evita. Si pasa, Actions → *Enable workflow* |

## Cuotas (plan gratuito Spark, sin tarjeta → sin cobros)

Ingesta ≈ 120 lecturas + 120 escrituras por día; cada visita ≈ 4–5 lecturas (más ≈ 2
por cada subcuenca adicional que se abra). Cuota gratuita diaria: 50 000 lecturas y
20 000 escrituras → margen de varios miles de visitas al día.
