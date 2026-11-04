#!/usr/bin/env python3
"""Genera docs/UNIDADES_ANALISIS.md (catálogo de municipios y subcuencas) a partir
de data/geo_saat.js. Correr después de build_geo.py."""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
txt = open(os.path.join(ROOT, 'data', 'geo_saat.js'), encoding='utf-8').read()
G = json.loads(txt[txt.index('{'): txt.rindex('}') + 1])
L = ['# Catálogo de unidades de análisis · SAAT Sequías v3', '',
     f'Generado automáticamente por `ingest/catalogo_unidades.py` (geodatos del {G["generado"]}). '
     'Fuente: límites municipales y subcuencas exportados de ArcGIS Pro (EPSG:32616), áreas calculadas en UTM.', '',
     '**Columnas.** *% dentro* = fracción del área de la subcuenca dentro del municipio · '
     '*% del muni.* = fracción del municipio que ocupa · *Píx. ef.* = píxeles CHIRPS efectivos (1/Σw²; ≈1 → '
     'menor que un píxel de ≈29 km²) · *POWER* = celda(s) NASA POWER (centro lat, lon · peso).', '']
for k, m in G['municipios'].items():
    subs = G['subcuencas'][k]
    L += [f'## {m["nombre"]} ({m["depto"]}) · código {m["cod_muni"]}', '',
          f'- Área municipal: **{m["area_km2"]} km²** · centroide {m["centroide"][0]}, {m["centroide"][1]}',
          f'- Subcuencas: **{len(subs)}** ({sum(1 for s in subs if not s["astilla"])} analizables) · '
          f'cubren **{m["cobertura_subcuencas_pct"]} %** del municipio',
          f'- Píxeles CHIRPS efectivos del municipio: {m["pix_efectivos"]} · POWER: '
          + ', '.join(f'({a}, {b}) {w:.0%}' for a, b, w in m['w_power']), '',
          '| Código app | HydroID | Nombre | Área km² | Área dentro km² | % dentro | % del muni. | Píx. ef. | POWER | Observación |',
          '|---|---|---|---:|---:|---:|---:|---:|---|---|']
    for s in subs:
        obs = []
        if s['astilla']: obs.append('astilla <0.1 km², excluida')
        else:
            if s['pix_efectivos'] < 1.5: obs.append('< 1 píxel CHIRPS')
            if s['pct_subcuenca_en_muni'] < 20: obs.append('mayormente fuera del municipio')
            if s['area_km2'] > 300: obs.append('muy extensa')
        pw = ' + '.join(f'({a},{b})' for a, b, _ in s.get('w_power', [])) or '—'
        L.append(f'| {s["id"]} | {s["hydroid"]} | {s["nombre"]} | {s["area_km2"]:.2f} | {s["area_en_muni_km2"]:.2f} | '
                 f'{s["pct_subcuenca_en_muni"]:.1f} | {s["pct_del_muni"]:.1f} | {s.get("pix_efectivos", "—")} | {pw} | {"; ".join(obs)} |')
    L.append('')
L += ['## Para poner nombres a las subcuencas', '',
      'Llenar la columna `nombre` de `geo_fuente/nombres_subcuencas.csv` (p.ej. “Qda. El Venado”) y correr:',
      '```', 'python ingest/build_geo.py && python ingest/catalogo_unidades.py', '```',
      'Los códigos (`CAB-H42`…) no cambian, así que los datos CHIRPS ya generados siguen siendo válidos.']
open(os.path.join(ROOT, 'docs', 'UNIDADES_ANALISIS.md'), 'w', encoding='utf-8').write('\n'.join(L) + '\n')
print('docs/UNIDADES_ANALISIS.md escrito')
