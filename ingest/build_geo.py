#!/usr/bin/env python3
"""
build_geo.py — Prepara los límites municipales y las subcuencas para la app v3.
SAAT Sequía · GOAL · HN-M26-53765

Entrada  (geo_fuente/, exportados de ArcGIS Pro, EPSG:32616 UTM 16N):
    municipio_{cabanas,marcala,san_francisco}.geojson   (1 polígono cada uno)
    cuencas_{cabanas,marcala,san_francisco}.geojson     (subcuencas con influencia)
    nombres_subcuencas.csv  (opcional: municipio,HydroID,nombre)

Salida:
    data/limites/*.geojson   Límites en WGS84 (EPSG:4326), simplificados a TOL_M,
                             con atributos calculados (para SIG y para la web).
    data/geo_saat.js         window.SAAT_GEO = {...}  (lo carga index.html; funciona
                             también abriendo el archivo local, file://)
    data/unidades.json       Catálogo de unidades de análisis + pesos (lo usan
                             los scripts de ingesta CHIRPS/POWER).

Pesos de promediado espacial (áreas calculadas en UTM, m²):
  * CHIRPS: rejilla 0.05° (bordes en múltiplos de 0.05°). Peso de cada píxel =
    área(píxel ∩ polígono) / área(polígono).  → promedio ponderado por área.
  * IMERG V07 (GPM): rejilla 0.1° (bordes en múltiplos de 0.1°), mismo criterio.
  * NASA POWER: rejilla MERRA-2 0.5° lat × 0.625° lon (bordes lat k·0.5+0.25,
    lon k·0.625+0.3125; verificado empíricamente contra la API 2026-09-30).
    Mismo criterio de peso por área; se consulta la API en el CENTRO de cada celda.
"""
import csv, json, math, os, sys
from shapely.geometry import shape, mapping, box
from shapely.ops import transform, unary_union
from shapely.validation import make_valid
from pyproj import Transformer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'geo_fuente')
OUT = os.path.join(ROOT, 'data')
TOL_M = 15            # tolerancia de simplificación (m) para la web
MIN_AREA_KM2 = 0.10   # área DENTRO del municipio menor a esto → "astilla" (no analizable)
CHIRPS_RES = 0.05
IMERG_RES = 0.1      # IMERG V07 (GPM) 0.1°, bordes en múltiplos de 0.1° (verificado en ClimateSERV)
POWER_DLAT, POWER_DLON = 0.5, 0.625

MUNIS = [
    # clave web, archivo, código, prefijo subcuencas, departamento
    ('cabanas',      'cabanas',       'CAB', 'La Paz'),
    ('marcala',      'marcala',       'MAR', 'La Paz'),
    ('sanfrancisco', 'san_francisco', 'SFR', 'Lempira'),
]
NOMBRES_MUNI = {'cabanas': 'Cabañas', 'marcala': 'Marcala', 'sanfrancisco': 'San Francisco'}

to_ll = Transformer.from_crs(32616, 4326, always_xy=True).transform
to_utm = Transformer.from_crs(4326, 32616, always_xy=True).transform


def rnd(geom, nd=5):
    """Redondea coordenadas (5 decimales ≈ 1 m) para aligerar el JSON."""
    def r(x, y, z=None):
        return (round(x, nd), round(y, nd))
    return transform(r, geom)


def load_names():
    p = os.path.join(SRC, 'nombres_subcuencas.csv')
    names = {}
    if os.path.exists(p):
        with open(p, encoding='utf-8-sig') as fh:
            for row in csv.DictReader(fh):
                n = (row.get('nombre') or '').strip()
                if n:
                    names[(row['municipio'].strip(), int(row['HydroID']))] = n
    return names


