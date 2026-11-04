/* ===========================================================================
   SAAT Sequías v3 · MOTOR DE UNIDADES (capa de datos + índices por polígono)
   ---------------------------------------------------------------------------
   Sin DOM: lo usa la web (index.html → app.js) y Node (ingest/resumen.js, que
   precalcula v3_meta/resumen en GitHub Actions) → mismos números en ambos lados.
   Los datos llegan como DOCUMENTOS (Firestore v3_series o JSON de respaldo):
     chirps__{unidad}, imerg__{unidad}  → lluvia diaria areal (uint16 décimas mm, b64)
     power__{lat:.2f}_{lon:.3f}         → celda NASA POWER: lluvia + Tmáx + Tmín
   registrarDoc(doc) los incorpora; si falta una fuente se usa DEMO (marcado).
   Motor de índices: ingest/indices.js (window.SequiaIndices).
   =========================================================================== */
'use strict';
const I = window.SequiaIndices;
const GEO = window.SAAT_GEO;

/* ---- Parámetros ---- */
const MESES=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const MSHORT=MESES;
const MFULL=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const REF_START=1991, REF_END=2020, Y0=1981;
const TODAY=new Date();
const CUR_YEAR=TODAY.getFullYear();
let LAST_MONTH=TODAY.getMonth()+1, LAST_DAY=TODAY.getDate();
const SOURCES={chirps:{name:'CHIRPS',mult:1.00,color:'#007434'},
               power:{name:'NASA POWER',mult:1.05,color:'#e67e22'},
               imerg:{name:'IMERG',mult:0.96,color:'#2980b9'}};
// Climatología/temperatura SOLO para el modo demo (respaldo si faltan datos reales)
const MUNIS={
  cabanas:{name:'Cabañas',dept:'La Paz',clim:[8,10,18,55,140,190,150,165,210,120,45,15],
    tmax:[30,31,33,34,32,30,30,31,30,29,29,29],tmin:[15,15,17,18,19,19,18,18,18,18,16,15]},
  marcala:{name:'Marcala',dept:'La Paz',clim:[10,12,22,70,175,210,170,185,235,145,55,18],
    tmax:[26,27,29,30,29,27,27,28,27,26,26,26],tmin:[12,12,14,15,16,16,16,16,15,15,13,12]},
  sanfrancisco:{name:'San Francisco',dept:'Lempira',clim:[6,8,15,48,130,180,140,155,200,110,38,12],
    tmax:[31,32,34,35,33,31,31,32,31,30,30,30],tmin:[16,16,18,19,20,20,19,19,19,18,17,16]}};
const DRY={cabanas:{2023:0.95,2024:0.86,2025:0.90,2026:0.82},marcala:{2023:0.98,2024:0.92,2025:0.95,2026:0.90},
           sanfrancisco:{2023:0.92,2024:0.82,2025:0.88,2026:0.78}};

/* ---- Registro de UNIDADES (municipios + subcuencas) desde GEO ---- */
const UNITS={};           // id -> {id,tipo,muni,name,label,lat,lng,area,...}
const MUNI_ORDER=['cabanas','marcala','sanfrancisco'];
MUNI_ORDER.forEach(k=>{const m=GEO.municipios[k];
  MUNIS[k].lat=m.centroide[0];MUNIS[k].lng=m.centroide[1];
  UNITS[k]={id:k,tipo:'municipio',muni:k,name:m.nombre+' · municipio completo',short:'Municipio completo',
    lat:m.centroide[0],lng:m.centroide[1],area:m.area_km2,pixEf:m.pix_efectivos,wPower:m.w_power,wChirps:m.w_chirps,
    cobertura:m.cobertura_subcuencas_pct,meta:m};
  (GEO.subcuencas[k]||[]).forEach(s=>{if(s.astilla)return;
    UNITS[s.id]={id:s.id,tipo:'subcuenca',muni:k,hydroid:s.hydroid,name:s.nombre+' ('+s.id+') · '+m.nombre,
      short:s.nombre,lat:s.centroide[0],lng:s.centroide[1],area:s.area_km2,areaIn:s.area_en_muni_km2,
      pctIn:s.pct_subcuenca_en_muni,pctMuni:s.pct_del_muni,pixEf:s.pix_efectivos,wPower:s.w_power,wChirps:s.w_chirps,meta:s};});
});
function subsOf(muni){return (GEO.subcuencas[muni]||[]).filter(s=>!s.astilla).map(s=>s.id);}
function unitsOf(muni){return [muni].concat(subsOf(muni));}


