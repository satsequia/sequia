/* ===========================================================================
   SAAT Sequías v3 · INTERFAZ (app.js) · GOAL · HN-M26-53765
   ---------------------------------------------------------------------------
   Arquitectura (TDR 53765 y RFO): GitHub Pages (esta web) + Firestore (base de
   datos) + GitHub Actions (descarga diaria automática):
     v3_meta/resumen          → índices actuales de todas las unidades (1 lectura:
                                mapa, alertas y tabla de subcuencas)
     v3_series/{fuente}__{u}  → series diarias de la unidad abierta (CHIRPS, IMERG)
     v3_series/power__{celda} → NASA POWER (lluvia + temperatura para el PET)
   Respaldo si Firestore no responde: data/semilla/*.json (mismo formato), y como
   último recurso NASA POWER en vivo + valores demostrativos marcados como tales.
   La capa de datos y los índices están en ingest/motor_unidades.js.
   =========================================================================== */
'use strict';
let curMuni='cabanas', curUnit='cabanas', curSrc='chirps';

/* ---- Config Firebase (la configuración web no es secreta) ---- */
const firebaseConfig = {
  apiKey: "AIzaSyC-Q9yIjzaB4Q7w6zyoSNd9IezAw65ORf0",
  authDomain: "satsequia-3b2a9.firebaseapp.com",
  projectId: "satsequia-3b2a9",
  storageBucket: "satsequia-3b2a9.firebasestorage.app",
  messagingSenderId: "636067476474",
  appId: "1:636067476474:web:a74981fb4c517a7a30aa43"
};
const COL_SERIES='v3_series', COL_META='v3_meta';
let ORIGEN='cargando';        // 'firestore' | 'respaldo' | 'demo'
let FS=null;                  // {db, doc, getDoc}
let LECTURAS=0;               // lecturas de Firestore en esta visita (transparencia de costo)

async function initFirestore(){
  const {initializeApp}=await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js');
  const {getFirestore,doc,getDoc,connectFirestoreEmulator}=await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js');
  const db=getFirestore(initializeApp(firebaseConfig));
  // Sólo para pruebas técnicas: ?emulador=127.0.0.1:8080 usa el emulador local de Firestore
  const emu=new URLSearchParams(location.search).get('emulador');
  if(emu){const [h,pt]=emu.split(':');connectFirestoreEmulator(db,h,+pt);}
  FS={db:db,doc:doc,getDoc:getDoc};}
async function leerFS(col,id){const s=await FS.getDoc(FS.doc(FS.db,col,id));LECTURAS++;return s.exists()?s.data():null;}
async function leerRespaldo(id){const r=await fetch('data/semilla/'+id+'.json',{cache:'no-cache'});if(!r.ok)return null;return r.json();}
async function leerDoc(col,id){
  if(ORIGEN==='firestore'){try{return await leerFS(col,id);}catch(e){console.warn('Firestore '+id+':',e.message);}}
  try{return await leerRespaldo(id);}catch(e){return null;}}

// Documentos necesarios para analizar una unidad (las celdas POWER se comparten)
function idsDeUnidad(uid){const u=UNITS[uid];
  return ['chirps__'+uid,'imerg__'+uid].concat(u.wPower.map(w=>powerId(w[0],w[1])));}
const EN_CURSO={}, NO_EXISTE={};   // NO_EXISTE: documentos ausentes (no se vuelven a pedir)
async function cargarUnidades(uids){
  const ids=[...new Set(uids.flatMap(idsDeUnidad))].filter(id=>!tieneDoc(id)&&!EN_CURSO[id]&&!NO_EXISTE[id]);
  await Promise.all(ids.map(async id=>{EN_CURSO[id]=1;try{const d=await leerDoc(COL_SERIES,id);if(d)registrarDoc(d);else NO_EXISTE[id]=1;}finally{delete EN_CURSO[id];}}));
  // POWER: si la base de datos no tiene la celda, se consulta la API en vivo (respaldo)
  for(const uid of uids){for(const w of UNITS[uid].wPower){if(!PCELL[cellKey(w[0],w[1])]){
    try{await loadPowerCell(w[0],w[1]);Object.keys(DATA).forEach(k=>delete DATA[k]);}catch(e){console.warn('POWER en vivo:',e.message);}}}}
}
// Sin resumen precalculado, las vistas de conjunto necesitan las series de cada unidad
async function asegurarVista(v){if(RESUMEN)return;
  let ids=null;if(v==='mapa'||v==='subcuencas')ids=unitsOf(curMuni);else if(v==='alertas')ids=Object.keys(UNITS);
  if(!ids)return;const falta=ids.filter(id=>!tieneDoc('chirps__'+id)&&!NO_EXISTE['chirps__'+id]&&!EN_CURSO['chirps__'+id]);if(!falta.length)return;
  // Sólo se vuelve a dibujar si llegaron datos nuevos (evita el bucle infinito cuando no hay datos)
  const antes=Object.keys(DOCS).length;
  setCargando(true);await cargarUnidades(falta);setCargando(false);
  if(Object.keys(DOCS).length>antes)renderView(v);}
function setCargando(on){const b=document.getElementById('srcBadge');if(on){b.className='src-badge src-demo';b.textContent='● cargando datos…';}else updBadge();}

/* ---- UI helpers ---- */
function fmt(z){return (z===null||z===undefined)?'—':(z>=0?'+':'')+z.toFixed(2);}
function setText(sel,t){document.querySelectorAll(sel).forEach(e=>e.textContent=t);}
/* ---- Ventana de análisis (2026-11-04) ----
   SPI/SPEI-k al día D del mes M = meses completos M-k+1 … M-1 + el mes M hasta el día D,
   comparado con la misma ventana (mismo día) de cada año 1991–2020. */
function ventanaTxt(scale,y,m,d){let m0=m-scale+1,y0=y;while(m0<1){m0+=12;y0--;}
  return '1 '+MSHORT[m0-1]+(y0!==y?' '+y0:'')+' – '+d+' '+MSHORT[m-1]+' '+y;}
function fechaTxt(a){return a.d+' '+MSHORT[a.m-1]+' '+CUR_YEAR;}
// Fecha común para comparar fuentes: la más temprana entre las últimas fechas con dato real
function fechaComun(uid){let best=null;Object.keys(SOURCES).forEach(src=>{if(!isReal(uid,src))return;const a=asOfOf(uid,src);if(!a)return;
  if(!best||a.m<best.m||(a.m===best.m&&a.d<best.d))best={m:a.m,d:a.d};});return best||{m:LAST_MONTH,d:LAST_DAY};}
function paint(cardId,labId,valId,prefix,z){const card=document.getElementById(cardId);
  if(z===null){card.style.background='var(--normal)';document.getElementById(labId).textContent='SIN DATO';
    document.getElementById(valId).textContent=prefix+': —';return;}
  const al=I.alertLevel(z),cl=I.classify(z);card.style.background=cl.color;
  document.getElementById(labId).textContent=cl.cls;
  document.getElementById(valId).textContent=prefix+': '+fmt(z)+(al.t!=='NORMAL'?' · '+al.t:'');}
function updBadge(){const b=document.getElementById('srcBadge');
  if(!isReal(curUnit,curSrc)){b.className='src-badge src-demo';b.textContent='● MODO DEMO';b.title='Esta fuente no cargó datos reales';return;}
  b.className='src-badge src-real';
  b.textContent=ORIGEN==='firestore'?'● EN LÍNEA · BASE DE DATOS':'● DATOS DE RESPALDO';
  b.title=ORIGEN==='firestore'?('Datos leídos de Firestore ('+LECTURAS+' lecturas en esta visita)'):'Firestore no respondió: se usan los datos de respaldo publicados con la web';}

