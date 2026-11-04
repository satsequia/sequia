#!/usr/bin/env python3
"""
chirps_zonal.py — CHIRPS diario promediado por POLÍGONO (municipio y subcuencas).
SAAT Sequía v3 · GOAL · HN-M26-53765

Qué hace
  1. CHIRPS v2.0 FINAL diario (0.05°) SOLO del rectángulo que cubre las unidades:
     COG diarios de CHC/UCSB (lectura por ventana, en paralelo) y, para los días
     finales que aún no tienen COG, el IRI Data Library (IRIDL).
  2. CHIRPS PRELIMINAR diario (CHC, carpeta prelim/global_daily/fixed: suma exacta a
     la péntada) para los días posteriores al último FINAL. Latencia ≈ 2–5 días.
     Cuando llega el FINAL, sustituye automáticamente al preliminar.
  3. Para cada unidad de data/unidades.json calcula la lluvia diaria como PROMEDIO
     PONDERADO POR ÁREA de los píxeles que toca (pesos de build_geo.py).
  4. Escribe un documento por unidad, chirps__{unidad}.json, en --dir (formato de
     saat_comun.py). firestore_sync.py los sube a Firestore (colección v3_series).

Uso
  python chirps_zonal.py --mode baseline   --dir ../data/semilla      # 1981 → hoy
  python chirps_zonal.py --mode incremental --dir ../_trabajo --days 150

Fuente: CHIRPS v2.0 (Funk et al., 2015). IRIDL:
  SOURCES/.UCSB/.CHIRPS/.v2p0/.daily-improved/.global/.0p05/.prcp
  (validado 2026-09-30: idéntico a los COG de CHC y a ClimateSERV).
  El eje T de IRIDL es día juliano (mediodía): fecha = JD − 2440587.5 días desde 1970-01-01.
"""
import argparse, base64, datetime as dt, json, os, sys, time, urllib.request, urllib.error
import numpy as np
import saat_comun as C

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, 'data')
START = dt.date(1981, 1, 1)
MISSING = 65535
IRIDL = ('https://iridl.ldeo.columbia.edu/SOURCES/.UCSB/.CHIRPS/.v2p0/.daily-improved/'
         '.global/.0p05/.prcp/X/{x0}/{x1}/RANGEEDGES/Y/{y0}/{y1}/RANGEEDGES/'
         'T/({d0})/({d1})/RANGEEDGES/data.nc')
PRELIM = ('https://data.chc.ucsb.edu/products/CHIRPS/v2.0/prelim/global_daily/fixed/tifs/'
          '{y}/chirps-v2.0.{y}.{m:02d}.{d:02d}.tif.gz')
MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']


def iridl_date(d):
    return f'{d.day}%20{MON[d.month-1]}%20{d.year}'


def load_units():
    return json.load(open(os.path.join(DATA, 'unidades.json'), encoding='utf-8'))['unidades']


def bbox(units, pad=0.05):
    lats = [w[0] for u in units for w in u['w_chirps']]; lons = [w[1] for u in units for w in u['w_chirps']]
    return (round(min(lons) - pad, 3), round(max(lons) + pad, 3), round(min(lats) - pad, 3), round(max(lats) + pad, 3))


_IRIDL_LAST = {}


def iridl_last():
    """Último día disponible de CHIRPS FINAL en IRIDL (pedir más allá devuelve error 404)."""
    if 'd' not in _IRIDL_LAST:
        url = ('https://iridl.ldeo.columbia.edu/SOURCES/.UCSB/.CHIRPS/.v2p0/.daily-improved/'
               '.global/.0p05/.prcp/T/last/VALUE/T/data.ch')
        try:
            with urllib.request.urlopen(url, timeout=120) as r:
                jd = float(r.read().decode().split()[0])
            _IRIDL_LAST['d'] = dt.date(1970, 1, 1) + dt.timedelta(days=int(np.floor(jd - 2440587.5)))
            print(f'   IRIDL tiene FINAL hasta {_IRIDL_LAST["d"]}', flush=True)
        except Exception as e:
            print(f'   (IRIDL: no se pudo leer la última fecha: {e})', flush=True)
            _IRIDL_LAST['d'] = None
    return _IRIDL_LAST['d']