/* ===========================================================================
   Capa de datos: series DIARIAS por unidad y fuente como Float32Array indexado
   por día desde 1981-01-01 (NaN = sin dato). El mensual se deriva del diario.
   =========================================================================== */
const BASE=Date.UTC(Y0,0,1)/864e5;
const N_DAYS=Math.round(Date.UTC(CUR_YEAR,11,31)/864e5-BASE)+1;
function dIdx(y,m,d){return Math.round(Date.UTC(y,m-1,d)/864e5-BASE);}
function idxDate(i){const t=new Date((i+BASE)*864e5);return {y:t.getUTCFullYear(),m:t.getUTCMonth()+1,d:t.getUTCDate()};}
function daysInMonth(y,m){return I.daysInMonth(y,m);}

let REAL={};                               // REAL[uid][src]=true
function isReal(uid,src){return !!(REAL[uid]&&REAL[uid][src]);}
const DATA={};                             // DATA[uid]={chirps:F32,power:F32,imerg:F32,pet:F32(meses)}

function hashStr(s){let h=0;for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;return h;}
function rnd(seed){const x=Math.sin(seed)*10000;return x-Math.floor(x);}
function annualF(key,y){const s=Math.sin(y*7.31+hashStr(key)*0.13)*10000;const u=s-Math.floor(s);
  const s2=Math.sin(y*3.7+hashStr(key)*0.29)*10000;const u2=s2-Math.floor(s2);return 0.55+0.9*((u+u2)/2);}
// Último día a generar en demo = hoy
const DEMO_LAST=dIdx(CUR_YEAR,TODAY.getMonth()+1,TODAY.getDate());
function genDemo(uid,src){
  const u=UNITS[uid],muni=u.muni,a=new Float32Array(N_DAYS).fill(NaN);
  const base=hashStr(uid)*0.7+hashStr(src)*1.3;
  for(let y=Y0;y<=CUR_YEAR;y++){const dryF=(DRY[muni]&&DRY[muni][y])||1;const yF=annualF(muni,y)*dryF;
    for(let m=1;m<=12;m++){const clim=MUNIS[muni].clim[m-1]*SOURCES[src].mult,ndm=daysInMonth(y,m);
      const mF=yF*(0.75+0.5*rnd(y*97+m*5.1+hashStr(muni)*0.05));
      const pWet=Math.min(0.72,clim/(ndm*7.5)),perWet=clim*mF/Math.max(1,pWet*ndm);
      for(let d=1;d<=ndm;d++){const i=dIdx(y,m,d);if(i>DEMO_LAST)break;
        const ws=y*1000+m*40+d+hashStr(muni)*0.7;let v=0;
        if(rnd(ws)<pWet){const u2=rnd(ws+base+3);v=perWet*(0.2+1.8*u2*u2);}a[i]=Math.round(v*100)/100;}}}
  return a;}
function demoPET(uid){const u=UNITS[uid],M=MUNIS[u.muni],p=new Float32Array((CUR_YEAR-Y0+1)*12);
  for(let y=Y0;y<=CUR_YEAR;y++)for(let m=1;m<=12;m++){const w=(y-REF_START)*0.03;
    p[(y-Y0)*12+m-1]=I.petHargreavesMonth(M.tmax[m-1]+w,M.tmin[m-1]+w,u.lat,y,m);}
  return p;}