function fillUnitSel(){const sel=document.getElementById('unitSel');sel.innerHTML='';
  const m=GEO.municipios[curMuni];
  sel.insertAdjacentHTML('beforeend','<option value="'+curMuni+'">Municipio completo · '+m.area_km2.toFixed(0)+' km²</option>');
  const og=document.createElement('optgroup');og.label='Subcuencas con influencia';
  subsOf(curMuni).forEach(id=>{const u=UNITS[id];const o=document.createElement('option');o.value=id;
    o.textContent=u.short+' ('+id+') · '+u.area.toFixed(1)+' km² · '+u.pctIn.toFixed(0)+'% en muni.';og.appendChild(o);});
  sel.appendChild(og);sel.value=curUnit;}

function unitStripHTML(){const u=UNITS[curUnit],m=GEO.municipios[u.muni];
  const pw=u.wPower.map(w=>w[0].toFixed(1)+'°N '+Math.abs(w[1]).toFixed(3)+'°O ('+Math.round(w[2]*100)+'%)').join(' + ');
  let h='<span class="utype'+(u.tipo==='subcuenca'?' sub':'')+'">'+(u.tipo==='subcuenca'?'Subcuenca':'Municipio')+'</span>'+
    '<span><b>'+(u.tipo==='subcuenca'?u.short+' · '+u.id:m.nombre+' · '+m.depto)+'</b></span>'+
    '<span>Área: <b>'+u.area.toFixed(1)+' km²</b></span>';
  if(u.tipo==='subcuenca')h+='<span>Dentro de '+m.nombre+': <b>'+u.pctIn.toFixed(0)+'%</b> ('+u.areaIn.toFixed(1)+' km², '+u.pctMuni.toFixed(1)+'% del muni.)</span>';
  else h+='<span>Subcuencas: <b>'+subsOf(u.muni).length+'</b> · cubren <b>'+m.cobertura_subcuencas_pct+'%</b> del municipio</span>';
  h+='<span>Píxeles CHIRPS efectivos: <b>'+u.pixEf+'</b></span><span>Celda(s) POWER: <b>'+pw+'</b></span>';
  return h;}
// Estación seca del Corredor Seco (dic–abr): SPI/SPEI-1 y -3 son referenciales (Bloque 2).
function estacionSeca(m){return m===12||m<=4;}
function unitWarnHTML(){const u=UNITS[curUnit],w=[];
  if(u.tipo==='subcuenca'&&u.pixEf<1.5)w.push('<b>Subcuenca menor que un píxel CHIRPS</b> (≈29 km²): su serie es prácticamente la del píxel que la contiene y puede coincidir con la de subcuencas vecinas. Úsese como indicador local, no como diferencia real entre subcuencas.');
  if(u.tipo==='subcuenca'&&u.pctIn<20)w.push('<b>Solo el '+u.pctIn.toFixed(0)+'% de esta subcuenca está dentro del municipio</b>: representa sobre todo el área aguas arriba/vecina que influye en él.');
  if(u.tipo==='subcuenca'&&u.area>300)w.push('<b>Subcuenca muy extensa ('+u.area.toFixed(0)+' km²)</b>: su promedio está dominado por zonas lejanas al municipio.');
  if(u.tipo==='municipio'&&u.cobertura<95)w.push('Las subcuencas entregadas cubren el <b>'+u.cobertura+'%</b> del municipio; el resto no pertenece a ninguna subcuenca del archivo (revisar delimitación).');
  if(curSrc==='power')w.push('NASA POWER tiene celdas de ≈55 × 68 km: los tres municipios caen en la misma celda, así que POWER no distingue entre ellos ni entre la mayoría de subcuencas.');
  if(curSrc==='imerg')w.push('IMERG (satélite GPM, píxel 0.1° ≈ 120 km², más grueso que CHIRPS) inicia en junio de 2000: su periodo de referencia para SPI/SPEI es <b>2001–2020</b> (20 años), más corto que el 1991–2020 de CHIRPS. Compárese con cautela.');
  if(curSrc==='chirps'&&esPreliminar(curUnit,'chirps',{m:LAST_MONTH,d:LAST_DAY})){const fi=idxDate(chirpsFinalIdx(curUnit));
    w.push('Los días posteriores al <b>'+fi.d+' '+MESES[fi.m-1]+' '+fi.y+'</b> son <b>CHIRPS preliminar</b> (latencia ≈ 2–5 días). Se reemplazan automáticamente por CHIRPS final cuando éste se publica (≈ 4–6 semanas).');}
  if(estacionSeca(LAST_MONTH))w.push('<b>Estación seca ('+MESES[LAST_MONTH-1]+')</b>: la lluvia normal es casi nula, por eso el SPI y el SPEI a 1 y 3 meses quedan acotados y son solo <b>referenciales</b>. Para vigilar la sequía en esta época use las escalas de 6 y 12 meses y el CDD.');
  if(!isReal(curUnit,curSrc))w.push('Esta fuente no cargó datos reales (sin conexión a la base de datos ni al respaldo): se muestran valores <b>demostrativos</b>.');
  return w.map(x=>'<div class="warn">⚠ '+x+'</div>').join('');}

function refreshAll(){
  MEMO.clear();
  computeAsOf(curUnit,curSrc);
  const u=UNITS[curUnit],m=GEO.municipios[u.muni];
  setText('.uName',u.tipo==='subcuenca'?u.short+' ('+u.id+') · '+m.nombre:m.nombre+' (municipio completo)');
  setText('.mName',m.nombre);setText('.sName',SOURCES[curSrc].name);
  document.getElementById('unitStrip').innerHTML=unitStripHTML();
  document.getElementById('unitWarn').innerHTML=unitWarnHTML();
  const asof=LAST_DAY+' '+MESES[LAST_MONTH-1]+' '+CUR_YEAR;
  const pre=esPreliminar(curUnit,curSrc,{m:LAST_MONTH,d:LAST_DAY})?' <span class="pill" style="background:#2980b9">preliminar</span>':'';
  document.getElementById('inicioSub').innerHTML='Fuente activa: <b>'+SOURCES[curSrc].name+'</b> · datos al <b>'+asof+'</b>'+pre+' · promedio sobre el polígono. Semáforo SAAT según SPEI-3 (McKee 1993).'+
    '<br><span class="winline">Ventana SPEI-3 / SPI-3: <b>'+ventanaTxt(3,CUR_YEAR,LAST_MONTH,LAST_DAY)+'</b> comparada con la misma ventana de 1991–2020. Cada fuente se evalúa hasta su propia última fecha; para compararlas en la misma fecha use la pestaña <b>Comparativa fuentes</b>.</span>';
  paint('statusSpei','speiLabel','speiVal','SPEI-3',speiAt(curUnit,curSrc,3,CUR_YEAR,LAST_MONTH,LAST_DAY));
  paint('statusSpi','spiLabel','spiValTxt','SPI-3',spiAt(curUnit,curSrc,3,CUR_YEAR,LAST_MONTH,LAST_DAY));
  const rain=ytdRain(curUnit,curSrc),normal=ytdNormal(curUnit,curSrc);
  const lastFull=(LAST_DAY>=daysInMonth(CUR_YEAR,LAST_MONTH))?LAST_MONTH:LAST_MONTH-1;
  let below=0;for(let mm=1;mm<=lastFull;mm++){const o=sumMonth(curUnit,curSrc,CUR_YEAR,mm),nn=normalMonth(curUnit,curSrc,mm);if(o!==null&&nn!==null&&o<nn)below++;}
  document.getElementById('kpiRain').textContent=Math.round(rain);
  document.getElementById('kpiDef').textContent=normal?((rain/normal-1)*100>=0?'+':'')+Math.round((rain/normal-1)*100)+'%':'—';
  const nf=v=>Math.round(v).toLocaleString('es-HN');
  document.getElementById('kpiRainSub').textContent='1 '+MSHORT[0]+' – '+asof;
  document.getElementById('kpiDefMm').textContent=normal?((rain-normal)>=0?'+':'−')+nf(Math.abs(rain-normal))+' mm':'';
  document.getElementById('kpiDefSub').innerHTML=normal?'Normal 1991–2020 al '+LAST_DAY+' '+MSHORT[LAST_MONTH-1]+': <b>'+nf(normal)+' mm</b>':'';
  const ca=cddActual(curUnit,curSrc),ct=cddTemporada(curUnit,curSrc),hc=histCDD(curUnit,curSrc);
  document.getElementById('kpiCdd').textContent=ca;
  document.getElementById('kpiCddLbl').textContent='Racha seca actual (días secos consecutivos al '+LAST_DAY+' '+MSHORT[LAST_MONTH-1]+')';
  document.getElementById('kpiCddSub').innerHTML=cddFueraTemporada(LAST_MONTH)?'Estación seca (dic–mar): racha larga esperada, solo referencial':
    'Racha máx. temporada abr–nov '+CUR_YEAR+': <b>'+ct.max+' d</b> · prom. hist. 1991–2020: '+hc.avg.toFixed(1)+' d';
  document.getElementById('kpiBelow').textContent=below+' / '+lastFull;
  updBadge();
  const v=document.querySelector('.view.active').id;renderView(v);
}
// Render perezoso: sólo la pestaña visible (las demás se recalculan al abrirse)
function renderView(v){asegurarVista(v);try{
  if(v==='mapa')updateMap();
  else if(v==='subcuencas')renderSubs();
  else if(v==='indices')renderIdx();
  else if(v==='comparativa')renderCmp();
  else if(v==='dashboard')renderDash();
  else if(v==='alertas')renderAlerts();}catch(e){console.error('render '+v,e);}}

