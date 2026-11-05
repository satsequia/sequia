#!/usr/bin/env node
/* ===========================================================================
   resumen.js — Precalcula v3_meta/resumen (estado actual de TODAS las unidades)
   SAAT Sequías v3 · GOAL · HN-M26-53765

   Ejecuta EXACTAMENTE el mismo código que la web (indices.js + motor_unidades.js)
   sobre los documentos de --dir, y escribe resumen.json con, por unidad y fuente:
   SPEI y SPI a 3, 6 y 12 meses, CDD del año, fecha del dato y si es CHIRPS preliminar.
   La web lo lee en 1 sola lectura para el mapa, las alertas y la tabla.

   Uso:  node resumen.js --dir ../_trabajo
   =========================================================================== */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const HERE = __dirname, ROOT = path.dirname(HERE);
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const DIR = path.resolve(arg('--dir', path.join(ROOT, 'data', 'semilla')));

const ctx = vm.createContext({ console, atob, fetch: globalThis.fetch, setTimeout });
vm.runInContext('var window=this; var self=this;', ctx);
const run = f => vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
run(path.join(HERE, 'indices.js'));
run(path.join(ROOT, 'data', 'geo_saat.js'));
run(path.join(HERE, 'motor_unidades.js'));

let n = 0;
for (const f of fs.readdirSync(DIR)) {
  if (!f.endsWith('.json') || f === 'resumen.json' || f === 'estado.json' || f.startsWith('hist__')) continue;   // hist__*: historial v4
  ctx.__doc = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  vm.runInContext('registrarDoc(__doc)', ctx); n++;
}
const out = vm.runInContext(`(function(){
  const r={};
  Object.keys(UNITS).forEach(uid=>{r[uid]={};
    ['chirps','imerg','power'].forEach(src=>{
      if(!isReal(uid,src)&&!(ensureUnit(uid),isReal(uid,src)))return;   // sólo fuentes con dato real
      const x=unitNowCalc(uid,src);
      const rd=v=>v===null?null:Math.round(v*1000)/1000;
      r[uid][src]={asof:x.asof,spei:rd(x.spei),spi:rd(x.spi),spei6:rd(x.spei6),spi6:rd(x.spi6),
        spei12:rd(x.spei12),spi12:rd(x.spi12),cdd:x.cdd,cddAct:x.cddAct,cddTemp:x.cddTemp,prelim:x.prelim,real:true};});});
  return r;})()`, ctx);
const res = { generado: new Date().toISOString().slice(0, 16) + 'Z', anio: new Date().getFullYear(),
  nota: 'Precalculado con ingest/motor_unidades.js (mismo código que la web). SPEI/SPI a 3, 6 y 12 meses a la última fecha de cada fuente.',
  u: out };
fs.writeFileSync(path.join(DIR, 'resumen.json'), JSON.stringify(res));
const c = out.cabanas && out.cabanas.chirps;
console.log(`Resumen: ${Object.keys(out).length} unidades a partir de ${n} documentos` +
  (c ? ` · Cabañas CHIRPS SPEI-3 ${c.spei} al ${c.asof.d}/${c.asof.m}${c.prelim ? ' (prelim.)' : ''}` : ''));