/* ---- Documentos de series (Firestore v3_series o respaldo JSON) ---- */
const DOCS={};            // id -> documento tal cual (p en base64)
let RESUMEN=null;         // v3_meta/resumen (índices precalculados por GitHub Actions)
function b64u16(s,scale,miss){const bin=atob(s),n=bin.length>>1,a=new Float32Array(n);
  for(let k=0;k<n;k++){let v=bin.charCodeAt(2*k)|(bin.charCodeAt(2*k+1)<<8);
    if(v===miss){a[k]=NaN;continue;} if(scale<0&&v>=32768)v-=65536; a[k]=v/Math.abs(scale);}
  return a;}
function docOffset(doc){const d=doc.desde;return Math.round(Date.UTC(+d.slice(0,4),+d.slice(5,7)-1,+d.slice(8,10))/864e5-BASE);}
function docSerie(doc,campo){                    // -> Float32Array(N_DAYS) alineado a 1981-01-01
  const v=(campo==='p')?b64u16(doc[campo],10,65535):b64u16(doc[campo],-10,32768);
  const a=new Float32Array(N_DAYS).fill(NaN),off=docOffset(doc);
  for(let k=0;k<v.length;k++){const i=off+k;if(i>=0&&i<N_DAYS)a[i]=v[k];}return a;}
function powerId(la,lo){return 'power__'+(+la).toFixed(2)+'_'+(+lo).toFixed(3);}   // id canónico (igual en Python)
function docId(doc){return doc.fuente==='power'?powerId(doc.celda[0],doc.celda[1]):(doc.fuente+'__'+doc.unidad);}
function registrarDoc(doc){if(!doc||!doc.fuente)return;const id=docId(doc);DOCS[id]=doc;
  if(doc.fuente==='power'){const k=cellKey(doc.celda[0],doc.celda[1]);
    PCELL[k]={P:docSerie(doc,'p'),TX:docSerie(doc,'tx'),TN:docSerie(doc,'tn'),origen:'db'};}
  if(doc.fuente==='power')Object.keys(DATA).forEach(k=>delete DATA[k]);else delete DATA[doc.unidad];
  MEMO.clear();}
function tieneDoc(id){return !!DOCS[id];}
// Último día de CHIRPS FINAL (después = preliminar) como índice de día
function chirpsFinalIdx(uid){const d=DOCS['chirps__'+uid];if(!d||!d.final_hasta)return null;
  const f=d.final_hasta;return Math.round(Date.UTC(+f.slice(0,4),+f.slice(5,7)-1,+f.slice(8,10))/864e5-BASE);}
function esPreliminar(uid,src,a){if(src!=='chirps'||!a)return false;const fi=chirpsFinalIdx(uid);
  return fi!==null&&dIdx(CUR_YEAR,a.m,a.d)>fi;}

/* ---- NASA POWER por celda (documento de la base de datos o, de respaldo, API en vivo) ---- */
const PCELL={};           // 'lat,lon' -> {P,TX,TN} Float32Array por día
function cellKey(la,lo){return la+','+lo;}
async function powerFetch(url){
  for(let k=0;k<5;k++){let r;try{r=await fetch(url);}catch(e){await new Promise(s=>setTimeout(s,2000*(k+1)));continue;}
    if(r.ok)return r.json();
    if([422,429,500,502,503].includes(r.status)){await new Promise(s=>setTimeout(s,3000*(k+1)));continue;}
    throw new Error('POWER '+r.status);}
  throw new Error('POWER sin respuesta');}
async function loadPowerCell(la,lo){
  const key=cellKey(la,lo);if(PCELL[key])return PCELL[key];
  const url='https://power.larc.nasa.gov/api/temporal/daily/point?parameters=PRECTOTCORR,T2M_MAX,T2M_MIN&community=AG'
    +'&longitude='+lo+'&latitude='+la+'&start='+Y0+'0101&end='+CUR_YEAR+'1231&format=JSON';
  const par=(await powerFetch(url)).properties.parameter;
  const P=new Float32Array(N_DAYS).fill(NaN),TX=new Float32Array(N_DAYS).fill(NaN),TN=new Float32Array(N_DAYS).fill(NaN);
  const fill=(src,dst)=>Object.keys(src).forEach(k=>{const v=src[k];if(v==null||v<=-900)return;
    const i=dIdx(+k.slice(0,4),+k.slice(4,6),+k.slice(6,8));if(i>=0&&i<N_DAYS)dst[i]=v;});
  fill(par.PRECTOTCORR,P);fill(par.T2M_MAX,TX);fill(par.T2M_MIN,TN);
  PCELL[key]={P:P,TX:TX,TN:TN,origen:'api'};return PCELL[key];}
