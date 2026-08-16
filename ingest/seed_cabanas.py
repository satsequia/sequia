#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Crea/actualiza los metadatos del municipio piloto (Cabañas) y la config
global de umbrales en Firestore. Correr una vez tras configurar credenciales."""
import datetime as dt
from climateserv_chirps import get_firestore, load_zones

MUNI = "cabanas"
META = {"id": "cabanas", "nombre": "Cabañas", "departamento": "La Paz",
        "lat": 14.05, "lng": -87.90, "activo": True}

UMBRALES = {  # semáforo SAAT (SPI) del TDR — editable por el admin
    "spi": {"normal": [-0.5, 0.5], "verde": -1.0, "amarilla": -1.5, "roja": -2.0},
    "periodo_referencia": {"inicio": 1991, "fin": 2020},
}


def main():
    db = get_firestore()
    zonas = [{"id": z["id"], "nombre": z["nombre"], "rango": z["rango"]}
             for z in load_zones(MUNI)]
    db.collection("municipios").document(MUNI).set(
        {**META, "zonas": zonas,
         "actualizado": dt.datetime.utcnow().isoformat() + "Z"}, merge=True)
    db.collection("config").document("app").set(
        {**UMBRALES, "actualizado": dt.datetime.utcnow().isoformat() + "Z"}, merge=True)
    print(f"Seed OK: municipio '{MUNI}' con {len(zonas)} zonas + config/app")


if __name__ == "__main__":
    main()