/* ---- Escala OMM (McKee et al. 1993) ---- */
const ESCALA=[{rng:'≥ 2.0',cls:'Extremadamente húmedo',color:'#5dade2'},{rng:'1.5 a 1.99',cls:'Muy húmedo',color:'#2ecc71'},
  {rng:'1.0 a 1.49',cls:'Moderadamente húmedo',color:'#58d68d'},{rng:'−0.99 a 0.99',cls:'Condiciones normales',color:'#7f8c8d'},
  {rng:'−1.0 a −1.49',cls:'Sequía moderada',color:'#f39c12'},{rng:'−1.5 a −1.99',cls:'Sequía severa',color:'#e74c3c'},
  {rng:'≤ −2.0',cls:'Sequía extrema',color:'#c0392b'}];
function escalaHTML(activeCls){
  return '<div class="card" style="margin:0"><div style="font-size:.72rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:700;margin-bottom:8px">Escala OMM · McKee et al. (1993)</div>'+
    ESCALA.map(s=>{const on=activeCls&&activeCls.toLowerCase()===s.cls.toLowerCase();
      return '<div style="display:flex;align-items:center;gap:8px;padding:3px 6px;border-radius:6px;'+(on?'background:#eef4ec;':'')+'">'+
        '<div style="width:74px;text-align:right;font-size:.72rem;color:var(--muted);flex-shrink:0;font-variant-numeric:tabular-nums">'+s.rng+'</div>'+
        '<div style="width:11px;height:11px;border-radius:50%;background:'+s.color+';flex-shrink:0;'+(on?'box-shadow:0 0 0 3px '+s.color+'44;':'')+'"></div>'+
        '<div style="font-size:.82rem;color:'+s.color+';font-weight:'+(on?'800':'500')+'">'+s.cls+(on?' ◄':'')+'</div></div>';}).join('')+'</div>';}