def fetch_nc(d0, d1, bb, tries=4):
    """IRIDL: recorte bbox × [d0,d1] en NetCDF. Útil para los días recientes que
    aún no tienen COG. Devuelve (dates, Y, X, arr)."""
    import tempfile
    url = IRIDL.format(x0=bb[0], x1=bb[1], y0=bb[2], y1=bb[3], d0=iridl_date(d0), d1=iridl_date(d1))
    dest = tempfile.NamedTemporaryFile(suffix='.nc', delete=False).name
    for k in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=300) as r, open(dest, 'wb') as fh:
                fh.write(r.read())
            return read_nc(dest)
        except Exception as e:  # IRIDL corta a veces peticiones largas: reintentar
            print(f'   IRIDL reintento {k+1}/{tries} ({e})', flush=True); time.sleep(10 * (k + 1))
    raise RuntimeError(f'IRIDL no respondió para {d0}..{d1}')


COG = ('https://data.chc.ucsb.edu/products/CHIRPS/v2.0/global_daily/cogs/p05/'
       '{y}/chirps-v2.0.{y}.{m:02d}.{d:02d}.cog')


def fetch_cog_range(d0, d1, bb, workers=16):
    """CHC/UCSB: un COG global por día; se lee SOLO la ventana del bbox (lectura
    HTTP por rangos, ~1 s/día, en paralelo). Días sin COG → NaN.
    Devuelve (dates, Y, X, arr)."""
    import rasterio
    from rasterio.windows import from_bounds
    from concurrent.futures import ThreadPoolExecutor
    dates = [d0 + dt.timedelta(days=k) for k in range((d1 - d0).days + 1)]
    env = dict(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR', CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.cog',
               GDAL_HTTP_MAX_RETRY='4', GDAL_HTTP_RETRY_DELAY='3')
    geo = {}

    def one(d):
        url = '/vsicurl/' + COG.format(y=d.year, m=d.month, d=d.day)
        for k in range(4):
            try:
                with rasterio.Env(**env):
                    with rasterio.open(url) as ds:
                        w = from_bounds(bb[0], bb[2], bb[1], bb[3], ds.transform).round_offsets().round_lengths()
                        a = ds.read(1, window=w).astype('float64')
                        if 'Y' not in geo:
                            t = ds.window_transform(w)
                            geo['X'] = t.c + t.a * (np.arange(a.shape[1]) + 0.5)
                            geo['Y'] = t.f + t.e * (np.arange(a.shape[0]) + 0.5)
                        a[a < 0] = np.nan
                        return a
            except Exception as e:
                if 'does not exist' in str(e) or '404' in str(e):
                    return None
                time.sleep(2 * (k + 1))
        return None

    with ThreadPoolExecutor(workers) as ex:
        res = list(ex.map(one, dates))
    shp = next((r.shape for r in res if r is not None), None)
    if shp is None:
        return dates, None, None, None
    arr = np.stack([r if r is not None else np.full(shp, np.nan) for r in res])
    return dates, geo['Y'], geo['X'], arr


