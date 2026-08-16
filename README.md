# SAAT Sequía · Corredor Seco de Honduras

Sistema de Alerta Anticipada Temprana (SAAT) ante sequías para los municipios
de **Cabañas**, **Marcala** (La Paz) y **San Francisco** (Lempira).
Consultoría **GOAL** — Proyecto ICSP (apoyo Irish Aid) · Ref. HN-M26-53158.

Herramienta de código abierto: **web estática (GitHub Pages) + Firebase/Firestore
+ GitHub Actions** que descarga CHIRPS (ClimateSERV), calcula el SPI y muestra
un semáforo de alerta. Piloto: **Cabañas**.

- **Repositorio:** https://github.com/satsequia/sequia
- **Web (GitHub Pages):** https://satsequia.github.io/sequia/
- **Proyecto Firebase:** `satsequia-3b2a9` (ya configurado en `index.html`)

## Arquitectura
```
GitHub Actions (cron)  →  Firestore  →  Web (GitHub Pages)  →  Usuario
  descarga CHIRPS          series por      lee series,           semáforo,
  por zona altitudinal     zona/mensual    calcula SPI           reportes
```

## Estructura
```
index.html                         App (GitHub Pages sirve desde la raíz)
ingest/climateserv_chirps.py       Descarga CHIRPS → Firestore
ingest/seed_cabanas.py             Metadatos del municipio + umbrales
ingest/zones/cabanas.geojson       Zonas altitudinales (PLACEHOLDER)
.github/workflows/chirps_ingest.yml  Cron semanal + ejecución manual
firestore.rules                    Reglas de seguridad
docs/firestore_schema.md           Modelo de datos
```

## Puesta en marcha

### 1. Firebase
1. En el proyecto `satsequia-3b2a9`: activar **Firestore Database** (modo Native)
   y **Authentication** (habilitar proveedores: Anónimo + Correo/contraseña).
2. El **config web** ya está pegado en `index.html` (no es secreto; va en el
   cliente). No hay que hacer nada aquí salvo confirmar que Firestore existe.
3. Publicar `firestore.rules`:
   `firebase deploy --only firestore:rules` (o pegarlas en la consola de
   Firestore → pestaña Reglas → Publicar).

### 2. Cuenta de servicio (la "llave robot" para la ingesta)
Es una llave que le permite a **GitHub Actions** escribir en Firestore por su
cuenta (sin que un humano inicie sesión). Se genera así:
1. Firebase → ⚙️ **Configuración del proyecto** → pestaña **Cuentas de servicio**
   → botón **Generar nueva clave privada** → se descarga un archivo **.json**.
2. En GitHub: repo `satsequia/sequia` → **Settings** → **Secrets and variables**
   → **Actions** → **New repository secret**.
   - Name: `FIREBASE_SERVICE_ACCOUNT`
   - Secret: **pega TODO el contenido del archivo .json**.
3. Guardar. Listo: el workflow ya puede subir datos solo.
   ⚠️ Ese .json es secreto (equivale a una contraseña). No se sube al repo ni se
   comparte por chat/correo. Si se filtra, se revoca desde la misma pantalla.

### 3. Datos
```bash
cd ingest
pip install -r requirements.txt
export FIREBASE_SERVICE_ACCOUNT="$(cat ruta/al/serviceAccount.json)"
python seed_cabanas.py                                   # metadatos + umbrales
python climateserv_chirps.py --municipio cabanas --mode baseline   # línea base 1981→hoy (tarda)
```
> La línea base descarga ~45 años diarios por zona; puede tomar tiempo. Después,
> el workflow corre solo cada lunes en modo incremental.

### 4. Web (GitHub Pages)
1. `index.html` ya está en la raíz del repo.
2. GitHub → repo → **Settings** → **Pages** → Source = **Deploy from a branch**,
   rama `main`, carpeta **/ (root)** → Save.
3. En 1–2 min queda publicada en **https://satsequia.github.io/sequia/**.

## Pendiente (carril SIG)
`ingest/zones/cabanas.geojson` son polígonos **provisionales**. Sustituir por la
delimitación real de cuenca/subcuenca y zonificación altitudinal (DEM SRTM 30 m).

## Notas técnicas
- CHIRPS diario en ClimateSERV = `DatasetType 0`. Si la descarga viene vacía,
  verificar el ID contra https://climateserv.readthedocs.io/en/latest/api.html
- SPI: ajuste Gamma + aproximación Wilson-Hilferty, referencia 1991–2020
  (método del boletín SIMGER).
- Corrección de sesgo: factor multiplicativo mensual por zona
  (`bias_factors` en el GeoJSON), a calibrar con estaciones (La Esperanza,
  Marcala, Erandique).