/* ---- Panel CDD estilo SIMGER ---- */
function renderCDDPanel(uid,src){
  const cdd=computeCDD(uid,src),hist=histCDD(uid,src),mch=monthlyMaxCDDHist(uid,src,LAST_MONTH);
  const cls=cddClassify(cdd.currentStreak);
  // La racha máxima se mide en la temporada abr–nov, igual que el promedio histórico con que se compara
  const tmp=cddTemporada(uid,src),tMax=tmp.max===null?0:tmp.max;
  const vsAvg=tMax-hist.avg,vsCol=vsAvg>0?'#e74c3c':'#2ecc71',vsSign=vsAvg>=0?'+':'';
  const maxInfo=tmp.max===null?'temporada abr–nov aún no inicia':(tmp.start&&tmp.end)?(MSHORT[tmp.start.m-1]+' '+tmp.start.d+' – '+MSHORT[tmp.end.m-1]+' '+tmp.end.d):'—';
  const secaTxt=cdd.maxStreak>tMax&&cdd.maxStart?'<div style="font-size:.68rem;color:var(--muted);margin-top:6px">Estación seca (ene–mar): '+cdd.maxStreak+' d, '+MSHORT[cdd.maxStart.m-1]+' '+cdd.maxStart.d+' – '+MSHORT[cdd.maxEnd.m-1]+' '+cdd.maxEnd.d+' (normal en esa época)</div>':'';
  const card=(border,inner)=>'<div class="card" style="margin:0;text-align:center;border:1.5px solid '+border+'">'+inner+'</div>';
  const lab=t=>'<div style="font-size:.68rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:6px">'+t+'</div>';
  let h='<div style="font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:10px">Días Secos Consecutivos (CDD) · OMM/ETCCDI · Umbral &lt;1 mm · Fuente '+SOURCES[src].name+'</div>';
  h+='<div class="grid g3" style="margin-bottom:14px">';
  h+=card(cls.border,lab('Racha seca actual')+'<div style="font-size:2.6rem;font-weight:900;color:'+cls.color+';line-height:1">'+cdd.currentStreak+'</div>'+
    '<div style="font-size:.76rem;color:var(--muted);margin-top:4px">días consecutivos</div>'+
    '<div style="display:inline-block;font-size:.72rem;font-weight:700;color:'+cls.color+';margin-top:8px;padding:3px 12px;border:1px solid '+cls.border+';border-radius:20px">'+cls.label+'</div>');
  h+=card('#f7d98f',lab('Racha máx. temporada abr–nov '+CUR_YEAR)+'<div style="font-size:2.6rem;font-weight:900;color:#c9a200;line-height:1">'+(tmp.max===null?'—':tmp.max)+'</div>'+
    '<div style="font-size:.76rem;color:var(--muted);margin-top:4px">días consecutivos</div><div style="font-size:.72rem;color:var(--muted);margin-top:8px">'+maxInfo+'</div>'+secaTxt);
  h+=card('#a9cdeb',lab('Prom. histórico CDD')+'<div style="font-size:2.6rem;font-weight:900;color:#2980b9;line-height:1">'+hist.avg.toFixed(1)+'</div>'+
    '<div style="font-size:.76rem;color:var(--muted);margin-top:4px">días máx. prom. Abr–Nov (1991–2020)</div>'+
    '<div style="font-size:.72rem;font-weight:700;color:'+vsCol+';margin-top:6px">'+vsSign+vsAvg.toFixed(1)+' vs prom. · máx. hist: '+hist.maxHist+' d</div>'+
    '<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--line)"><div style="font-size:.68rem;color:var(--muted);letter-spacing:.06em">RACHA MÁX. PROM. EN '+MSHORT[LAST_MONTH-1].toUpperCase()+'</div>'+
    '<div style="font-size:1.3rem;font-weight:800;color:#2980b9">'+mch.avg.toFixed(1)+' d</div><div style="font-size:.68rem;color:var(--muted)">máx. hist: '+mch.max+' d · (1991–2020)</div></div>');
  h+='</div>';
  const dw=monthlyDryWet(uid,src);
  h+='<div class="grid g2" style="margin-bottom:14px">';
  h+=card('#f2b3ac',lab('☀ Días secos · '+dw.name)+'<div style="font-size:2.2rem;font-weight:900;color:#e74c3c;line-height:1">'+dw.dry26+'</div>'+
    '<div style="font-size:.76rem;color:var(--muted);margin-top:4px">días sin lluvia en '+dw.name+' '+CUR_YEAR+' (días 1–'+dw.curDay+')</div>'+
    '<div style="font-size:.74rem;color:var(--muted);margin-top:6px">Prom. hist. mes completo: <b style="color:#2980b9">'+dw.dryH.toFixed(1)+' días</b> de '+dw.fullMonthDays+'</div>');
  h+=card('#bfe6cb',lab('🌧 Días lluvia · '+dw.name)+'<div style="font-size:2.2rem;font-weight:900;color:#27ae60;line-height:1">'+dw.wet26+'</div>'+
    '<div style="font-size:.76rem;color:var(--muted);margin-top:4px">días con lluvia en '+dw.name+' '+CUR_YEAR+' (días 1–'+dw.curDay+')</div>'+
    '<div style="font-size:.74rem;color:var(--muted);margin-top:6px">Prom. hist. mes completo: <b style="color:#27ae60">'+dw.wetH.toFixed(1)+' días</b> de '+dw.fullMonthDays+'</div>');
  h+='</div>';
  const dp=cdd.totalDays?(cdd.dryDays/cdd.totalDays*100).toFixed(1):'0',wp=cdd.totalDays?(cdd.wetDays/cdd.totalDays*100).toFixed(1):'0';
  h+='<div style="display:flex;flex-wrap:wrap;gap:18px;margin-bottom:12px;padding:10px 14px;background:#f3f9ee;border-radius:8px;font-size:.8rem;color:var(--muted)">'+
    '<div>Registros: <b style="color:var(--ink)">'+cdd.totalDays+' días</b></div><div>Secos (&lt;1mm): <b style="color:#e74c3c">'+cdd.dryDays+' ('+dp+'%)</b></div>'+
    '<div>Lluviosos (≥1mm): <b style="color:#27ae60">'+cdd.wetDays+' ('+wp+'%)</b></div><div>Percentil 90 hist: <b style="color:#2980b9">'+hist.p90+' días</b></div></div>';
  h+='<div style="font-size:.7rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:8px">Mapa de días · '+CUR_YEAR+' · rojo=seco &lt;1mm · verde=lluvia ≥1mm</div>';
  const byMonth={};cdd.days.forEach(d=>{(byMonth[d.m]=byMonth[d.m]||[]).push(d);});
  const streakSet={};if(cdd.currentStreak>0)cdd.days.slice(-cdd.currentStreak).forEach(d=>streakSet[d.m+'-'+d.d]=true);
  h+='<div style="overflow-x:auto"><div style="display:flex;flex-direction:column;gap:4px;min-width:520px">';
  for(let m=1;m<=LAST_MONTH;m++){const md=byMonth[m];if(!md)continue;
    h+='<div style="display:flex;align-items:center;gap:6px"><div style="width:26px;font-size:.72rem;color:var(--muted);text-align:right;flex-shrink:0">'+MSHORT[m-1]+'</div><div style="display:flex;gap:2px;flex-wrap:wrap">';
    md.forEach(day=>{const dry=day.val<1;let col;if(dry)col='#c0392b';else{const it=Math.min(day.val/40,1);
        col='rgb('+Math.round(39+7*(1-it))+','+Math.round(174+30*(1-it))+','+Math.round(96+17*(1-it))+')';}
      const ol=streakSet[day.m+'-'+day.d]?';outline:2px solid rgba(231,76,60,.85);outline-offset:1px':'';
      h+='<div title="'+MSHORT[day.m-1]+' '+day.d+': '+day.val.toFixed(1)+'mm" style="width:10px;height:16px;background:'+col+';border-radius:2px'+ol+'"></div>';});
    h+='</div></div>';}
  h+='</div></div>';
  h+='<div style="display:flex;gap:16px;margin-top:10px;flex-wrap:wrap;font-size:.72rem;color:var(--muted)">'+
    '<div><span style="display:inline-block;width:11px;height:16px;background:#c0392b;border-radius:2px;vertical-align:-3px;margin-right:5px"></span>Seco (0–0.9mm)</div>'+
    '<div><span style="display:inline-block;width:11px;height:16px;background:rgb(39,174,96);border-radius:2px;vertical-align:-3px;margin-right:5px"></span>Lluvia leve</div>'+
    '<div><span style="display:inline-block;width:11px;height:16px;background:rgb(46,204,113);border-radius:2px;vertical-align:-3px;margin-right:5px"></span>Lluvia intensa (≥40mm)</div>'+
    '<div><span style="display:inline-block;width:11px;height:16px;background:#c0392b;border-radius:2px;outline:2px solid rgba(231,76,60,.85);outline-offset:1px;vertical-align:-3px;margin-right:5px"></span>Racha seca actual</div></div>';
  return h;}

/* ---- Pestaña Índices ---- */
let curIdx='spei',curScale=3;
function renderIdx(){
  const box=document.getElementById('idxResult'),isCdd=curIdx==='cdd';
  document.getElementById('scaleRow').style.display=isCdd?'none':'flex';
  const note=document.getElementById('idxNote');
  if(isCdd){box.innerHTML=renderCDDPanel(curUnit,curSrc);
    note.textContent='Metodología CDD replicada del dashboard SIMGER/AMDC. Barras: racha máx. anual (Abr–Nov).';
    const labels=[],data=[],cols=[];for(let y=REF_START;y<=CUR_YEAR;y++){labels.push(y);const mx=cddMaxYear(curUnit,curSrc,y);data.push(mx);cols.push(cddColor(mx));}
    drawChart('idxChart','bar',labels,[{label:'Racha máx. CDD Abr–Nov (días)',data:data,backgroundColor:cols,borderRadius:3}],false);return;}
  const fn=curIdx==='spei'?speiAt:spiAt;
  const z=fn(curUnit,curSrc,curScale,CUR_YEAR,LAST_MONTH,LAST_DAY);
  const nm=curIdx.toUpperCase()+'-'+curScale;
  const cl=z===null?null:I.classify(z),al=z===null?null:I.alertLevel(z);const asof=LAST_DAY+' '+MESES[LAST_MONTH-1];
  const statusCard=z===null?'<div class="status-card" style="background:var(--normal)"><div class="lab">'+nm+'</div><div class="big">Sin dato suficiente</div></div>'
    :'<div class="status-card" style="background:'+cl.color+'"><div class="lab">'+nm+' · '+SOURCES[curSrc].name+' · al '+asof+'</div><div class="big">'+fmt(z)+'</div><div class="spi">'+cl.cls+(al.t!=='NORMAL'?' · '+al.t:'')+'</div><div class="lab" style="margin-top:6px">Ventana: '+ventanaTxt(curScale,CUR_YEAR,LAST_MONTH,LAST_DAY)+'</div></div>';
  box.innerHTML='<div class="grid g2" style="align-items:start">'+statusCard+escalaHTML(cl?cl.cls:null)+'</div>';
  note.textContent=(curIdx==='spei'?'SPEI = balance P − PET, log-logística (Vicente-Serrano et al. 2010).':'SPI = precipitación, ajuste Gamma (McKee 1993).')+' Mes en curso día-preciso (al '+asof+' vs. mismo día del histórico). Serie areal del polígono.'
    +(curScale<=3?' En la estación seca (dic–abr) las escalas de 1 y 3 meses son solo referenciales: allí use 6 o 12 meses.':'')
    +(curIdx==='spei'?' Si la log-logística no ajusta bien a un mes calendario, ese mes se estandariza con la distribución empírica (Gringorten).':'');
  const labels=[],data=[],cols=[];
  for(let m=1;m<=LAST_MONTH;m++){const ed=(m===LAST_MONTH)?LAST_DAY:daysInMonth(CUR_YEAR,m);const v=fn(curUnit,curSrc,curScale,CUR_YEAR,m,ed);
    labels.push(MESES[m-1]);data.push(v);cols.push(v===null?'#ccc':I.classify(v).color);}
  drawChart('idxChart','bar',labels,[{label:nm,data:data,backgroundColor:cols,borderRadius:3}],true);}

