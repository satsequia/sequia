"""
saat_comun.py — utilidades comunes de la ingesta v3 (SAAT Sequía · GOAL).

Formato de los documentos de series (idéntico en Firestore y en los JSON locales):
  v3_series/{fuente}__{unidad}       chirps__cabanas, imerg__CAB-H42, ...
    fuente, unidad, desde (YYYY-MM-DD), hasta, n, p (base64), producto, actualizado
    [chirps] final_hasta: último día de CHIRPS FINAL; después = CHIRPS PRELIMINAR
  v3_series/power__{lat:.2f}_{lon:.3f} celdas NASA POWER (p.ej. power__14.00_-88.125) (P, Tmáx, Tmín)
    celda [lat, lon], desde, hasta, n, p, tx, tn
  v3_meta/resumen                    índices actuales por unidad y fuente (1 lectura)
  v3_meta/estado                     fecha y resultado de la última ingesta

Codificación compacta (cabe holgada en el límite de 1 MiB por documento):
  p      uint16 little-endian, DÉCIMAS de mm/día, 65535 = sin dato
  tx/tn  int16  little-endian, DÉCIMAS de °C,     -32768 = sin dato
"""
import base64, datetime as dt, json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, 'data')
SEMILLA = os.path.join(DATA, 'semilla')
COL_SERIES = 'v3_series'
COL_META = 'v3_meta'


def load_units():
    return json.load(open(os.path.join(DATA, 'unidades.json'), encoding='utf-8'))['unidades']


def bbox_de(units, key, pad):
    lats = [w[0] for u in units for w in u[key]]; lons = [w[1] for u in units for w in u[key]]
    return (round(min(lons) - pad, 3), round(max(lons) + pad, 3), round(min(lats) - pad, 3), round(max(lats) + pad, 3))


# ---- codificación ----
def enc_p(a):
    a = np.asarray(a, dtype='float64')
    v = np.where(np.isfinite(a), np.clip(np.round(a * 10), 0, 65534), 65535).astype('<u2')
    return base64.b64encode(v.tobytes()).decode('ascii')


def dec_p(s):
    a = np.frombuffer(base64.b64decode(s), dtype='<u2').astype('float64')
    return np.where(a == 65535, np.nan, a / 10.0)


def enc_t(a):
    a = np.asarray(a, dtype='float64')
    v = np.where(np.isfinite(a), np.clip(np.round(a * 10), -32767, 32767), -32768).astype('<i2')
    return base64.b64encode(v.tobytes()).decode('ascii')


def dec_t(s):
    a = np.frombuffer(base64.b64decode(s), dtype='<i2').astype('float64')
    return np.where(a == -32768, np.nan, a / 10.0)


# ---- documentos locales ----
def ruta_doc(d, doc_id):
    return os.path.join(d, doc_id + '.json')


def leer_doc(d, doc_id):
    p = ruta_doc(d, doc_id)
    return json.load(open(p, encoding='utf-8')) if os.path.exists(p) else None


def escribir_doc(d, doc_id, obj):
    os.makedirs(d, exist_ok=True)
    obj = dict(obj); obj['actualizado'] = dt.datetime.utcnow().strftime('%Y-%m-%dT%H:%MZ')
    with open(ruta_doc(d, doc_id), 'w', encoding='utf-8') as fh:
        json.dump(obj, fh, ensure_ascii=False, separators=(',', ':'))


def serie_de_doc(doc, start, ndays, campo='p', dec=dec_p):
    """Coloca la serie de un documento en un arreglo [start, start+ndays)."""
    out = np.full(ndays, np.nan)
    if not doc or campo not in doc:
        return out
    v = dec(doc[campo]); off = (dt.date.fromisoformat(doc['desde']) - start).days
    i0 = max(0, off); i1 = min(ndays, off + len(v))
    if i1 > i0:
        out[i0:i1] = v[i0 - off:i1 - off]
    return out


def ultimo_valido(a):
    idx = np.where(np.isfinite(a))[0]
    return int(idx[-1]) if len(idx) else -1