function powerReadyFor(uid){return UNITS[uid].wPower.every(w=>PCELL[cellKey(w[0],w[1])]);}
// Combina celdas POWER con pesos de área -> precip diaria + PET mensual de la unidad
function combinePower(uid){
  const u=UNITS[uid],cells=u.wPower.map(w=>({c:PCELL[cellKey(w[0],w[1])],w:w[2]}));
  const P=new Float32Array(N_DAYS).fill(NaN),TX=new Float32Array(N_DAYS).fill(NaN),TN=new Float32Array(N_DAYS).fill(NaN);
  for(let i=0;i<N_DAYS;i++){let p=0,tx=0,tn=0,okP=true,okT=true;
    for(const o of cells){const a=o.c.P[i],b=o.c.TX[i],c=o.c.TN[i];
      if(Number.isNaN(a))okP=false;else p+=o.w*a;
      if(Number.isNaN(b)||Number.isNaN(c))okT=false;else{tx+=o.w*b;tn+=o.w*c;}}
    if(okP)P[i]=p;if(okT){TX[i]=tx;TN[i]=tn;}}
  const pet=new Float32Array((CUR_YEAR-Y0+1)*12).fill(NaN);
  for(let y=Y0;y<=CUR_YEAR;y++)for(let m=1;m<=12;m++){let sx=0,sn=0,n=0;const nd=daysInMonth(y,m),i0=dIdx(y,m,1);
    for(let d=0;d<nd;d++){const a=TX[i0+d],b=TN[i0+d];if(!Number.isNaN(a)){sx+=a;sn+=b;n++;}}
    if(n>=1)pet[(y-Y0)*12+m-1]=I.petHargreavesMonth(sx/n,sn/n,u.lat,y,m);}
  // Mes en curso aún sin temperatura (primeros días): PET climatológico 1991–2020 de ese mes
  for(let m=1;m<=12;m++){const i=(CUR_YEAR-Y0)*12+m-1;if(!Number.isNaN(pet[i]))continue;
    let s=0,k=0;for(let y=REF_START;y<=REF_END;y++){const v=pet[(y-Y0)*12+m-1];if(!Number.isNaN(v)){s+=v;k++;}}
    if(k)pet[i]=s/k;}
  return {P:P,pet:pet};}

function ensureUnit(uid){
  if(DATA[uid])return DATA[uid];
  const D={};REAL[uid]={};
  ['chirps','imerg'].forEach(src=>{const doc=DOCS[src+'__'+uid];
    if(doc){D[src]=docSerie(doc,'p');REAL[uid][src]=true;}else D[src]=genDemo(uid,src);});
  if(powerReadyFor(uid)){const pw=combinePower(uid);D.power=pw.P;D.pet=pw.pet;REAL[uid].power=true;}
  else{D.power=genDemo(uid,'power');D.pet=demoPET(uid);}
  DATA[uid]=D;return D;}
function resetData(){Object.keys(DATA).forEach(k=>delete DATA[k]);REAL={};MEMO.clear();}
function unidadCargada(uid){return !!DATA[uid];}

/* ---- Accesores (misma semántica que v2, ahora por unidad) ---- */
function series(uid,src){return ensureUnit(uid)[src];}
function getDaily(uid,src,y,m,d){const a=series(uid,src),i=dIdx(y,m,d);if(i<0||i>=a.length)return null;
  const v=a[i];return Number.isNaN(v)?null:v;}
