#!/usr/bin/env python3
"""
imerg_climateserv.py — IMERG V07 LATE diario promediado por POLÍGONO, vía ClimateSERV.
SAAT Sequía v3 · GOAL · HN-M26-53765

Por qué ClimateSERV y no Earthdata
  ClimateSERV (NASA SERVIR) sirve IMERG SIN credenciales. Verificado 2026-10-12:
    226 = IMERG V07 Late  (diario, ~2000-06 → ayer)   ← se usa éste
    227 = IMERG V07 Early (diario)
    26 / 91 = IMERG V06 Late/Early → ya no devuelven datos (V06 descontinuado)
  (Hallazgo traído del proyecto La Esperanza y re-verificado aquí.)
  La operación "NetCDF" devuelve la REJILLA 0.1° del recorte, así que el promedio por
  polígono se hace aquí con pesos de área (igual que CHIRPS), y no depende de cómo
  ClimateSERV recorta polígonos pequeños.

Uso
  python imerg_climateserv.py --mode baseline    --dir ../data/semilla   # 2000-06 → ayer (≈15–30 min)
  python imerg_climateserv.py --mode incremental --dir ../_trabajo --days 60

Salida: imerg__{unidad}.json en --dir (formato de saat_comun.py).
Nota metodológica: IMERG empieza en 2000 → su periodo de referencia para SPI/SPEI es
2001–2020 (20 años), más corto que el 1991–2020 de CHIRPS. La app lo indica.
"""
import argparse, datetime as dt, glob, json, os, sys, tempfile, time, zipfile
import numpy as np
import saat_comun as C

DATASET = 226
START = dt.date(2000, 6, 1)
PRODUCTO = 'IMERG V07 Late diario 0.1° (NASA GPM) vía ClimateSERV (id 226) · promedio ponderado por área'


def fetch_imerg(d0, d1, bb, tries=4):
    """Rejilla IMERG del bbox entre d0 y d1 → (dates, Y, X, arr mm/día)."""
    import climateserv.api as A, xarray as xr
    ring = [[bb[0], bb[2]], [bb[1], bb[2]], [bb[1], bb[3]], [bb[0], bb[3]], [bb[0], bb[2]]]
    for k in range(tries):
        tmp = tempfile.mkdtemp(); zp = os.path.join(tmp, 'imerg.zip')
        try:
            A.request_data(DATASET, 'NetCDF', d0.strftime('%m/%d/%Y'), d1.strftime('%m/%d/%Y'),
                           json.dumps(ring), '', '', zp)
            with zipfile.ZipFile(zp) as z:
                z.extractall(tmp)
            nc = sorted(glob.glob(os.path.join(tmp, '*.nc')))[0]
            ds = xr.open_dataset(nc)
            v = 'precipitation_amount' if 'precipitation_amount' in ds else list(ds.data_vars)[0]
            dates = [dt.date.fromisoformat(str(t)[:10]) for t in ds['time'].values]
            arr = ds[v].transpose('time', 'latitude', 'longitude').values.astype('float64')
            arr[(arr < 0) | (arr > 2000)] = np.nan
            return dates, ds['latitude'].values.astype('float64'), ds['longitude'].values.astype('float64'), arr
        except Exception as e:
            print(f'   ClimateSERV reintento {k+1}/{tries} ({e})', flush=True); time.sleep(15 * (k + 1))
    raise RuntimeError(f'ClimateSERV no entregó IMERG {d0}..{d1}')


