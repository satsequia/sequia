#!/usr/bin/env node
/* ===========================================================================
   historial.js — Precalcula el HISTORIAL DE SEQUÍAS (1981 → hoy) por unidad
   SAAT Sequías v4 · GOAL · HN-M26-53765

   Ejecuta el MISMO motor que la web (indices.js + motor_unidades.js) sobre los
   documentos de --dir y escribe, por unidad (3 municipios + 52 subcuencas), un
   documento hist__{unidad}.json con la serie MENSUAL desde enero de 1981 (CHIRPS):
     p            lluvia del mes (mm; el último mes, acumulada hasta el último día)
     spi1..spi12  SPI de 1, 3, 6 y 12 meses (Gamma mixta, ref. 1991–2020)
     spei1..12    SPEI de 1, 3, 6 y 12 meses (log-logística con control; respaldo empírico)
     cdd          racha seca más larga dentro del mes (días con P < 1 mm)
     cddTemp      racha seca más larga de abril a noviembre de cada año
   y un documento hist__oni.json con el ONI mensual de NOAA-CPC (se conserva el
   anterior si la descarga falla). La web lee 1 documento por unidad consultada.

   El cálculo replica exactamente spiAt/speiAt del motor (se verifica al final con
   una muestra) pero reutiliza las sumas mensuales: ~20 s para las 55 unidades.

   Uso:  node historial.js --dir ../_trabajo
   =========================================================================== */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const HERE = __dirname, ROOT = path.dirname(HERE);
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const DIR = path.resolve(arg('--dir', path.join(ROOT, 'data', 'semilla')));
const SOLO = arg('--unidad', null);

const ctx = vm.createContext({ console, atob, fetch: globalThis.fetch, setTimeout });
vm.runInContext('var window=this; var self=this;', ctx);
const run = f => vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
run(path.join(HERE, 'indices.js'));
run(path.join(ROOT, 'data', 'geo_saat.js'));
run(path.join(HERE, 'motor_unidades.js'));

let n = 0;
for (const f of fs.readdirSync(DIR)) {
  if (!/^(chirps|imerg|power)__.*\.json$/.test(f)) continue;
  ctx.__doc = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  vm.runInContext('registrarDoc(__doc)', ctx); n++;
}