function getPET(uid,y,m){const p=ensureUnit(uid).pet,i=(y-Y0)*12+m-1;if(i<0||i>=p.length)return null;
  const v=p[i];return Number.isNaN(v)?null:v;}
// Suma con control de huecos: si falta más del 10 % de los días del tramo, el mes no
// se usa (null); con pocos huecos se prorratea (promedio de los días con dato × días
// del tramo). Evita subestimar la lluvia por huecos de la fuente (p.ej. IMERG en
// ClimateSERV no tiene mayo-2024) sin descartar meses por un solo día faltante.
function sumToDay(uid,src,y,m,dd){const a=series(uid,src),i0=dIdx(y,m,1);let t=0,n=0;
  if(i0<0)return null;
  for(let d=0;d<dd;d++){const v=a[i0+d];if(v!==undefined&&!Number.isNaN(v)){t+=v;n++;}}
  if(n===0||n<0.9*dd)return null;
  return n===dd?t:t*dd/n;}
function sumMonth(uid,src,y,m){return sumToDay(uid,src,y,m,daysInMonth(y,m));}
function accumP(uid,src,endY,endM,endD,scale){let tot=0;
  for(let k=0;k<scale;k++){let m=endM-k,y=endY;while(m<1){m+=12;y--;}
    const v=(k===0)?sumToDay(uid,src,y,m,endD):sumMonth(uid,src,y,m);if(v===null)return null;tot+=v;}
  return tot;}
function accumPET(uid,endY,endM,endD,scale){let tot=0;
  for(let k=0;k<scale;k++){let m=endM-k,y=endY;while(m<1){m+=12;y--;}
    let pet=getPET(uid,y,m);if(pet===null)return null;if(k===0)pet*=endD/daysInMonth(y,m);tot+=pet;}
  return tot;}
const MEMO=new Map();
function memo(key,fn){if(MEMO.has(key))return MEMO.get(key);const v=fn();MEMO.set(key,v);return v;}
function spiAt(uid,src,scale,endY,endM,endD){endD=endD||daysInMonth(endY,endM);
  return memo('spi|'+uid+'|'+src+'|'+scale+'|'+endY+'|'+endM+'|'+endD,()=>{
    const tgt=accumP(uid,src,endY,endM,endD,scale);if(tgt===null)return null;
    const ref=[];for(let Y=REF_START;Y<=REF_END;Y++){const v=accumP(uid,src,Y,endM,endD,scale);if(v!==null)ref.push(v);}
    return I.spiGamma(ref,tgt);});}
function speiAt(uid,src,scale,endY,endM,endD){endD=endD||daysInMonth(endY,endM);
  return memo('spei|'+uid+'|'+src+'|'+scale+'|'+endY+'|'+endM+'|'+endD,()=>{
    const D=(Y)=>{const p=accumP(uid,src,Y,endM,endD,scale),e=accumPET(uid,Y,endM,endD,scale);return (p===null||e===null)?null:p-e;};
    const tgt=D(endY);if(tgt===null)return null;
    const ref=[];for(let Y=REF_START;Y<=REF_END;Y++){const v=D(Y);if(v!==null)ref.push(v);}
    const z=I.spei(ref,tgt);if(z!==null)return z;  // log-logística (con control de ajuste)
    return I.speiEmpirico(ref,tgt);});}            // respaldo empírico (Gringorten)
function normalMonth(uid,src,m){let s=0,n=0;for(let y=REF_START;y<=REF_END;y++){const v=sumMonth(uid,src,y,m);if(v!==null){s+=v;n++;}}return n?s/n:null;}
function normalToDay(uid,src,m,dd){let s=0,n=0;for(let y=REF_START;y<=REF_END;y++){const v=sumToDay(uid,src,y,m,dd);if(v!==null){s+=v;n++;}}return n?s/n:null;}
function ytdRain(uid,src){let t=0;for(let m=1;m<=LAST_MONTH;m++){const v=(m===LAST_MONTH)?sumToDay(uid,src,CUR_YEAR,m,LAST_DAY):sumMonth(uid,src,CUR_YEAR,m);if(v!=null)t+=v;}return t;}
function ytdNormal(uid,src){let s=0,n=0;for(let Y=REF_START;Y<=REF_END;Y++){let t=0,ok=true;
  for(let m=1;m<=LAST_MONTH;m++){const v=(m===LAST_MONTH)?sumToDay(uid,src,Y,m,LAST_DAY):sumMonth(uid,src,Y,m);if(v==null){ok=false;break;}t+=v;}
  if(ok){s+=t;n++;}}return n?s/n:null;}