/* ---- Pestaña Comparativa ---- */
let cmpIdx='spei',cmpScale=3;
function renderCmp(){
  const isCdd=cmpIdx==='cdd';document.getElementById('cmpScaleRow').style.display=isCdd?'none':'flex';
  const labels=[],ds=[],tbody=document.getElementById('cmpTable');tbody.innerHTML='';const hdr=document.getElementById('cmpColHdr');
  const tag=src=>isReal(curUnit,src)?'':' <span class="tag">(demo)</span>';
  if(isCdd){for(let y=REF_START;y<=CUR_YEAR;y++)labels.push(y);
    Object.keys(SOURCES).forEach(src=>{ds.push({label:SOURCES[src].name,data:labels.map(y=>cddMaxYear(curUnit,src,y)),borderColor:SOURCES[src].color,backgroundColor:SOURCES[src].color+'22',tension:.25,pointRadius:0});});
    hdr.textContent='Racha seca máx. abr–nov '+CUR_YEAR+' (días)';
    document.getElementById('cmpWin').innerHTML='CDD: racha seca máxima de abril a noviembre de cada año; en '+CUR_YEAR+' cada fuente llega hasta su último dato (columna derecha).';
    Object.keys(SOURCES).forEach(src=>{const v=cddMaxYear(curUnit,src,CUR_YEAR);
      tbody.insertAdjacentHTML('beforeend','<tr><td><b>'+SOURCES[src].name+'</b>'+tag(src)+'</td><td>'+v+' días</td><td>'+(v>30?'racha seca larga':v>20?'racha seca moderada':'racha seca corta')+'</td><td style="color:var(--muted)">'+(asOfOf(curUnit,src)?fechaTxt(asOfOf(curUnit,src)):'—')+'</td></tr>');});
    drawLine('cmpChart',labels,ds,'CDD (días)');return;}
  const fn=cmpIdx==='spei'?speiAt:spiAt;
  // Todas las fuentes a la MISMA fecha (la más temprana de sus últimos datos) y misma ventana
  const fc=fechaComun(curUnit),last={};Object.keys(SOURCES).forEach(src=>{last[src]=asOfOf(curUnit,src);});
  const aof={};Object.keys(SOURCES).forEach(src=>{aof[src]=fc;});const maxM=fc.m;
  for(let m=1;m<=maxM;m++)labels.push(MESES[m-1]);
  Object.keys(SOURCES).forEach(src=>{const a=aof[src];const data=[];
    for(let m=1;m<=maxM;m++){if(m>a.m){data.push(null);continue;}const ed=(m===a.m)?a.d:daysInMonth(CUR_YEAR,m);data.push(fn(curUnit,src,cmpScale,CUR_YEAR,m,ed));}
    ds.push({label:SOURCES[src].name,data:data,borderColor:SOURCES[src].color,backgroundColor:SOURCES[src].color+'22',tension:.25,pointRadius:2,spanGaps:true});});
  hdr.textContent=cmpIdx.toUpperCase()+'-'+cmpScale+' al '+fechaTxt(fc);
  document.getElementById('cmpWin').innerHTML='<b>Fecha común: '+fechaTxt(fc)+'</b> · ventana '+cmpIdx.toUpperCase()+'-'+cmpScale+': <b>'+ventanaTxt(cmpScale,CUR_YEAR,fc.m,fc.d)+'</b> para las tres fuentes (la fecha más temprana entre sus últimos datos, para que la comparación sea pareja).';
  Object.keys(SOURCES).forEach(src=>{const a=aof[src];const v=fn(curUnit,src,cmpScale,CUR_YEAR,a.m,a.d);const cl=v===null?{cls:'—'}:I.classify(v);const l=last[src];
    tbody.insertAdjacentHTML('beforeend','<tr><td><b>'+SOURCES[src].name+'</b>'+tag(src)+'</td><td>'+fmt(v)+'</td><td>'+cl.cls+'</td><td style="color:var(--muted)">'+(l?fechaTxt(l):'—')+'</td></tr>');});
  drawLine('cmpChart',labels,ds,cmpIdx.toUpperCase()+'-'+cmpScale);}

/* ---- Dashboard ---- */
function renderDash(){
  const obs=m=>(m>LAST_MONTH)?null:((m===LAST_MONTH)?sumToDay(curUnit,curSrc,CUR_YEAR,m,LAST_DAY):sumMonth(curUnit,curSrc,CUR_YEAR,m));
  const nrm=m=>(m===LAST_MONTH)?normalToDay(curUnit,curSrc,m,LAST_DAY):normalMonth(curUnit,curSrc,m);
  const anom=[],cols=[];
  for(let m=1;m<=12;m++){const o=obs(m),nn=nrm(m);const a=(o!==null&&nn)?((o/nn-1)*100):null;anom.push(a===null?null:Math.round(a));cols.push(a===null?'#ccc':(a<0?'#e74c3c':'#58d68d'));}
  drawChart('anomChart','bar',MESES.slice(),[{label:'Anomalía %',data:anom,backgroundColor:cols,borderRadius:4}],false,true);
  const tb=document.querySelector('#dashTable tbody');tb.innerHTML='';
  for(let m=1;m<=12;m++){const o=obs(m),nn=nrm(m);const oT=o!==null?Math.round(o):'—',nT=nn!==null?Math.round(nn):'—';
    const a=(o!==null&&nn)?Math.round((o/nn-1)*100)+'%':'—';const col=(o!==null&&nn&&o<nn)?'color:#e74c3c;font-weight:700':'';
    tb.insertAdjacentHTML('beforeend','<tr><td>'+MESES[m-1]+(m===LAST_MONTH?' (al '+LAST_DAY+')':'')+'</td><td>'+oT+'</td><td>'+nT+'</td><td style="'+col+'">'+a+'</td></tr>');}}

/* ---- Exportación CSV ---- */
function download(name,text){const b=new Blob(['﻿'+text],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');
  a.href=URL.createObjectURL(b);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},500);}
function csvName(kind){return 'SAAT_v3_'+curUnit+'_'+kind+'_'+new Date().toISOString().slice(0,10)+'.csv';}
function exportMonthly(){const srcs=Object.keys(SOURCES);
  let t='# SAAT Sequías v3 · '+UNITS[curUnit].name+' · lluvia mensual areal (mm) y PET Hargreaves (mm)\n';
  t+='# fuentes reales: '+srcs.filter(s=>isReal(curUnit,s)).join(', ')+' · demo: '+(srcs.filter(s=>!isReal(curUnit,s)).join(', ')||'ninguna')+'\n';
  t+='anio,mes,'+srcs.map(s=>s+'_mm').join(',')+',pet_mm\n';
  for(let y=Y0;y<=CUR_YEAR;y++)for(let m=1;m<=12;m++){const vals=srcs.map(s=>{const a=series(curUnit,s),i0=dIdx(y,m,1),nd=daysInMonth(y,m);
      let t2=0;for(let d=0;d<nd;d++){const v=a[i0+d];if(v===undefined||Number.isNaN(v))return '';t2+=v;}return t2.toFixed(1);});
    const pet=getPET(curUnit,y,m);if(vals.every(v=>v==='')&&pet===null)continue;
    t+=y+','+m+','+vals.join(',')+','+(pet===null?'':pet.toFixed(1))+'\n';}
  download(csvName('mensual'),t);}
function exportDaily(){const srcs=Object.keys(SOURCES);
  let t='# SAAT Sequías v3 · '+UNITS[curUnit].name+' · lluvia diaria areal (mm)\nfecha,'+srcs.map(s=>s+'_mm').join(',')+'\n';
  const arrs=srcs.map(s=>series(curUnit,s));
  for(let i=0;i<=DEMO_LAST;i++){const v=arrs.map(a=>Number.isNaN(a[i])?'':a[i].toFixed(1));if(v.every(x=>x===''))continue;
    const d=idxDate(i);t+=d.y+'-'+String(d.m).padStart(2,'0')+'-'+String(d.d).padStart(2,'0')+','+v.join(',')+'\n';}
  download(csvName('diario'),t);}