// --- cálculo dentro del contexto del motor (mismas funciones y constantes) ---
const CALC = `(function(uid){
  const src='chirps';
  if(!(ensureUnit(uid),isReal(uid,src)))return null;
  const a=asOfOf(uid,src); if(!a)return null;
  const Yf=CUR_YEAR, Mf=a.m, Df=a.d;
  const SC=[1,3,6,12];
  const sm=new Map(), st=new Map();
  const SM=(y,m)=>{const k=y*12+m;if(!sm.has(k))sm.set(k,sumMonth(uid,src,y,m));return sm.get(k);};
  const ST=(y,m,d)=>{const k=(y*12+m)*32+d;if(!st.has(k))st.set(k,sumToDay(uid,src,y,m,d));return st.get(k);};
  // = accumP / accumPET del motor, con sumas en caché
  const accP=(Y,M,D,s)=>{let t=0;for(let k=0;k<s;k++){let m=M-k,y=Y;while(m<1){m+=12;y--;}
      const v=(k===0)?ST(y,m,D):SM(y,m);if(v===null)return null;t+=v;}return t;};
  const accE=(Y,M,D,s)=>{let t=0;for(let k=0;k<s;k++){let m=M-k,y=Y;while(m<1){m+=12;y--;}
      let e=getPET(uid,y,m);if(e===null)return null;if(k===0)e*=D/daysInMonth(y,m);t+=e;}return t;};
  const spi=(s,Y,M,D)=>{const tgt=accP(Y,M,D,s);if(tgt===null)return null;
      const ref=[];for(let y=REF_START;y<=REF_END;y++){const v=accP(y,M,D,s);if(v!==null)ref.push(v);}
      return I.spiGamma(ref,tgt);};
  const spei=(s,Y,M,D)=>{const dd=y=>{const p=accP(y,M,D,s),e=accE(y,M,D,s);return(p===null||e===null)?null:p-e;};
      const tgt=dd(Y);if(tgt===null)return null;
      const ref=[];for(let y=REF_START;y<=REF_END;y++){const v=dd(y);if(v!==null)ref.push(v);}
      const z=I.spei(ref,tgt);return z!==null?z:I.speiEmpirico(ref,tgt);};
  const r2=v=>(v===null||v===undefined||!isFinite(v))?null:Math.round(v*100)/100;
  const r1=v=>(v===null||v===undefined||!isFinite(v))?null:Math.round(v*10)/10;
  const o={p:[],cdd:[]};SC.forEach(s=>{o['spi'+s]=[];o['spei'+s]=[];});
  for(let y=Y0;y<=Yf;y++)for(let m=1;m<=12;m++){
    if(y===Yf&&m>Mf)break;
    const D=(y===Yf&&m===Mf)?Df:daysInMonth(y,m);
    o.p.push(r1(ST(y,m,D)));
    SC.forEach(s=>{o['spi'+s].push(r2(spi(s,y,m,D)));o['spei'+s].push(r2(spei(s,y,m,D)));});
    let run=0,mx=0,any=false;for(let d=1;d<=D;d++){const v=getDaily(uid,src,y,m,d);if(v===null)continue;any=true;
      if(v<1){run++;if(run>mx)mx=run;}else run=0;}
    o.cdd.push(any?mx:null);}
  const ct=[];for(let y=Y0;y<=Yf;y++)ct.push((y===Yf&&Mf<4)?null:cddMaxYear(uid,src,y));
  // verificación contra el motor (muestra)
  const chk=[[1997,8],[2015,7],[Yf,Mf]].map(([y,m])=>{const D=(y===Yf&&m===Mf)?Df:daysInMonth(y,m);
    return Math.abs((spi(3,y,m,D)||0)-(spiAt(uid,src,3,y,m,D)||0))+Math.abs((spei(6,y,m,D)||0)-(speiAt(uid,src,6,y,m,D)||0));});
  const fi=chirpsFinalIdx(uid),fd=fi===null?null:idxDate(fi);
  return Object.assign({tipo:'historial',unidad:uid,serie:'chirps',desde:Y0+'-01',
    hasta:Yf+'-'+String(Mf).padStart(2,'0'),hasta_dia:Df,
    final_hasta:fd?fd.y+'-'+String(fd.m).padStart(2,'0')+'-'+String(fd.d).padStart(2,'0'):null,
    cddTemp:{desde:Y0,v:ct},__chk:Math.max.apply(null,chk)},o);
})`;
const calc = vm.runInContext(CALC, ctx);
const uids = SOLO ? [SOLO] : vm.runInContext('Object.keys(UNITS)', ctx);
const gen = new Date().toISOString().slice(0, 16) + 'Z';
let k = 0, maxChk = 0;
const t0 = Date.now();
for (const uid of uids) {
  const h = calc(uid); if (!h) { console.warn('sin CHIRPS real:', uid); continue; }
  maxChk = Math.max(maxChk, h.__chk); delete h.__chk; h.generado = gen;
  fs.writeFileSync(path.join(DIR, 'hist__' + uid + '.json'), JSON.stringify(h)); k++;
}
console.log(`Historial: ${k} unidades (${n} documentos leídos) en ${((Date.now() - t0) / 1000).toFixed(1)} s · ` +
  `diferencia máx. con el motor: ${maxChk.toExponential(1)}`);
if (maxChk > 1e-9) { console.error('ERROR: el historial no coincide con spiAt/speiAt del motor'); process.exit(1); }

// --- ONI (NOAA-CPC). Si falla la descarga se conserva hist__oni.json anterior ---
(async () => {
  const ONI_URL = 'https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt';
  const SEAS = ['DJF', 'JFM', 'FMA', 'MAM', 'AMJ', 'MJJ', 'JJA', 'JAS', 'ASO', 'SON', 'OND', 'NDJ'];
  try {
    const r = await fetch(ONI_URL, { headers: { 'User-Agent': 'saat-sequia-ingest' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const txt = await r.text(), v = {};
    txt.split('\n').forEach(l => { const p = l.trim().split(/\s+/); const s = SEAS.indexOf(p[0]);
      if (s >= 0 && +p[1] >= 1981) v[p[1] + '-' + String(s + 1).padStart(2, '0')] = +p[3]; });
    const keys = Object.keys(v).sort(); if (keys.length < 400) throw new Error('ONI incompleto');
    const vals = []; let last = null;
    outer: for (let y = 1981; ; y++) for (let m = 1; m <= 12; m++) {
      const kk = y + '-' + String(m).padStart(2, '0'); if (!(kk in v)) break outer; vals.push(v[kk]); last = kk; }
    fs.writeFileSync(path.join(DIR, 'hist__oni.json'), JSON.stringify({ tipo: 'oni', origen: 'NOAA-CPC ONI (ERSSTv5)', url: ONI_URL,
      nota: 'Valor del mes = trimestre centrado en ese mes (enero = DJF).', desde: '1981-01', hasta: last, v: vals, generado: gen }));
    console.log('ONI hasta', last);
  } catch (e) { console.warn('ONI no actualizado (' + e.message + '); se conserva el anterior'); }
})();