def get_year(y, d0, d1, bb, cache_dir, use_cache):
    """Datos de un año (o tramo): caché .npz → COG (paralelo) → IRIDL para los
    días finales que aún no tengan COG."""
    path = os.path.join(cache_dir, f'chirps_{y}.npz')
    if use_cache and os.path.exists(path):
        z = np.load(path)
        dates = [dt.date.fromordinal(int(o)) for o in z['ord']]
        keep = [k for k, d in enumerate(dates) if d0 <= d <= d1]
        return [dates[k] for k in keep], z['Y'], z['X'], z['arr'][keep]
    t0 = time.time()
    dates, Y, X, arr = fetch_cog_range(d0, d1, bb)
    ok = [] if arr is None else [k for k in range(len(dates)) if np.isfinite(arr[k]).any()]
    last_ok = dates[ok[-1]] if ok else d0 - dt.timedelta(days=1)
    il = iridl_last()                     # IRIDL sólo hasta su último día publicado
    d1i = min(d1, il) if il else d1
    if last_ok < d1i:                     # completar la cola con IRIDL
        try:
            d2, Y2, X2, a2 = fetch_nc(last_ok + dt.timedelta(days=1), d1i, bb)
            if arr is None:
                dates, Y, X, arr = d2, Y2, X2, a2
            else:
                # alinear rejillas (mismos centros 0.05°)
                ii = [int(np.argmin(np.abs(Y2 - v))) for v in Y]; jj = [int(np.argmin(np.abs(X2 - v))) for v in X]
                idx = {d: k for k, d in enumerate(dates)}
                for k2, d in enumerate(d2):
                    if d in idx:
                        arr[idx[d]] = a2[k2][np.ix_(ii, jj)]
        except Exception as e:
            print(f'   (sin cola IRIDL: {e})')
    print(f'   {y}: {len(dates)} días en {time.time()-t0:.0f}s', flush=True)
    if y < dt.date.today().year:          # sólo se cachean años cerrados
        np.savez_compressed(path, ord=[d.toordinal() for d in dates], Y=Y, X=X, arr=arr)
    return dates, Y, X, arr


def read_nc(path):
    import xarray as xr
    ds = xr.open_dataset(path, decode_times=False)
    jd = ds['T'].values.astype('float64')
    dates = [dt.date(1970, 1, 1) + dt.timedelta(days=int(np.floor(j - 2440587.5))) for j in jd]
    arr = ds['prcp'].transpose('T', 'Y', 'X').values.astype('float64')  # mm/día
    arr[arr < 0] = np.nan
    return dates, ds['Y'].values.astype('float64'), ds['X'].values.astype('float64'), arr


def zonal(units, dates, Y, X, arr):
    """Devuelve {unit_id: np.array(len(dates))} con el promedio ponderado por área."""
    out = {}
    for u in units:
        acc = np.zeros(len(dates)); wsum = np.zeros(len(dates))
        for la, lo, w in u['w_chirps']:
            i = int(np.argmin(np.abs(Y - la))); j = int(np.argmin(np.abs(X - lo)))
            if abs(Y[i] - la) > 0.01 or abs(X[j] - lo) > 0.01:
                raise RuntimeError(f'píxel {la},{lo} fuera del recorte descargado')
            v = arr[:, i, j]; ok = np.isfinite(v) & (v >= 0)
            acc[ok] += w * v[ok]; wsum[ok] += w
        s = np.where(wsum > 0.5, acc / np.where(wsum > 0, wsum, 1), np.nan)  # exige ≥50% del área con dato
        out[u['id']] = s
    return out


def encode(series):
    a = np.where(np.isfinite(series), np.clip(np.round(series * 10), 0, 65534), MISSING).astype('<u2')
    return base64.b64encode(a.tobytes()).decode('ascii')


def decode(s):
    a = np.frombuffer(base64.b64decode(s), dtype='<u2').astype('float64')
    return np.where(a == MISSING, np.nan, a / 10.0)