// Última fecha con dato de una fuente (en el año en curso)
function asOfOf(uid,src){const a=series(uid,src);const lo=dIdx(CUR_YEAR,1,1);
  for(let i=Math.min(a.length-1,DEMO_LAST);i>=lo;i--){if(!Number.isNaN(a[i])){const t=idxDate(i);return {m:t.m,d:t.d};}}
  return null;}
function computeAsOf(uid,src){const a=asOfOf(uid,src);if(a){LAST_MONTH=a.m;LAST_DAY=a.d;}}

/* ===========================================================================
   CDD — metodología SIMGER/AMDC (OMM/ETCCDI, umbral <1 mm) (igual que v2)
   =========================================================================== */
function curYearDays(uid,src){const arr=[];
  for(let m=1;m<=LAST_MONTH;m++){const maxD=(m===LAST_MONTH)?LAST_DAY:daysInMonth(CUR_YEAR,m);
    for(let d=1;d<=maxD;d++){const v=getDaily(uid,src,CUR_YEAR,m,d);if(v!==null)arr.push({m:m,d:d,val:v});}}
  return arr;}
function computeCDD(uid,src){const days=curYearDays(uid,src);
  let maxStreak=0,temp=0,maxStart=null,maxEnd=null,curStart=null;
  days.forEach(day=>{if(day.val<1){if(temp===0)curStart={m:day.m,d:day.d};temp++;
      if(temp>maxStreak){maxStreak=temp;maxStart=curStart;maxEnd={m:day.m,d:day.d};}}else{temp=0;curStart=null;}});
  const dryDays=days.filter(d=>d.val<1).length;
  return {days:days,currentStreak:temp,maxStreak:maxStreak,maxStart:maxStart,maxEnd:maxEnd,
    totalDays:days.length,dryDays:dryDays,wetDays:days.length-dryDays};}
function histCDD(uid,src){const startM=4,endM=Math.min(LAST_MONTH,11);if(endM<startM)return{avg:0,p90:0,maxHist:0};
  const vals=[];for(let y=REF_START;y<=REF_END;y++){let st=0,mx=0;
    for(let m=startM;m<=endM;m++){const maxD=(m===endM)?LAST_DAY:daysInMonth(y,m);
      for(let d=1;d<=maxD;d++){const v=getDaily(uid,src,y,m,d);if(v===null)continue;if(v<1){st++;if(st>mx)mx=st;}else st=0;}}
    vals.push(mx);}
  vals.sort((a,b)=>a-b);const sum=vals.reduce((a,b)=>a+b,0);
  return{avg:sum/vals.length,p90:vals[Math.floor(vals.length*0.9)],maxHist:vals[vals.length-1]};}
function monthlyMaxCDDHist(uid,src,month){const vals=[];
  for(let y=REF_START;y<=REF_END;y++){let st=0,mx=0;const nd=daysInMonth(y,month);
    for(let d=1;d<=nd;d++){const v=getDaily(uid,src,y,month,d);if(v===null)continue;if(v<1){st++;if(st>mx)mx=st;}else st=0;}vals.push(mx);}
  vals.sort((a,b)=>a-b);const sum=vals.reduce((a,b)=>a+b,0);
  return{avg:sum/vals.length,p90:vals[Math.floor(vals.length*0.9)],max:vals[vals.length-1]};}