/* ---- Pestaña Subcuencas ---- */
// Valor de SPEI/SPI a 3, 6 o 12 meses para una unidad (r = unitNow). Si el resumen
// precalculado no trae esa escala, se calcula en el navegador a la misma fecha.
function serieLista(id){return curSrc==='power'?powerReadyFor(id):tieneDoc(curSrc+'__'+id);}
function idxOf(id,r,idx,scale){const key=idx+(scale===3?'':scale);let z=r[key];
  if(z===undefined)z=serieLista(id)?(idx==='spei'?speiAt:spiAt)(id,curSrc,scale,CUR_YEAR,r.asof.m,r.asof.d):null;
  return z===undefined?null:z;}
// CDD operativo: racha actual (cddAct) y racha máx. de la temporada abr–nov (cddTemp)
function cddOf(id,r,key){let v=r[key];
  if(v===undefined)v=serieLista(id)?(key==='cddAct'?cddActual(id,curSrc):cddTemporada(id,curSrc).max):null;
  return v===undefined?null:v;}
function cddTxt(v){return v===null||v===undefined?'—':v+' d';}
function idxCell(z){if(z===null||z===undefined)return '<td class="num">—</td>';
  const c=I.classify(z);return '<td class="num" title="'+c.cls+'"><span class="idot" style="background:'+c.color+'"></span>'+fmt(z)+'</td>';}
let subIdx='spei',subScale=3;
function renderSubs(){
  const m=GEO.municipios[curMuni],ids=subsOf(curMuni);
  const all=GEO.subcuencas[curMuni]||[],ast=all.filter(s=>s.astilla);
  document.getElementById('subSub').innerHTML=ids.length+' subcuencas analizables · cubren el <b>'+m.cobertura_subcuencas_pct+'%</b> del municipio ('+m.area_km2+' km²) · fuente <b>'+SOURCES[curSrc].name+'</b>'+(ast.length?' · '+ast.length+' polígono(s) excluido(s) por tener &lt;0.1 km² dentro del municipio':'');
  const rows=[unitNow(curMuni,curSrc)].concat(ids.map(id=>unitNow(id,curSrc)));
  const tb=document.querySelector('#subTable tbody');tb.innerHTML='';
  [curMuni].concat(ids).forEach((id,k)=>{const u=UNITS[id],r=rows[k];const al=r.spei===null?{t:'SIN DATO',c:'#7f8c8d'}:I.alertLevel(r.spei);
    const isM=u.tipo==='municipio';
    tb.insertAdjacentHTML('beforeend','<tr data-u="'+id+'" class="'+(id===curUnit?'cur':'')+'"><td>'+(isM?'<b>MUNICIPIO</b>':id)+'</td><td>'+(isM?m.nombre+' (completo)':u.short)+'</td>'+
      '<td class="num">'+u.area.toFixed(2)+'</td><td class="num">'+(isM?'100':u.pctIn.toFixed(1))+'</td><td class="num">'+(isM?'100':u.pctMuni.toFixed(1))+'</td>'+
      '<td class="num">'+u.pixEf+'</td>'+[3,6,12].map(s=>idxCell(idxOf(id,r,'spei',s))).join('')+[3,6,12].map(s=>idxCell(idxOf(id,r,'spi',s))).join('')+'<td class="num">'+cddTxt(cddOf(id,r,'cddAct'))+'</td><td class="num">'+cddTxt(cddOf(id,r,'cddTemp'))+'</td>'+
      '<td><span class="pill" style="background:'+al.c+'">'+al.t.replace('ALERTA ','')+'</span></td></tr>');});
  const a0=rows[0].asof;
  document.getElementById('subNote').innerHTML='Valores al '+a0.d+' '+MSHORT[a0.m-1]+' '+CUR_YEAR+' · ventanas: 3 meses '+ventanaTxt(3,CUR_YEAR,a0.m,a0.d)+' · 6 meses '+ventanaTxt(6,CUR_YEAR,a0.m,a0.d)+' · 12 meses '+ventanaTxt(12,CUR_YEAR,a0.m,a0.d)+'. “% dentro del muni.” = fracción del área de la subcuenca que cae dentro del límite municipal; “% del muni.” = fracción del municipio que ocupa. Subcuencas con “Píx. CHIRPS ef.” ≈ 1 son menores que un píxel: no interpretar diferencias pequeñas entre ellas. La columna Alerta usa SPEI-3 (semáforo SAAT); 6 y 12 meses muestran la sequía acumulada con los mismos umbrales.'+
    (estacionSeca(rows[0].asof.m)?' <b>Estación seca:</b> la escala de 3 meses es referencial; use 6 o 12.':'');
  // gráfico por subcuenca: índice y escala elegidos (SPEI/SPI · 3/6/12 meses)
  const nm=subIdx.toUpperCase()+'-'+subScale,zM=idxOf(curMuni,rows[0],subIdx,subScale);
  const labels=ids.map(id=>id.replace(/^[A-Z]+-/,'')),vals=ids.map((id,k)=>idxOf(id,rows[k+1],subIdx,subScale));
  document.getElementById('subChartTtl').textContent=nm+' por subcuenca · '+SOURCES[curSrc].name+' (línea discontinua = municipio completo '+fmt(zM)+')';
  if(typeof Chart!=='undefined'){if(CH.subChart)CH.subChart.destroy();
    CH.subChart=new Chart(document.getElementById('subChart'),{type:'bar',data:{labels:labels,datasets:[
      {label:nm,data:vals,backgroundColor:vals.map(v=>v===null?'#ccc':I.classify(v).color),borderRadius:3},
      {type:'line',label:'Municipio completo',data:ids.map(()=>zM),borderColor:'#1c2b22',borderDash:[6,4],pointRadius:0,borderWidth:1.5}]},
      options:{responsive:true,maintainAspectRatio:false,onClick:(e,els)=>{if(els.length)selectUnit(ids[els[0].index]);},
        plugins:{legend:{display:false},tooltip:{callbacks:{title:it=>UNITS[ids[it[0].dataIndex]].short+' ('+ids[it[0].dataIndex]+')'}}},
        scales:{y:{suggestedMin:-3,suggestedMax:1,grid:{color:c=>c.tick.value===0?'#999':'#eee'}}}}});}}

/* ---- Alertas ---- */
function renderAlerts(){
  const list=document.getElementById('alertList');list.innerHTML='';
  MUNI_ORDER.forEach(k=>{const m=GEO.municipios[k],r=unitNow(k,curSrc);
    const al=r.spei===null?{t:'SIN DATO',c:'#7f8c8d'}:I.alertLevel(r.spei);
    const cnt={};const subsH=subsOf(k).map(id=>{const s=unitNow(id,curSrc),a=s.spei===null?{t:'SIN DATO',c:'#7f8c8d'}:I.alertLevel(s.spei);
      cnt[a.t]=cnt[a.t]||{n:0,c:a.c};cnt[a.t].n++;
      return '<div class="alert-item" data-u="'+id+'" style="cursor:pointer"><span class="dot" style="background:'+a.c+';width:12px;height:12px;flex-basis:12px"></span>'+
        '<div class="b"><b style="font-size:.86rem">'+UNITS[id].short+' · '+id+'</b><span>'+UNITS[id].area.toFixed(1)+' km² · '+UNITS[id].pctIn.toFixed(0)+'% en muni. · SPEI-3 '+fmt(s.spei)+' · SPI-3 '+fmt(s.spi)+' · racha seca actual '+cddTxt(cddOf(id,s,'cddAct'))+'</span></div>'+
        '<span class="pill" style="background:'+a.c+'">'+a.t.replace('ALERTA ','')+'</span></div>';}).join('');
    const counts=Object.keys(cnt).map(t=>'<span style="background:'+cnt[t].c+'">'+cnt[t].n+' '+t.replace('ALERTA ','').toLowerCase()+'</span>').join('');
    list.insertAdjacentHTML('beforeend','<details class="muni-grp"'+(k===curMuni?' open':'')+'><summary><div class="alert-item" data-u="'+k+'"><span class="dot" style="background:'+al.c+'"></span>'+
      '<div class="b"><b>'+m.nombre+' · '+m.depto+' <span style="font-weight:400;color:var(--muted);font-size:.8rem">(municipio completo, '+m.area_km2+' km²)</span></b>'+
      '<span>SPEI-3: '+fmt(r.spei)+' · SPI-3: '+fmt(r.spi)+' · racha seca actual: '+cddTxt(cddOf(k,r,'cddAct'))+' · máx. abr–nov: '+cddTxt(cddOf(k,r,'cddTemp'))+' · al '+r.asof.d+' '+MSHORT[r.asof.m-1]+'</span>'+
      '<div class="counts">Subcuencas: '+counts+'</div></div><span class="pill" style="background:'+al.c+'">'+al.t+'</span></div></summary>'+
      '<div class="subs">'+subsH+'</div></details>');});}