def zonal(units, dates, Y, X, arr):
    out = {}
    for u in units:
        acc = np.zeros(len(dates)); ws = np.zeros(len(dates))
        for la, lo, w in u['w_imerg']:
            i = int(np.argmin(np.abs(Y - la))); j = int(np.argmin(np.abs(X - lo)))
            if abs(Y[i] - la) > 0.02 or abs(X[j] - lo) > 0.02:
                raise RuntimeError(f'celda IMERG {la},{lo} fuera del recorte')
            v = arr[:, i, j]; ok = np.isfinite(v)
            acc[ok] += w * v[ok]; ws[ok] += w
        out[u['id']] = np.where(ws > 0.5, acc / np.where(ws > 0, ws, 1), np.nan)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--mode', choices=['baseline', 'incremental'], default='incremental')
    ap.add_argument('--days', type=int, default=60)
    ap.add_argument('--dir', default=C.SEMILLA)
    ap.add_argument('--chunk-days', type=int, default=366)
    args = ap.parse_args()

    units = C.load_units(); bb = C.bbox_de(units, 'w_imerg', 0.08)
    today = dt.date.today(); n = (today - START).days + 1
    full = {u['id']: np.full(n, np.nan) for u in units}
    if args.mode == 'incremental':
        for u in units:
            doc = C.leer_doc(args.dir, 'imerg__' + u['id'])
            if not doc:
                sys.exit(f'Falta imerg__{u["id"]} en {args.dir}: corre --mode baseline o firestore_sync.py bajar')
            full[u['id']] = C.serie_de_doc(doc, START, n)
        d = today - dt.timedelta(days=args.days)
    else:
        d = START
    while d <= today:
        d1 = min(d + dt.timedelta(days=args.chunk_days - 1), today)
        t0 = time.time()
        dates, Y, X, arr = fetch_imerg(d, d1, bb)
        z = zonal(units, dates, Y, X, arr)
        for k, dd in enumerate(dates):
            i = (dd - START).days
            if 0 <= i < n:
                for uid in full:
                    if np.isfinite(z[uid][k]):
                        full[uid][i] = z[uid][k]
        print(f'IMERG {d}..{d1}: {len(dates)} días en {time.time()-t0:.0f}s', flush=True)
        d = d1 + dt.timedelta(days=1)

    # Reparar huecos (ClimateSERV a veces omite días en peticiones largas): se
    # vuelve a pedir cada tramo faltante por separado. Los días que el propio
    # archivo IMERG no tiene quedan como "sin dato" (la app los ignora).
    anyu = units[0]['id']
    lastv = C.ultimo_valido(full[anyu])
    first = int(np.argmax(np.isfinite(full[anyu])))
    desde_rep = first if args.mode == 'baseline' else max(first, (today - dt.timedelta(days=args.days) - START).days)
    gaps = [i for i in range(desde_rep, lastv + 1) if not np.isfinite(full[anyu][i])]
    if gaps:
        runs, cur = [], [gaps[0]]
        for i in gaps[1:]:
            if i == cur[-1] + 1: cur.append(i)
            else: runs.append(cur); cur = [i]
        runs.append(cur)
        print(f'Reparando {len(gaps)} días en {len(runs)} tramos…', flush=True)
        for r in runs:
            d0 = START + dt.timedelta(days=r[0]); d1 = START + dt.timedelta(days=r[-1])
            try:
                dates, Y, X, arr = fetch_imerg(d0, d1, bb, tries=2)
            except Exception as e:
                print(f'   sin dato en la fuente {d0}..{d1}'); continue
            z = zonal(units, dates, Y, X, arr)
            for k, dd in enumerate(dates):
                i = (dd - START).days
                for uid in full:
                    if np.isfinite(z[uid][k]): full[uid][i] = z[uid][k]
    last = max(i for i in range(n) if all(np.isfinite(full[u][i]) for u in full))
    hasta = START + dt.timedelta(days=last)
    huecos = int(sum(1 for i in range(first, last + 1) if not np.isfinite(full[anyu][i])))
    for u in units:
        C.escribir_doc(args.dir, 'imerg__' + u['id'], {
            'fuente': 'imerg', 'unidad': u['id'], 'desde': START.isoformat(), 'hasta': hasta.isoformat(),
            'n': last + 1, 'p': C.enc_p(full[u['id']][: last + 1]), 'producto': PRODUCTO})
    print(f'IMERG por unidad: {len(units)} documentos · {START} → {hasta} · días sin dato: {huecos}')


if __name__ == '__main__':
    main()