def grid_weights(poly_utm, poly_ll, dlat, dlon, lat_off, lon_off):
    """Pesos por área de las celdas de una rejilla regular que tocan el polígono.
    Celdas con bordes en lat_off + k*dlat y lon_off + k*dlon. Devuelve
    [[lat_centro, lon_centro, peso], ...] (pesos suman 1)."""
    minx, miny, maxx, maxy = poly_ll.bounds
    i0 = math.floor((miny - lat_off) / dlat); i1 = math.floor((maxy - lat_off) / dlat)
    j0 = math.floor((minx - lon_off) / dlon); j1 = math.floor((maxx - lon_off) / dlon)
    A = poly_utm.area
    out = []
    for i in range(i0, i1 + 1):
        for j in range(j0, j1 + 1):
            la0 = lat_off + i * dlat; lo0 = lon_off + j * dlon
            cell = box(lo0, la0, lo0 + dlon, la0 + dlat).segmentize(dlat / 20)
            inter = transform(to_utm, cell).intersection(poly_utm).area
            if inter > 0:
                out.append([round(la0 + dlat / 2, 4), round(lo0 + dlon / 2, 4), inter / A])
    s = sum(w for *_, w in out)
    return [[a, b, round(w / s, 6)] for a, b, w in out]


def main():
    names = load_names()
    os.makedirs(os.path.join(OUT, 'limites'), exist_ok=True)
    geo = {'crs': 'EPSG:4326', 'generado': None, 'municipios': {}, 'subcuencas': {}}
    unidades = []
    resumen = []

    for key, fname, pref, dept in MUNIS:
        fm = json.load(open(os.path.join(SRC, f'municipio_{fname}.geojson'), encoding='utf-8'))
        mp = fm['features'][0]['properties']
        mu = make_valid(shape(fm['features'][0]['geometry']))
        mu_ll = transform(to_ll, mu)
        c_ll = mu_ll.representative_point()
        cen = transform(to_ll, mu.centroid)
        mu_web = rnd(transform(to_ll, mu.simplify(TOL_M, preserve_topology=True)))
        mrec = {
            'id': key, 'nombre': NOMBRES_MUNI[key], 'depto': dept,
            'cod_muni': mp.get('COD_MUNI'), 'area_km2': round(mu.area / 1e6, 2),
            'centroide': [round(cen.y, 5), round(cen.x, 5)],
            'bbox': [round(v, 5) for v in mu_ll.bounds],
        }
        fc = json.load(open(os.path.join(SRC, f'cuencas_{fname}.geojson'), encoding='utf-8'))
        subs, feats_ll = [], []
        union_sub = unary_union([make_valid(shape(f['geometry'])) for f in fc['features']])
        mrec['cobertura_subcuencas_pct'] = round(mu.intersection(union_sub).area / mu.area * 100, 1)
        for f in sorted(fc['features'], key=lambda f: f['properties']['HydroID']):
            p = f['properties']; hid = int(p['HydroID'])
            g = make_valid(shape(f['geometry']))
            a = g.area; ai = g.intersection(mu).area
            gid = f'{pref}-H{hid:02d}'
            g_ll = transform(to_ll, g)
            cg = transform(to_ll, g.centroid)
            # Bloque 2 (2026-11-03): el criterio usa el área DENTRO del municipio, no la total.
            # Así quedan fuera SFR-H14 y SFR-H18 (subcuencas vecinas con 0 km² dentro de San
            # Francisco) además de CAB-H55, igual que en el Informe del Bloque 1 (52 analizables).
            astilla = ai / 1e6 < MIN_AREA_KM2
            rec = {
                'id': gid, 'muni': key, 'hydroid': hid,
                'nombre': names.get((key, hid)) or f'Subcuenca H{hid}',
                'area_km2': round(a / 1e6, 2),
                'area_en_muni_km2': round(ai / 1e6, 2),
                'pct_subcuenca_en_muni': round(ai / a * 100, 1),
                'pct_del_muni': round(ai / mu.area * 100, 1),
                'centroide': [round(cg.y, 5), round(cg.x, 5)],
                'astilla': astilla,
            }
            if not astilla:
                rec['w_chirps'] = grid_weights(g, g_ll, CHIRPS_RES, CHIRPS_RES, 0.0, 0.0)
                rec['w_power'] = grid_weights(g, g_ll, POWER_DLAT, POWER_DLON, 0.25, 0.3125)
                rec['w_imerg'] = grid_weights(g, g_ll, IMERG_RES, IMERG_RES, 0.0, 0.0)
                # píxeles efectivos = 1/Σw² (cuántos píxeles "independientes" promedia)
                rec['pix_efectivos'] = round(1 / sum(w * w for *_, w in rec['w_chirps']), 1)
            gw = g.simplify(TOL_M, preserve_topology=True)
            if gw.is_empty:
                gw = g
            rec_geom = rnd(transform(to_ll, gw))
            subs.append(rec)
            feats_ll.append({'type': 'Feature', 'properties': {k: v for k, v in rec.items() if not k.startswith('w_')},
                             'geometry': mapping(rec_geom)})
        mrec['w_chirps'] = grid_weights(mu, mu_ll, CHIRPS_RES, CHIRPS_RES, 0.0, 0.0)
        mrec['w_power'] = grid_weights(mu, mu_ll, POWER_DLAT, POWER_DLON, 0.25, 0.3125)
        mrec['w_imerg'] = grid_weights(mu, mu_ll, IMERG_RES, IMERG_RES, 0.0, 0.0)
        mrec['pix_efectivos'] = round(1 / sum(w * w for *_, w in mrec['w_chirps']), 1)
        mrec['n_subcuencas'] = len(subs)

        geo['municipios'][key] = dict(mrec, geometry=mapping(mu_web))
        geo['subcuencas'][key] = [dict(s, geometry=f['geometry']) for s, f in zip(subs, feats_ll)]

        # GeoJSON WGS84 para SIG
        json.dump({'type': 'FeatureCollection', 'name': f'municipio_{fname}',
                   'features': [{'type': 'Feature', 'properties': {k: v for k, v in mrec.items() if not k.startswith('w_')},
                                 'geometry': mapping(mu_web)}]},
                  open(os.path.join(OUT, 'limites', f'municipio_{fname}_wgs84.geojson'), 'w', encoding='utf-8'),
                  ensure_ascii=False)
        json.dump({'type': 'FeatureCollection', 'name': f'subcuencas_{fname}', 'features': feats_ll},
                  open(os.path.join(OUT, 'limites', f'subcuencas_{fname}_wgs84.geojson'), 'w', encoding='utf-8'),
                  ensure_ascii=False)

        unidades.append({'id': key, 'tipo': 'municipio', 'muni': key, 'nombre': mrec['nombre'],
                         'lat': mrec['centroide'][0], 'w_chirps': mrec['w_chirps'], 'w_power': mrec['w_power'],
                         'w_imerg': mrec['w_imerg']})
        for s in subs:
            if not s['astilla']:
                unidades.append({'id': s['id'], 'tipo': 'subcuenca', 'muni': key, 'nombre': s['nombre'],
                                 'lat': s['centroide'][0], 'w_chirps': s['w_chirps'], 'w_power': s['w_power'],
                                 'w_imerg': s['w_imerg']})
        resumen.append((mrec, subs))

    from datetime import datetime, timezone
    geo['generado'] = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    with open(os.path.join(OUT, 'geo_saat.js'), 'w', encoding='utf-8') as fh:
        fh.write('/* Generado por ingest/build_geo.py — NO editar a mano. Límites WGS84 + pesos. */\n')
        fh.write('window.SAAT_GEO=' + json.dumps(geo, ensure_ascii=False, separators=(',', ':')) + ';\n')
    json.dump({'generado': geo['generado'], 'unidades': unidades},
              open(os.path.join(OUT, 'unidades.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    # bbox total para la descarga CHIRPS
    lats = [w[0] for u in unidades for w in u['w_chirps']]; lons = [w[1] for u in unidades for w in u['w_chirps']]
    print(f'Unidades: {len(unidades)} · píxeles CHIRPS distintos: '
          f'{len({(w[0], w[1]) for u in unidades for w in u["w_chirps"]})} · '
          f'bbox centros lat {min(lats)}..{max(lats)} lon {min(lons)}..{max(lons)}')
    print('Celdas POWER distintas:', sorted({(w[0], w[1]) for u in unidades for w in u['w_power']}))
    for m, subs in resumen:
        print(f"\n{m['nombre']}: {m['area_km2']} km² · cobertura subcuencas {m['cobertura_subcuencas_pct']}% · "
              f"píx.efectivos {m['pix_efectivos']} · POWER {[(a, b, w) for a, b, w in m['w_power']]}")
        for s in subs:
            print(f"   {s['id']:8s} {s['area_km2']:8.2f} km²  en muni {s['pct_subcuenca_en_muni']:5.1f}%  "
                  f"{'ASTILLA' if s['astilla'] else 'px_ef ' + str(s['pix_efectivos'])}")


if __name__ == '__main__':
    main()