function monthlyDryWet(uid,src){const m=LAST_MONTH,maxD=LAST_DAY;let dry=0,wet=0;
  for(let d=1;d<=maxD;d++){const v=getDaily(uid,src,CUR_YEAR,m,d);if(v===null)continue;(v<1)?dry++:wet++;}
  let dryHS=0,wetHS=0,yrs=0;for(let y=REF_START;y<=REF_END;y++){const nd=daysInMonth(y,m);let any=false;
    for(let d=1;d<=nd;d++){const v=getDaily(uid,src,y,m,d);if(v===null)continue;any=true;(v<1)?dryHS++:wetHS++;}if(any)yrs++;}
  yrs=yrs||30;return{name:MFULL[m-1],dry26:dry,wet26:wet,dryH:dryHS/yrs,wetH:wetHS/yrs,curDay:maxD,fullMonthDays:daysInMonth(CUR_YEAR,m)};}
function cddClassify(days){
  if(days===0) return{label:'Sin racha activa',color:'#2ecc71',border:'#bfe6cb'};
  if(days<=4)  return{label:'Racha leve',color:'#c9a200',border:'#f0e08a'};
  if(days<=9)  return{label:'Racha moderada',color:'#f39c12',border:'#f7cf8f'};
  if(days<=14) return{label:'Racha severa',color:'#e74c3c',border:'#f2b3ac'};
  return{label:'Racha extrema',color:'#c0392b',border:'#e0a49c'};}
function cddMax(uid,src){const a=asOfOf(uid,src)||{m:LAST_MONTH,d:LAST_DAY};
  return memo('cdd|'+uid+'|'+src+'|'+a.m+'|'+a.d,()=>{const sm=LAST_MONTH,sd=LAST_DAY;LAST_MONTH=a.m;LAST_DAY=a.d;
    try{return computeCDD(uid,src).maxStreak;}finally{LAST_MONTH=sm;LAST_DAY=sd;}});}
function cddMaxYear(uid,src,y){let st=0,mx=0;const endM=(y===CUR_YEAR)?Math.min(LAST_MONTH,11):11;
  for(let m=4;m<=endM;m++){const nd=(y===CUR_YEAR&&m===LAST_MONTH)?LAST_DAY:daysInMonth(y,m);
    for(let d=1;d<=nd;d++){const v=getDaily(uid,src,y,m,d);if(v===null)continue;if(v<1){st++;if(st>mx)mx=st;}else st=0;}}
  return mx;}
function cddColor(v){return v>30?'#c0392b':v>20?'#e74c3c':v>10?'#f39c12':'#58d68d';}

/* ---- Estado actual de una unidad (a la última fecha de la fuente) ----
   Si la unidad no está cargada en memoria y existe v3_meta/resumen, se usa el valor
   precalculado (mismo motor, en GitHub Actions) → el mapa y las alertas cuestan 1 lectura. */
function unitNowCalc(uid,src){const a=asOfOf(uid,src)||{m:LAST_MONTH,d:LAST_DAY};
  // spei/spi = escala 3 (semáforo SAAT); spei6/spi6 y spei12/spi12 para el mapa (añadido 2026-11-04)
  return {asof:a,spei:speiAt(uid,src,3,CUR_YEAR,a.m,a.d),spi:spiAt(uid,src,3,CUR_YEAR,a.m,a.d),
    spei6:speiAt(uid,src,6,CUR_YEAR,a.m,a.d),spi6:spiAt(uid,src,6,CUR_YEAR,a.m,a.d),
    spei12:speiAt(uid,src,12,CUR_YEAR,a.m,a.d),spi12:spiAt(uid,src,12,CUR_YEAR,a.m,a.d),cdd:cddMax(uid,src),
    prelim:esPreliminar(uid,src,a),real:isReal(uid,src)};}
function unitNow(uid,src){
  if(!DATA[uid]&&RESUMEN&&RESUMEN.u&&RESUMEN.u[uid]&&RESUMEN.u[uid][src])return RESUMEN.u[uid][src];
  return unitNowCalc(uid,src);}