def fetch_prelim(days, bb, workers=3):
    """CHIRPS preliminar (CHC): un GeoTIFF global .gz por día; se descomprime en
    memoria y se lee la ventana del bbox. Devuelve (dates, Y, X, arr) con los días
    que existan (los que aún no se publican quedan fuera)."""
    import gzip, rasterio
    from rasterio.io import MemoryFile
    from rasterio.windows import from_bounds
    from concurrent.futures import ThreadPoolExecutor
    geo = {}

    def one(d):
        url = PRELIM.format(y=d.year, m=d.month, d=d.day)
        for k in range(6):                     # CHC responde 403 esporádicos (límite de tasa): reintentar
            try:
                with urllib.request.urlopen(url, timeout=120) as r:
                    raw = gzip.decompress(r.read())
                with MemoryFile(raw) as mf, mf.open() as ds:
                    w = from_bounds(bb[0], bb[2], bb[1], bb[3], ds.transform).round_offsets().round_lengths()
                    a = ds.read(1, window=w).astype('float64')
                    if 'Y' not in geo:
                        t = ds.window_transform(w)
                        geo['X'] = t.c + t.a * (np.arange(a.shape[1]) + 0.5)
                        geo['Y'] = t.f + t.e * (np.arange(a.shape[0]) + 0.5)
                    a[a < 0] = np.nan
                    return a
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    return None
                time.sleep(4 * (k + 1))
            except Exception:
                time.sleep(4 * (k + 1))
        return None

    with ThreadPoolExecutor(workers) as ex:
        res = list(ex.map(one, days))
    keep = [k for k, r in enumerate(res) if r is not None]
    if not keep:
        return [], None, None, None
    return [days[k] for k in keep], geo['Y'], geo['X'], np.stack([res[k] for k in keep])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--mode', choices=['baseline', 'incremental'], default='incremental')
    ap.add_argument('--days', type=int, default=150, help='días de FINAL a refrescar en modo incremental')
    ap.add_argument('--dir', default=C.SEMILLA, help='carpeta de documentos (entrada y salida)')
    ap.add_argument('--nc-dir', default=os.path.join(ROOT, '_cache_chirps'),
                    help='caché anual .npz del FINAL (no se sube al repo)')
    ap.add_argument('--sin-prelim', action='store_true', help='no añadir CHIRPS preliminar')
    args = ap.parse_args()

    units = load_units(); bb = bbox(units)
    today = dt.date.today()
    os.makedirs(args.nc_dir, exist_ok=True)
    ndays_total = (today - START).days + 1
    full = {u['id']: np.full(ndays_total, np.nan) for u in units}

    prev_prelim = None                                  # preliminar ya calculado en corridas previas
    if args.mode == 'incremental':
        prev_final = None
        for u in units:
            doc = C.leer_doc(args.dir, 'chirps__' + u['id'])
            if not doc:
                sys.exit(f'Falta chirps__{u["id"]} en {args.dir}: corre --mode baseline o firestore_sync.py bajar')
            full[u['id']] = C.serie_de_doc(doc, START, ndays_total)
            fh = dt.date.fromisoformat(doc.get('final_hasta') or doc['hasta'])
            prev_final = fh if prev_final is None else min(prev_final, fh)
        # Lo posterior al último FINAL era preliminar: se descarta y se recalcula.
        cut = (prev_final - START).days + 1
        prev_prelim = {}
        for uid in full:
            prev_prelim[uid] = full[uid].copy(); prev_prelim[uid][:cut] = np.nan
            full[uid][cut:] = np.nan
        years = sorted({(today - dt.timedelta(days=k)).year for k in range(args.days + 1)})
        d_from = today - dt.timedelta(days=args.days)
    else:
        years = list(range(START.year, today.year + 1)); d_from = START

    # ---------------- CHIRPS FINAL ----------------
    for y in years:
        d0 = max(dt.date(y, 1, 1), d_from); d1 = min(dt.date(y, 12, 31), today)
        use_cache = args.mode == 'baseline' and y < today.year - 1
        print(f'CHIRPS final {d0}..{d1}', flush=True)
        dates, Y, X, arr = get_year(y, d0, d1, bb, args.nc_dir, use_cache)
        if arr is None:
            continue
        z = zonal(units, dates, Y, X, arr)
        for k, d in enumerate(dates):
            i = (d - START).days
            if 0 <= i < ndays_total:
                for uid in full:
                    if np.isfinite(z[uid][k]):
                        full[uid][i] = z[uid][k]

    # Reparar huecos (fallos transitorios de red) dentro del tramo FINAL.
    anyu = next(iter(full))
    lastdata = C.ultimo_valido(full[anyu])
    gaps = [i for i in range(lastdata + 1) if not np.isfinite(full[anyu][i])]
    if gaps:
        print(f'Reparando {len(gaps)} días sin dato…', flush=True)
        runs, cur = [], [gaps[0]]
        for i in gaps[1:]:
            if i == cur[-1] + 1: cur.append(i)
            else: runs.append(cur); cur = [i]
        runs.append(cur)
        for r in runs:
            d0 = START + dt.timedelta(days=r[0]); d1 = START + dt.timedelta(days=r[-1])
            dates, Y, X, arr = fetch_cog_range(d0, d1, bb, workers=2)
            if arr is None or not all(np.isfinite(arr[k]).any() for k in range(len(dates))):
                try: dates, Y, X, arr = fetch_nc(d0, d1, bb)
                except Exception as e: print(f'   sin reparar {d0}..{d1}: {e}'); continue
            z = zonal(units, dates, Y, X, arr)
            for k, d in enumerate(dates):
                i = (d - START).days
                for uid in full:
                    if not np.isfinite(full[uid][i]): full[uid][i] = z[uid][k]
        print(f'   quedan {sum(1 for i in range(lastdata + 1) if not np.isfinite(full[anyu][i]))} días sin dato', flush=True)

    final_last = max(i for i in range(ndays_total) if all(np.isfinite(full[u][i]) for u in full))
    final_hasta = START + dt.timedelta(days=final_last)
    for uid in full:                                   # nada "final" suelto después del último día completo
        full[uid][final_last + 1:] = np.nan

    # ---------------- CHIRPS PRELIMINAR ----------------
    hasta = final_hasta
    if True:  # (con --sin-prelim se conserva el preliminar previo pero no se descarga nada nuevo)
        # Reutiliza el preliminar ya calculado (CHC no lo revisa; el FINAL lo reemplaza)
        # y sólo descarga los días que faltan → 1–3 archivos por corrida diaria.
        if prev_prelim:
            for uid in full:
                m = np.isnan(full[uid]) & np.isfinite(prev_prelim[uid]); m[:final_last + 1] = False
                full[uid][m] = prev_prelim[uid][m]
        days = [final_hasta + dt.timedelta(days=k) for k in range(1, (today - final_hasta).days + 1)]
        days = [d for d in days if not np.isfinite(full[anyu][(d - START).days])]
        if args.sin_prelim:
            days = []
        print(f'CHIRPS preliminar: {len(days)} días por descargar', flush=True)
        dates, Y, X, arr = fetch_prelim(days, bb) if days else ([], None, None, None)
        if arr is not None:
            z = zonal(units, dates, Y, X, arr)
            for k, d in enumerate(dates):
                i = (d - START).days
                for uid in full:
                    full[uid][i] = z[uid][k]
        # sólo días consecutivos desde el final (un hueco corta la serie preliminar)
        j = final_last
        while j + 1 < ndays_total and all(np.isfinite(full[u][j + 1]) for u in full):
            j += 1
        for uid in full:
            full[uid][j + 1:] = np.nan
        hasta = START + dt.timedelta(days=j)

    last = (hasta - START).days
    for u in units:
        C.escribir_doc(args.dir, 'chirps__' + u['id'], {
            'fuente': 'chirps', 'unidad': u['id'], 'desde': START.isoformat(), 'hasta': hasta.isoformat(),
            'final_hasta': final_hasta.isoformat(), 'n': last + 1, 'p': C.enc_p(full[u['id']][: last + 1]),
            'producto': 'CHIRPS v2.0 diario 0.05° · FINAL (CHC/IRIDL) + PRELIMINAR (CHC fixed) · promedio ponderado por área'})
    print(f'CHIRPS por unidad: {len(units)} documentos · final hasta {final_hasta} · preliminar hasta {hasta}')


if __name__ == '__main__':
    main()
