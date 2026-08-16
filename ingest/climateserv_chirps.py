#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ingesta CHIRPS (ClimateSERV) -> Firestore  ·  SAAT Sequía · GOAL
================================================================
Descarga precipitación diaria CHIRPS desde ClimateSERV para cada zona
altitudinal de un municipio, la agrega a totales mensuales, aplica
corrección de sesgo opcional y escribe las series en Firestore.

Fuente de datos:
  CHIRPS diario en ClimateSERV -> DatasetType = 0 ("Daily from 1981 to present")
  Doc paquete: https://climateserv.readthedocs.io/en/latest/api.html
  API paquete: https://climateserv.servirglobal.net/python-api
  Si ClimateSERV cambia el ID del dataset y la descarga viene vacía,
  verificar CHIRPS_DATASET_ID contra la doc vigente.

Uso:
  # Línea base completa desde 1981 (correr una vez):
  python climateserv_chirps.py --municipio cabanas --mode baseline

  # Actualización incremental (últimos N días; para el cron):
  python climateserv_chirps.py --municipio cabanas --mode incremental --days 45

Credenciales Firebase (una de las dos):
  - Variable de entorno GOOGLE_APPLICATION_CREDENTIALS = ruta al JSON de la
    cuenta de servicio, o
  - Variable de entorno FIREBASE_SERVICE_ACCOUNT = contenido JSON (lo usa el
    workflow de GitHub Actions leyendo un secreto).