/* ---- Charts ---- */
const CH={};
function drawChart(id,type,labels,datasets,zeroLine){if(typeof Chart==='undefined')return;if(CH[id])CH[id].destroy();
  CH[id]=new Chart(document.getElementById(id),{type:type,data:{labels:labels,datasets:datasets},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:datasets.length>1}},
      scales:{y:zeroLine?{suggestedMin:-3,suggestedMax:3,grid:{color:c=>c.tick.value===0?'#999':'#eee'}}:{beginAtZero:!zeroLine}}}});}
function drawLine(id,labels,datasets,yLabel){if(typeof Chart==='undefined')return;if(CH[id])CH[id].destroy();
  CH[id]=new Chart(document.getElementById(id),{type:'line',data:{labels:labels,datasets:datasets},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true,position:'top'}},scales:{y:{title:{display:true,text:yLabel}}}}});}

/* ===========================================================================
   Mapa: límites municipales + subcuencas (coropleta) + rejillas de fuentes
   =========================================================================== */
let map=null,lyMunis=null,lySubs=null,lyLabels=null,subLayerById={},muniLayerById={},mapIdx='spei',mapScale=3;
function initMap(){
  if(typeof L==='undefined'){document.getElementById('map').innerHTML='<div style="padding:24px;color:#5c6b62;font-size:.9rem">No se pudo cargar el mapa (sin conexión a Leaflet). Los índices y gráficos no dependen del mapa.</div>';return;}
  map=L.map('map',{scrollWheelZoom:false});
  const esri=a=>'https://server.arcgisonline.com/ArcGIS/rest/services/'+a+'/MapServer/tile/{z}/{y}/{x}';
  const bases={'Esri claro (gris)':L.tileLayer(esri('Canvas/World_Light_Gray_Base'),{maxZoom:16,attribution:'© Esri · HERE · Garmin'}),
    'Esri topográfico':L.tileLayer(esri('World_Topo_Map'),{maxZoom:19,attribution:'© Esri'}),
    'Esri satélite':L.tileLayer(esri('World_Imagery'),{maxZoom:19,attribution:'© Esri'}),
    'OpenStreetMap':L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}),
    'OpenTopoMap':L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',{subdomains:'abc',maxZoom:17,attribution:'© OpenTopoMap · © OpenStreetMap'})};
  bases['Esri claro (gris)'].addTo(map);
  map.createPane('subs');map.getPane('subs').style.zIndex=410;
  map.createPane('munis');map.getPane('munis').style.zIndex=420;map.getPane('munis').style.pointerEvents='none';
  map.createPane('grids');map.getPane('grids').style.zIndex=430;map.getPane('grids').style.pointerEvents='none';
  lySubs=L.layerGroup().addTo(map);lyLabels=L.layerGroup().addTo(map);
  lyMunis=L.layerGroup().addTo(map);
  MUNI_ORDER.forEach(k=>{const m=GEO.municipios[k];
    muniLayerById[k]=L.geoJSON({type:'Feature',geometry:m.geometry,properties:{}},{pane:'munis',interactive:false,
      style:{color:'#1c2b22',weight:2,fill:false,dashArray:null}}).addTo(lyMunis);});
  // Rejillas de resolución (opcionales)
  const gC=L.layerGroup(),gP=L.layerGroup();
  const seenC={};Object.values(UNITS).forEach(u=>u.wChirps.forEach(w=>{const k=w[0]+','+w[1];if(seenC[k])return;seenC[k]=1;
    L.rectangle([[w[0]-0.025,w[1]-0.025],[w[0]+0.025,w[1]+0.025]],{pane:'grids',color:'#2980b9',weight:.7,fill:false,interactive:false}).addTo(gC);}));
  const seenP={};Object.values(UNITS).forEach(u=>u.wPower.forEach(w=>{const k=w[0]+','+w[1];if(seenP[k])return;seenP[k]=1;
    L.rectangle([[w[0]-0.25,w[1]-0.3125],[w[0]+0.25,w[1]+0.3125]],{pane:'grids',color:'#e67e22',weight:2,dashArray:'6 4',fill:false,interactive:false}).addTo(gP);}));
  L.control.layers(bases,{'Subcuencas':lySubs,'Etiquetas subcuencas':lyLabels,'Límites municipales':lyMunis,
    'Rejilla CHIRPS 0.05° (≈5.4 km)':gC,'Celdas NASA POWER 0.5°×0.625°':gP},{position:'topright',collapsed:true}).addTo(map);
  L.control.scale({imperial:false,position:'bottomleft'}).addTo(map);
  drawSubLayer();
}
function drawSubLayer(){if(!map)return;
  lySubs.clearLayers();lyLabels.clearLayers();subLayerById={};
  (GEO.subcuencas[curMuni]||[]).forEach(s=>{
    const lyr=L.geoJSON({type:'Feature',geometry:s.geometry,properties:{}},{pane:'subs',
      style:{color:'#ffffff',weight:1,fillOpacity:s.astilla?0.2:0.72,fillColor:'#bbb'}});
    if(!s.astilla){lyr.on('click',()=>selectUnit(s.id));
      lyr.on('mouseover',e=>e.layer.setStyle({weight:3}));lyr.on('mouseout',()=>styleSubs());
      if(s.area_km2>=1.5){const c=s.centroide;L.marker([c[0],c[1]],{icon:L.divIcon({className:'lbl-sub',html:'H'+s.hydroid,iconSize:[30,12]}),interactive:false,pane:'grids'}).addTo(lyLabels);}}
    lyr.addTo(lySubs);subLayerById[s.id]=lyr;});
  pendingBounds=L.featureGroup(Object.values(subLayerById).concat([muniLayerById[curMuni]])).getBounds();
  fitIfVisible();}
// Leaflet no puede encuadrar un mapa oculto (tamaño 0): se encuadra al hacerse visible.
let pendingBounds=null;
function fitIfVisible(){if(!map||!pendingBounds)return;const el=document.getElementById('map');
  if(el.offsetWidth===0)return;map.invalidateSize();map.fitBounds(pendingBounds,{padding:[12,12]});pendingBounds=null;}
function valColor(id){const r=unitNow(id,curSrc);
  if(mapIdx==='cdd'){const v=cddOf(id,r,'cddAct');
    if(v===null)return {c:'#7f8c8d',v:'—',r:r};
    if(cddFueraTemporada(r.asof.m))return {c:'#bdc3c7',v:v+' días (estación seca)',r:r};
    return {c:cddClassify(v).color,v:v+' días',r:r};}
  // Escala elegida en el mapa (3, 6 o 12 meses). Si el resumen precalculado es anterior al
  // 2026-11-04 no trae 6/12: se calcula en el navegador con la serie de la unidad.
  const z=idxOf(id,r,mapIdx,mapScale);
  return {c:(z===null||z===undefined)?'#7f8c8d':I.alertLevel(z).c,v:fmt(z),r:r};}
