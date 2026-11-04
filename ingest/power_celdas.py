#!/usr/bin/env python3
"""
power_celdas.py — NASA POWER diario por CELDA (precipitación + Tmáx + Tmín).
SAAT Sequía v3 · GOAL · HN-M26-53765

POWER usa una rejilla de 0.5° lat × 0.625° lon (MERRA-2); dentro de una celda la API
devuelve la misma serie para cualquier punto (verificado 2026-09-30). Por eso se guarda
UNA serie por celda (power__{lat:.2f}_{lon:.3f}, p.ej. power__14.00_-88.125) y la app la combina con los pesos de área de
cada unidad. La temperatura alimenta el PET (Hargreaves) del SPEI de las tres fuentes.

Uso:  python power_celdas.py --dir ../_trabajo            (siempre descarga 1981 → hoy;
      una llamada por celda, ~1–3 s; API abierta sin llave)
"""
import argparse, datetime as dt, json, time, urllib.request, urllib.error
import numpy as np
import saat_comun as C

START = dt.date(1981, 1, 1)
URL = ('https://power.larc.nasa.gov/api/temporal/daily/point?parameters=PRECTOTCORR,T2M_MAX,T2M_MIN'
       '&community=AG&longitude={lon}&latitude={lat}&start={a}&end={b}&format=JSON')


def doc_id(la, lo):
    return f'power__{la:.2f}_{lo:.3f}'        # id canónico, igual en la web (toFixed)


def fetch(la, lo, today, tries=6):
    url = URL.format(lat=la, lon=lo, a=START.strftime('%Y%m%d'), b=today.strftime('%Y%m%d'))
    for k in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=180) as r:
                return json.load(r)['properties']['parameter']
        except Exception as e:                       # POWER limita la tasa (422/429): esperar
            print(f'   POWER reintento {k+1}/{tries} ({e})', flush=True); time.sleep(10 * (k + 1))
    raise RuntimeError(f'POWER no respondió para la celda {la},{lo}')


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--dir', default=C.SEMILLA)
    args = ap.parse_args()
    units = C.load_units(); today = dt.date.today(); n = (today - START).days + 1
    cells = sorted({(w[0], w[1]) for u in units for w in u['w_power']})
    for la, lo in cells:
        par = fetch(la, lo, today)
        arrs = {}
        for key, name in (('p', 'PRECTOTCORR'), ('tx', 'T2M_MAX'), ('tn', 'T2M_MIN')):
            a = np.full(n, np.nan)
            for k, v in par[name].items():
                if v is None or v <= -900: continue
                i = (dt.date(int(k[:4]), int(k[4:6]), int(k[6:8])) - START).days
                if 0 <= i < n: a[i] = v
            arrs[key] = a
        last = C.ultimo_valido(arrs['p'])
        C.escribir_doc(args.dir, doc_id(la, lo), {
            'fuente': 'power', 'celda': [la, lo], 'desde': START.isoformat(),
            'hasta': (START + dt.timedelta(days=last)).isoformat(), 'n': last + 1,
            'p': C.enc_p(arrs['p'][: last + 1]), 'tx': C.enc_t(arrs['tx'][: last + 1]), 'tn': C.enc_t(arrs['tn'][: last + 1]),
            'producto': 'NASA POWER diario (MERRA-2, celda 0.5°×0.625°): PRECTOTCORR, T2M_MAX, T2M_MIN'})
        print(f'POWER celda {la},{lo}: hasta {START + dt.timedelta(days=last)}', flush=True)
        time.sleep(2)


if __name__ == '__main__':
    main()