"""
import argparse
import csv
import datetime as dt
import json
import os
import sys
import tempfile
import time

# --- Config ---------------------------------------------------------------
CHIRPS_DATASET_ID = 0          # CHIRPS diario en ClimateSERV
OPERATION = "Average"          # media zonal sobre el polígono de la zona
CHIRPS_START = dt.date(1981, 1, 1)
MISSING = -9999.0              # valor de "sin dato" de ClimateSERV
CHUNK_YEARS = 2                # trocear peticiones largas (evita timeouts)

HERE = os.path.dirname(os.path.abspath(__file__))
ZONES_DIR = os.path.join(HERE, "zones")


# --- Firestore ------------------------------------------------------------
def get_firestore():
    import firebase_admin
    from firebase_admin import credentials, firestore
    if not firebase_admin._apps:
        sa_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
        if sa_json:
            cred = credentials.Certificate(json.loads(sa_json))
        elif os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
            cred = credentials.Certificate(os.environ["GOOGLE_APPLICATION_CREDENTIALS"])
        else:
            sys.exit("ERROR: define FIREBASE_SERVICE_ACCOUNT o GOOGLE_APPLICATION_CREDENTIALS")
        firebase_admin.initialize_app(cred)
    return firestore.client()


# --- ClimateSERV ----------------------------------------------------------
def fetch_zone_daily(coords, start, end):
    """Descarga CHIRPS diario (media zonal) para un anillo de coordenadas
    [[lon,lat],...] entre dos fechas. Devuelve dict {'YYYY-MM-DD': mm}."""
    import climateserv
    out = {}
    seg_start = start
    while seg_start <= end:
        seg_end = min(dt.date(seg_start.year + CHUNK_YEARS, 1, 1) - dt.timedelta(days=1), end)
        tmp = tempfile.NamedTemporaryFile(suffix=".csv", delete=False).name
        try:
            climateserv.request_data(
                CHIRPS_DATASET_ID, OPERATION,
                seg_start.strftime("%m/%d/%Y"), seg_end.strftime("%m/%d/%Y"),
                coords, "", "", tmp
            )
            out.update(_parse_csv(tmp))
        except Exception as e:  # noqa: BLE001
            print(f"  ! error {seg_start}..{seg_end}: {e}", flush=True)
        finally:
            if os.path.exists(tmp):
                os.remove(tmp)
        print(f"  · {seg_start}..{seg_end}: {len(out)} días acumulados", flush=True)
        seg_start = seg_end + dt.timedelta(days=1)
        time.sleep(1)  # cortesía con el servidor
    return out


def _parse_csv(path):
    """El CSV de ClimateSERV trae fecha (MM/DD/YYYY) y valor. Parseo tolerante."""
    vals = {}
    with open(path, newline="", encoding="utf-8", errors="ignore") as f:
        for row in csv.reader(f):
            if not row:
                continue
            d = _parse_date(row[0])
            if d is None:
                continue
            v = _parse_float(row[1:])
            if v is None or v <= MISSING:
                continue
            vals[d.isoformat()] = round(v, 2)
    return vals


def _parse_date(s):
    s = (s or "").strip()
    for fmt in ("%m/%d/%Y", "%Y-%m-%d"):
        try:
            return dt.datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    return None


def _parse_float(cells):
    for c in cells:
        try:
            return float(str(c).strip())
        except (ValueError, TypeError):
            continue
    return None


# --- Agregación y sesgo ---------------------------------------------------
def to_monthly(daily):
    """dict diario -> dict {'YYYY-MM': total_mm}."""
    monthly = {}
    for d, v in daily.items():
        ym = d[:7]
        monthly[ym] = round(monthly.get(ym, 0.0) + v, 2)
    return monthly


def apply_bias(monthly, factors):
    """Corrección de sesgo por factor multiplicativo mensual (1..12).
    factors = lista de 12 floats (1.0 = sin corrección)."""
    if not factors:
        return monthly
    out = {}
    for ym, v in monthly.items():
        m = int(ym[5:7])
        out[ym] = round(v * factors[m - 1], 2)
    return out


# --- Zonas ----------------------------------------------------------------
def load_zones(municipio):
    path = os.path.join(ZONES_DIR, f"{municipio}.geojson")
    with open(path, encoding="utf-8") as f:
        gj = json.load(f)
    zones = []
    for feat in gj["features"]:
        props = feat.get("properties", {})
        ring = feat["geometry"]["coordinates"][0]  # anillo exterior [[lon,lat],...]
        zones.append({
            "id": props.get("zona", "zona"),
            "nombre": props.get("nombre", props.get("zona", "")),
            "rango": props.get("rango_altitud", ""),
            "bias": props.get("bias_factors"),  # opcional
            "coords": ring,
        })
    return zones


# --- Main -----------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--municipio", default="cabanas")
    ap.add_argument("--mode", choices=["baseline", "incremental"], default="incremental")
    ap.add_argument("--days", type=int, default=45, help="ventana incremental")
    ap.add_argument("--dry-run", action="store_true", help="no escribe en Firestore")
    args = ap.parse_args()

    today = dt.date.today()
    if args.mode == "baseline":
        start = CHIRPS_START
    else:
        start = today - dt.timedelta(days=args.days)
    end = today

    print(f"== {args.municipio} · {args.mode} · {start} -> {end} ==", flush=True)
    zones = load_zones(args.municipio)
    db = None if args.dry_run else get_firestore()

    for z in zones:
        print(f"[{z['id']}] descargando CHIRPS...", flush=True)
        daily = fetch_zone_daily(z["coords"], start, end)
        monthly = apply_bias(to_monthly(daily), z.get("bias"))
        print(f"[{z['id']}] {len(daily)} días -> {len(monthly)} meses", flush=True)
        if args.dry_run:
            continue
        # series/{zona}: merge por clave 'monthly.YYYY-MM' para no borrar histórico
        ref = db.collection("municipios").document(args.municipio) \
                .collection("series").document(z["id"])
        ref.set({"zona": z["id"], "nombre": z["nombre"], "rango": z["rango"]}, merge=True)
        if monthly:
            ref.update({**{f"monthly.{ym}": v for ym, v in monthly.items()},
                        "fuente": "CHIRPS/ClimateSERV",
                        "actualizado": dt.datetime.utcnow().isoformat() + "Z"})
        # daily por año (para canícula / pentadas), un doc por zona-año
        by_year = {}
        for d, v in daily.items():
            by_year.setdefault(d[:4], {})[d] = v
        for yr, vals in by_year.items():
            db.collection("municipios").document(args.municipio) \
              .collection("daily").document(f"{z['id']}-{yr}") \
              .set({"zona": z["id"], "anio": yr, "values": vals}, merge=True)
        print(f"[{z['id']}] escrito en Firestore ✓", flush=True)

    print("Listo.", flush=True)


if __name__ == "__main__":
    main()