function mapIdxLabel(){return mapIdx==='cdd'?'Racha seca actual':mapIdx.toUpperCase()+'-'+mapScale;}
function styleSubs(){
  Object.keys(subLayerById).forEach(id=>{const lyr=subLayerById[id];if(!UNITS[id])return;
    const vc=valColor(id),u=UNITS[id],sel=id===curUnit;
    lyr.setStyle({fillColor:vc.c,color:sel?'#A4CD39':'#ffffff',weight:sel?4:1,fillOpacity:.72});
    if(sel)lyr.bringToFront();
    lyr.unbindTooltip();lyr.bindTooltip('<b>'+u.short+' ('+id+')</b><br>'+u.area.toFixed(1)+' km² · '+u.pctIn.toFixed(0)+'% dentro del municipio<br>'+
      mapIdxLabel()+': <b>'+vc.v+'</b> · '+SOURCES[curSrc].name,{sticky:true});});
  MUNI_ORDER.forEach(k=>muniLayerById[k].setStyle({color:k===curMuni?(curUnit===curMuni?'#A4CD39':'#1c2b22'):'#6b7c72',weight:k===curMuni?(curUnit===curMuni?5:2.5):1.5,dashArray:k===curMuni?null:'4 4'}));}
function updateMap(){if(!map)return;map.invalidateSize();fitIfVisible();
  document.getElementById('mapScaleSeg').style.display=mapIdx==='cdd'?'none':'inline-flex';styleSubs();
  const lg=document.getElementById('mapLegend');
  if(mapIdx==='cdd'){const cc=d=>cddClassify(d).color,a=asOfOf(curMuni,curSrc)||{m:LAST_MONTH,d:LAST_DAY};
    lg.innerHTML='<b style="color:#5c6b62">Racha seca actual (días consecutivos con P &lt; 1 mm al '+a.d+' '+MSHORT[a.m-1]+', criterio SIMGER):</b><span><i style="background:'+cc(0)+'"></i>0 · sin racha</span><span><i style="background:'+cc(1)+'"></i>1–4 leve</span><span><i style="background:'+cc(5)+'"></i>5–9 moderada</span><span><i style="background:'+cc(10)+'"></i>10–14 severa</span><span><i style="background:'+cc(15)+'"></i>≥ 15 extrema</span>'+
      (cddFueraTemporada(a.m)?'<span style="color:#b9770e">⚠ Estación seca (dic–mar): rachas largas esperadas; se muestran en gris</span>':'');}
  else lg.innerHTML='<b style="color:#5c6b62">'+(mapScale===3?'Alerta SAAT ':'Umbrales SAAT · ')+mapIdxLabel()+':</b><span><i style="background:#7f8c8d"></i>Normal</span><span><i style="background:#58d68d"></i>Verde (≤ −1.0)</span><span><i style="background:#f39c12"></i>Amarilla (≤ −1.5)</span><span><i style="background:#e74c3c"></i>Roja (≤ −2.0)</span>';
  if(mapIdx!=='cdd'){const a=asOfOf(curMuni,curSrc)||{m:LAST_MONTH,d:LAST_DAY};lg.innerHTML+='<span style="color:#5c6b62">Ventana: '+ventanaTxt(mapScale,CUR_YEAR,a.m,a.d)+' · '+SOURCES[curSrc].name+'</span>';}
  if(mapIdx!=='cdd'&&mapScale===3&&estacionSeca(LAST_MONTH))lg.innerHTML+='<span style="color:#b9770e">⚠ Estación seca: a 3 meses es referencial; use 6 o 12 meses.</span>';
  lg.innerHTML+='<span><i style="background:#fff;border:3px solid #A4CD39"></i>Unidad seleccionada</span><span><i style="background:#fff;border:2px solid #1c2b22"></i>Límite municipal</span>';}

/* ---- Selección ---- */
async function selectUnit(uid){if(!UNITS[uid])return;const mu=UNITS[uid].muni;const changedMuni=mu!==curMuni;
  curUnit=uid;curMuni=mu;document.getElementById('muniSel').value=mu;fillUnitSel();if(changedMuni)drawSubLayer();
  if(!tieneDoc('chirps__'+uid)){setCargando(true);await cargarUnidades([uid]);setCargando(false);}
  refreshAll();}

/* ---- Navegación / eventos ---- */
document.getElementById('tabs').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  document.querySelectorAll('.tabs button').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');document.getElementById(b.dataset.v).classList.add('active');renderView(b.dataset.v);});
document.getElementById('muniSel').addEventListener('change',e=>selectUnit(e.target.value));
document.getElementById('unitSel').addEventListener('change',e=>selectUnit(e.target.value));
document.getElementById('srcSel').addEventListener('change',e=>{curSrc=e.target.value;refreshAll();});
const segBind=(id,fn)=>document.getElementById(id).addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  document.querySelectorAll('#'+id+' button').forEach(x=>x.classList.remove('active'));b.classList.add('active');fn(b);});
segBind('idxSeg',b=>{curIdx=b.dataset.i;renderIdx();});
segBind('scaleSeg',b=>{curScale=+b.dataset.s;renderIdx();});
segBind('mapScaleSeg',b=>{mapScale=+b.dataset.s;updateMap();});
segBind('subIdxSeg',b=>{subIdx=b.dataset.i;renderSubs();});
segBind('subScaleSeg',b=>{subScale=+b.dataset.s;renderSubs();});
segBind('cmpIdxSeg',b=>{cmpIdx=b.dataset.i;renderCmp();});
segBind('cmpScaleSeg',b=>{cmpScale=+b.dataset.s;renderCmp();});
segBind('mapIdxSeg',b=>{mapIdx=b.dataset.i;updateMap();});
document.getElementById('btnMuniAll').addEventListener('click',()=>selectUnit(curMuni));
document.querySelector('#subTable tbody').addEventListener('click',e=>{const tr=e.target.closest('tr');if(tr)selectUnit(tr.dataset.u);});
document.getElementById('alertList').addEventListener('click',e=>{const it=e.target.closest('.subs .alert-item');if(it)selectUnit(it.dataset.u);});
document.getElementById('btnCsvM').addEventListener('click',exportMonthly);
document.getElementById('btnCsvD').addEventListener('click',exportDaily);

/* ---- Arranque: Firestore → respaldo → demo ---- */
async function arrancar(){
  try{await initFirestore();ORIGEN='firestore';
    RESUMEN=await leerFS(COL_META,'resumen');
    if(!RESUMEN&&!(await leerFS(COL_SERIES,'chirps__'+curUnit)))throw new Error('colecciones v3 vacías');
  }catch(e){console.warn('Firestore no disponible ('+e.message+') → respaldo');ORIGEN='respaldo';
    try{RESUMEN=await leerRespaldo('resumen');}catch(_){RESUMEN=null;}}
  await cargarUnidades([curUnit]);
  if(!tieneDoc('chirps__'+curUnit))ORIGEN='demo';
  resetData();refreshAll();
  // Sin resumen precalculado, precarga el resto del municipio activo para mapa/tabla
  if(!RESUMEN)cargarUnidades(unitsOf(curMuni)).then(()=>renderView(document.querySelector('.view.active').id));
}
if(location.protocol==='file:'){document.body.insertAdjacentHTML('afterbegin','<div class="warn" style="margin:10px">Abriste el archivo con doble clic (file://): el navegador bloquea la lectura de los datos locales y la app queda en MODO DEMO. Ábrela desde la web publicada o con un servidor local (ver docs/PUESTA_EN_MARCHA_v3.md).</div>');}
if(!GEO){document.body.insertAdjacentHTML('afterbegin','<div class="warn" style="margin:10px">Falta data/geo_saat.js</div>');}
fillUnitSel();
try{initMap();}catch(e){console.warn('initMap:',e.message);}
setCargando(true);
arrancar();
