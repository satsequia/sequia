/* ===========================================================================
   SAAT Sequías v4 · Pestaña HISTORIAL + CLIMA DE REFERENCIA del Dashboard
   GOAL · Proyecto ICSP · HN-M26-53765 · M.Sc. Roberto Elías Granados Chahín
   ---------------------------------------------------------------------------
   Historial: lee 1 documento por unidad (v3_series/hist__{unidad}, generado cada
   día por ingest/historial.js con el mismo motor de la app) y el ONI
   (v3_series/hist__oni). Respaldo: data/semilla/hist__*.json.
   Clima de referencia: data/clima_ref.js (Bloque 1) y data/canicula_hist.js
   (Bloque 2, pasos 9 y 10), estáticos.
   Usa los globales de app.js / motor_unidades.js (UNITS, GEO, I, CH, leerFS…).
   =========================================================================== */
'use strict';

/* ---------------------------------------------------------------- utilidades */
const MES_MIN=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const fmd=s=>{if(!s)return '—';const p=s.split('-');const mm=+p[p.length-2],dd=+p[p.length-1];return dd+' '+MES_MIN[mm-1];};
const nf0=v=>v===null||v===undefined?'—':Math.round(v).toLocaleString('es-HN');
const nf1=v=>v===null||v===undefined?'—':v.toFixed(1);
const sg2=v=>v===null||v===undefined?'—':(v>=0?'+':'')+v.toFixed(2);
const avg=a=>{const b=a.filter(v=>v!==null&&v!==undefined);return b.length?b.reduce((x,y)=>x+y,0)/b.length:null;};
const median=a=>{const b=a.filter(v=>v!==null&&v!==undefined).sort((x,y)=>x-y);if(!b.length)return null;const k=b.length>>1;return b.length%2?b[k]:(b[k-1]+b[k])/2;};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ---------------------------------------------------------------- datos historial */
const HIST={}, HIST_FALTA={}; let ONI=null, ONI_PEDIDO=false;
async function leerHistDoc(id){let d=null;
  if(ORIGEN==='firestore'){try{d=await leerFS(COL_SERIES,id);}catch(e){console.warn('Firestore '+id+':',e.message);}}
  if(!d){try{d=await leerRespaldo(id);}catch(e){d=null;}}
  return d;}
async function cargarHist(uid){const t=[];
  if(!HIST[uid]&&!HIST_FALTA[uid])t.push(leerHistDoc('hist__'+uid).then(d=>{if(d&&Array.isArray(d.p))HIST[uid]=d;else HIST_FALTA[uid]=1;}));
  if(!ONI_PEDIDO){ONI_PEDIDO=true;t.push(leerHistDoc('hist__oni').then(d=>{if(d&&Array.isArray(d.v))ONI=d;}));}
  if(t.length){setCargando(true);await Promise.all(t);setCargando(false);}}
const oniAt=i=>ONI&&i>=0&&i<ONI.v.length?ONI.v[i]:null;
const fase=v=>v===null||v===undefined?null:v>=0.5?'nino':v<=-0.5?'nina':'neutro';
const FASE_TXT={nino:'El Niño',nina:'La Niña',neutro:'Neutro'};
const FASE_COL={nino:'#d35400',nina:'#2471a3',neutro:'#7f8c8d'};

/* ---------------------------------------------------------------- estado de filtros */
const HS={idx:'spei',scale:3,y0:null,y1:null,meses:new Set([1,2,3,4,5,6,7,8,9,10,11,12]),sev:0,enso:'all',cmp:[]};
const SEV={
  z:[{t:'Todos',v:null},{t:'≤ −1.0 moderada',v:-1},{t:'≤ −1.5 severa',v:-1.5},{t:'≤ −2.0 extrema',v:-2}],
  cdd:[{t:'Todos',v:null},{t:'≥ 5 d',v:5},{t:'≥ 10 d',v:10},{t:'≥ 15 d',v:15}],
  p:[{t:'Todos',v:null},{t:'≤ 75 %',v:75},{t:'≤ 50 %',v:50},{t:'≤ 25 %',v:25}]};
const kind=()=>HS.idx==='cdd'?'cdd':HS.idx==='p'?'p':'z';
const meets=(v,thr)=>{if(v===null||v===undefined)return false;if(thr===null)return true;return kind()==='cdd'?v>=thr:v<=thr;};
const idxName=()=>HS.idx==='cdd'?'Racha seca mensual (CDD)':HS.idx==='p'?'Lluvia (% de la normal)':HS.idx.toUpperCase()+'-'+HS.scale;
function colorOf(v){if(v===null||v===undefined)return null;const k=kind();
  if(k==='z')return I.classify(v).color;
  if(k==='cdd')return v>=15?'#c0392b':v>=10?'#e74c3c':v>=5?'#f39c12':'#cfe3cf';
  return v<=25?'#c0392b':v<=50?'#e74c3c':v<=75?'#f39c12':v<125?'#b8c2bd':v<150?'#58d68d':'#3498db';}
function catOf(v){if(v===null||v===undefined)return '';const k=kind();
  if(k==='z')return I.classify(v).cls;
  if(k==='cdd')return v>=15?'racha extrema':v>=10?'racha severa':v>=5?'racha moderada':'sin racha relevante';
  return v<=25?'déficit extremo':v<=50?'déficit severo':v<=75?'déficit moderado':v<125?'normal':'superávit';}
function legendHTML(){const k=kind(),it=(c,t)=>'<span><i style="background:'+c+'"></i>'+t+'</span>';
  if(k==='z')return '<b style="color:#5c6b62">'+idxName()+':</b>'+ESCALA.slice().reverse().map(s=>it(s.color,s.rng+' '+s.cls.toLowerCase())).join('')+it('#eee','sin dato');
  if(k==='cdd')return '<b style="color:#5c6b62">Racha seca más larga del mes (P &lt; 1 mm):</b>'+it('#cfe3cf','&lt; 5 d')+it('#f39c12','5–9 d')+it('#e74c3c','10–14 d')+it('#c0392b','≥ 15 d');
  return '<b style="color:#5c6b62">Lluvia del mes / normal 1991–2020:</b>'+it('#c0392b','≤ 25 %')+it('#e74c3c','25–50 %')+it('#f39c12','50–75 %')+it('#b8c2bd','75–125 %')+it('#58d68d','125–150 %')+it('#3498db','≥ 150 %');}

/* ---------------------------------------------------------------- series derivadas */
function serieDe(h){const n=h.p.length;
  if(HS.idx==='spi'||HS.idx==='spei')return h[HS.idx+HS.scale]||[];
  if(HS.idx==='cdd')return h.cdd;
  // lluvia en % de la normal 1991–2020 del mismo mes (el mes en curso, prorrateado al día)
  const nm=normalesP(h),out=[];
  for(let i=0;i<n;i++){const m=i%12,y=Y0+Math.floor(i/12);let nr=nm[m];
    if(i===n-1&&h.hasta_dia)nr=nr*h.hasta_dia/daysInMonth(y,m+1);
    out.push(h.p[i]===null||!nr?null:Math.round(1000*h.p[i]/nr)/10);}
  return out;}
function normalesP(h){if(h.__nm)return h.__nm;const s=Array(12).fill(0),c=Array(12).fill(0);
  for(let y=REF_START;y<=REF_END;y++)for(let m=0;m<12;m++){const v=h.p[(y-Y0)*12+m];if(v!==null&&v!==undefined){s[m]+=v;c[m]++;}}
  h.__nm=s.map((v,m)=>c[m]?v/c[m]:null);return h.__nm;}
const yOf=i=>Y0+Math.floor(i/12), mOf=i=>i%12+1;
function pasaFiltro(i){const y=yOf(i),m=mOf(i);
  if(y<HS.y0||y>HS.y1||!HS.meses.has(m))return false;
  if(HS.enso!=='all'&&fase(oniAt(i))!==HS.enso)return false;
  return true;}

/* ---------------------------------------------------------------- controles */
function initHistUI(){
  const mc=document.getElementById('hMeses');
  mc.innerHTML=MESES.map((t,k)=>'<button data-m="'+(k+1)+'" class="on">'+t+'</button>').join('');
  mc.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const m=+b.dataset.m;
    if(HS.meses.has(m)){if(HS.meses.size>1)HS.meses.delete(m);}else HS.meses.add(m);
    syncMeses();document.querySelectorAll('#hMPre button').forEach(x=>x.classList.remove('active'));renderHist();});
  segBind('hIdxSeg',b=>{HS.idx=b.dataset.i;buildSev();renderHist();});
  segBind('hScaleSeg',b=>{HS.scale=+b.dataset.s;renderHist();});
  segBind('hMPre',b=>{HS.meses=new Set(b.dataset.p.split(',').map(Number));syncMeses();renderHist();});
  segBind('hEnsoSeg',b=>{HS.enso=b.dataset.e;renderHist();});
  segBind('hSevSeg',b=>{HS.sev=+b.dataset.k;renderHist();});
  segBind('hYPre',b=>{const yl=ultimoAnio();const p=b.dataset.p;
    if(p==='all'){HS.y0=Y0;HS.y1=yl;}else if(p==='ref'){HS.y0=REF_START;HS.y1=REF_END;}else{HS.y1=yl;HS.y0=Math.max(Y0,yl-(+p)+1);}
    syncAnios();renderHist();});
  ['hY0','hY1'].forEach(id=>document.getElementById(id).addEventListener('change',()=>{
    let a=+document.getElementById('hY0').value,b=+document.getElementById('hY1').value;if(a>b)[a,b]=[b,a];HS.y0=a;HS.y1=b;
    document.querySelectorAll('#hYPre button').forEach(x=>x.classList.remove('active'));syncAnios();renderHist();}));
  document.getElementById('hCmp').addEventListener('change',e=>{HS.cmp=parseAnios(e.target.value);renderHist();});
  document.getElementById('hHeat').addEventListener('click',e=>{const y=e.target.closest('.hy');if(!y)return;const a=+y.dataset.y;
    HS.cmp=HS.cmp.includes(a)?HS.cmp.filter(x=>x!==a):HS.cmp.concat([a]).slice(-6);
    document.getElementById('hCmp').value=HS.cmp.join(', ');renderHist();});
  document.getElementById('hCsv').addEventListener('click',exportHist);
  buildSev();}
function parseAnios(t){return [...new Set((t.match(/\d{4}/g)||[]).map(Number).filter(y=>y>=Y0&&y<=CUR_YEAR))].slice(0,6);}
function syncMeses(){document.querySelectorAll('#hMeses button').forEach(b=>b.classList.toggle('on',HS.meses.has(+b.dataset.m)));}
function ultimoAnio(){const h=HIST[curUnit];return h?yOf(h.p.length-1):CUR_YEAR;}
function syncAnios(){const yl=ultimoAnio(),o=[];for(let y=Y0;y<=yl;y++)o.push('<option>'+y+'</option>');
  ['hY0','hY1'].forEach(id=>{const s=document.getElementById(id);if(s.options.length!==yl-Y0+1)s.innerHTML=o.join('');});
  if(HS.y0===null){HS.y0=Y0;HS.y1=yl;}HS.y1=Math.min(HS.y1,yl);
  document.getElementById('hY0').value=HS.y0;document.getElementById('hY1').value=HS.y1;}
function buildSev(){const L=SEV[kind()];if(HS.sev>=L.length)HS.sev=0;
  document.getElementById('hSevSeg').innerHTML=L.map((s,k)=>'<button data-k="'+k+'"'+(k===HS.sev?' class="active"':'')+'>'+s.t+'</button>').join('');
  document.getElementById('hScaleBox').style.display=kind()==='z'?'':'none';}

/* ---------------------------------------------------------------- render principal */
let HIST_UI=false;
async function renderHist(){
  if(!HIST_UI){initHistUI();HIST_UI=true;}
  const uid=curUnit;await cargarHist(uid);if(uid!==curUnit)return;
  const h=HIST[uid],body=document.getElementById('hBody'),empty=document.getElementById('hEmpty');
  if(!h){body.style.display='none';
    empty.innerHTML='<div class="card"><div class="warn" style="margin:0"><b>Historial aún no disponible para esta unidad.</b> Se genera en la ingesta diaria '+
      '(<code>ingest/historial.js</code>). Si la v4 se acaba de publicar, ejecute el flujo <i>Ingesta diaria</i> en GitHub Actions una vez.</div></div>';return;}
  body.style.display='';empty.innerHTML='';
  syncAnios();
  const thr=SEV[kind()][HS.sev].v, S=serieDe(h), n=S.length, last=n-1;
  const prelim=h.final_hasta?(' · CHIRPS final hasta '+fmd(h.final_hasta)+' '+h.final_hasta.slice(0,4)+', después preliminar'):'';
  document.getElementById('hMeta').innerHTML='Último dato: <b>'+h.hasta_dia+' '+MSHORT[mOf(last)-1]+' '+yOf(last)+'</b>'+prelim+
    (ONI?' · ONI NOAA-CPC hasta '+MSHORT[+ONI.hasta.slice(5)-1]+' '+ONI.hasta.slice(0,4):' · ONI no disponible')+'.';
  // avisos
  const w=[];const seca=[12,1,2,3,4].some(m=>HS.meses.has(m));
  if(kind()==='z'&&HS.scale<=3&&seca)w.push('En la estación seca (dic–abr) el '+idxName()+' es <b>solo referencial</b>: con lluvias normales de pocos mm, cualquier diferencia pesa mucho. Use 6 o 12 meses, o filtre la estación lluviosa.');
  if(kind()==='p'&&seca)w.push('En dic–abr la lluvia normal es de pocos mm: los porcentajes de esos meses son muy variables y no indican sequía por sí solos.');
  if(kind()==='cdd'&&seca)w.push('En la estación seca las rachas largas son normales; la racha seca es indicador de sequía de mayo a octubre.');
  if(HS.enso!=='all'&&!ONI)w.push('El filtro ENOS necesita el ONI, que no se pudo leer.');
  document.getElementById('hWarn').innerHTML=w.map(t=>'<div class="warn" style="margin:6px 0 0">⚠ '+t+'</div>').join('');
  // conjunto filtrado
  const B=[];for(let i=0;i<n;i++)if(pasaFiltro(i)&&S[i]!==null&&S[i]!==undefined)B.push(i);
  renderKpis(S,B,thr,last);renderHeat(S,thr,last);renderSerie(S,thr,last);
  const rank=renderRank(h,S);renderCmpYears(h,S,rank);renderEventos(S,thr,last);renderCanicula(uid);}

function renderKpis(S,B,thr,last){const k=kind(),L=SEV[k].slice(1),box=document.getElementById('hKpis');
  const kp=(n,l,l2,col)=>'<div class="kpi sm" style="border-left-color:'+(col||'var(--lime)')+'"><div class="n">'+n+'</div><div class="l">'+l+'</div>'+(l2?'<div class="l2">'+l2+'</div>':'')+'</div>';
  if(!B.length){box.innerHTML=kp('0','meses con los filtros elegidos','Amplíe los años, meses o la fase ENOS.');return;}
  let h=kp(B.length,'meses analizados',HS.y0+'–'+HS.y1+' · '+mesesTxt()+(HS.enso!=='all'?' · '+FASE_TXT[HS.enso]:''));
  L.forEach(s=>{const c=B.filter(i=>meets(S[i],s.v)).length;h+=kp((100*c/B.length).toFixed(1)+' %','de los meses '+s.t,c+' meses',colorOf(k==='p'?s.v-1:s.v));});
  const worst=B.reduce((a,i)=>a===null?i:(k==='cdd'?(S[i]>S[a]?i:a):(S[i]<S[a]?i:a)),null);
  h+=kp((k==='z'?sg2(S[worst]):k==='p'?nf0(S[worst])+' %':S[worst]+' d'),'valor más extremo',MFULL[mOf(worst)-1]+' '+yOf(worst)+(worst===last?' (en curso)':''),colorOf(S[worst]));
  box.innerHTML=h;}
function mesesTxt(){const m=[...HS.meses].sort((a,b)=>a-b);if(m.length===12)return 'todos los meses';return m.map(x=>MSHORT[x-1]).join(', ');}

function renderHeat(S,thr,last){const el=document.getElementById('hHeat');
  let h='<div class="hh"></div>'+MSHORT.map(t=>'<div class="hh">'+t+'</div>').join('');
  for(let y=HS.y1;y>=HS.y0;y--){h+='<div class="hy'+(HS.cmp.includes(y)?' cmp':'')+'" data-y="'+y+'" title="Clic para comparar '+y+'">'+y+'</div>';
    for(let m=1;m<=12;m++){const i=(y-Y0)*12+m-1;
      if(i>last){h+='<div></div>';continue;}
      const v=S[i];if(v===null||v===undefined){h+='<div class="hc na" title="'+MSHORT[m-1]+' '+y+': sin dato"></div>';continue;}
      const on=pasaFiltro(i)&&meets(v,thr),o=oniAt(i);
      const tt=MFULL[m-1]+' '+y+' · '+idxName()+': '+(kind()==='z'?sg2(v):kind()==='p'?v.toFixed(0)+' %':v+' d')+' ('+catOf(v)+')'+(o!==null?' · ONI '+sg2(o):'')+(i===last?' · mes en curso':'');
      h+='<div class="hc'+(on?'':' off')+(i===last?' cur':'')+'" style="background:'+colorOf(v)+'" title="'+esc(tt)+'"></div>';}}
  el.innerHTML=h;
  document.getElementById('hHeatTtl').textContent='Tabla de color año × mes · '+idxName();
  document.getElementById('hHeatLeg').innerHTML=legendHTML()+'<span style="color:#5c6b62">Atenuado: fuera de los filtros · contorno negro: mes en curso</span>';}

function renderSerie(S,thr,last){const i0=(HS.y0-Y0)*12,i1=Math.min(last,(HS.y1-Y0)*12+11),lab=[],dat=[],col=[],oni=[];
  for(let i=i0;i<=i1;i++){lab.push(yOf(i)+'-'+String(mOf(i)).padStart(2,'0'));const v=S[i];dat.push(v);
    col.push(v===null||v===undefined?'#ddd':(pasaFiltro(i)&&meets(v,thr))?colorOf(v):'#dfe5e1');oni.push(oniAt(i));}
  const k=kind(),ds=[{type:'bar',label:idxName(),data:dat,backgroundColor:col,borderWidth:0,barPercentage:1,categoryPercentage:1,yAxisID:'y'}];
  if(ONI)ds.push({type:'line',label:'ONI (°C)',data:oni,borderColor:'#34495e',borderWidth:1.2,pointRadius:0,yAxisID:'y1',tension:.2});
  const yScale=k==='z'?{suggestedMin:-3,suggestedMax:3,grid:{color:c=>c.tick.value===0?'#999':'#eee'},title:{display:true,text:idxName()}}
    :{beginAtZero:true,title:{display:true,text:k==='p'?'% de la normal':'días'}};
  if(CH.hSerChart)CH.hSerChart.destroy();
  CH.hSerChart=new Chart(document.getElementById('hSerChart'),{data:{labels:lab,datasets:ds},options:{responsive:true,maintainAspectRatio:false,animation:false,
    interaction:{mode:'index',intersect:false},plugins:{legend:{display:true,position:'top'}},
    scales:{x:{ticks:{autoSkip:true,maxTicksLimit:16,maxRotation:0}},y:yScale,y1:{display:!!ONI,position:'right',suggestedMin:-2.5,suggestedMax:2.5,grid:{display:false},title:{display:true,text:'ONI (°C)'}}}}});
  document.getElementById('hSerTtl').textContent='Serie mensual '+HS.y0+'–'+HS.y1+' · '+idxName();
  document.getElementById('hSerNote').textContent='Barras en gris claro: meses fuera de los filtros de meses, ENOS o severidad. ONI: anomalía de la temperatura del Pacífico (Niño 3.4), trimestre centrado en el mes; ≥ +0.5 El Niño, ≤ −0.5 La Niña.';}

function renderRank(h,S){const k=kind(),rows=[],nm=normalesP(h),last=S.length-1;
  for(let y=HS.y0;y<=HS.y1;y++){const ii=[];for(let m=1;m<=12;m++){const i=(y-Y0)*12+m-1;if(i<=last&&pasaFiltro(i)&&S[i]!==null&&S[i]!==undefined)ii.push(i);}
    if(!ii.length)continue;
    let val,peak=null;
    if(k==='z'){peak=ii.reduce((a,i)=>S[i]<S[a]?i:a);val=S[peak];}
    else if(k==='cdd'){peak=ii.reduce((a,i)=>S[i]>S[a]?i:a);val=S[peak];}
    else{let p=0,nr=0;ii.forEach(i=>{p+=h.p[i];nr+=(i===last&&h.hasta_dia)?nm[mOf(i)-1]*h.hasta_dia/daysInMonth(y,mOf(i)):nm[mOf(i)-1];});val=nr?100*p/nr:null;}
    const jja=[6,7,8].map(m=>oniAt((y-Y0)*12+m-1)).filter(v=>v!==null);
    rows.push({y:y,v:val,peak:peak,n:ii.length,nsev:k==='z'?ii.filter(i=>S[i]<=-1).length:k==='cdd'?ii.filter(i=>S[i]>=10).length:null,
      oni:jja.length?avg(jja):null,parcial:ii.includes(last)});}
  rows.sort((a,b)=>k==='cdd'?b.v-a.v:a.v-b.v);
  const top=rows.slice(0,10),th=document.querySelector('#hRank thead'),tb=document.querySelector('#hRank tbody');
  th.innerHTML='<tr><th>#</th><th>Año</th><th>'+(k==='z'?'Mínimo':k==='cdd'?'Racha máx.':'Lluvia / normal')+'</th>'+(k==='p'?'':'<th>Mes</th>')+
    (k==='p'?'':'<th>'+(k==='z'?'Meses ≤ −1':'Meses ≥ 10 d')+'</th>')+'<th>ONI JJA</th></tr>';
  tb.innerHTML=top.map((r,j)=>{const f=fase(r.oni);return '<tr><td>'+(j+1)+'</td><td><b>'+r.y+'</b>'+(r.parcial?' <span class="tag">en curso</span>':'')+'</td>'+
    '<td class="num"><span class="sw" style="background:'+colorOf(r.v)+'"></span>'+(k==='z'?sg2(r.v):k==='cdd'?r.v+' d':nf0(r.v)+' %')+'</td>'+
    (k==='p'?'':'<td>'+MSHORT[mOf(r.peak)-1]+'</td><td class="num">'+r.nsev+' / '+r.n+'</td>')+
    '<td>'+(f?'<span class="pill" style="background:'+FASE_COL[f]+'">'+sg2(r.oni)+'</span>':'—')+'</td></tr>';}).join('')||'<tr><td colspan="6">Sin años con datos en los filtros.</td></tr>';
  document.getElementById('hRankTtl').textContent='Años más secos · '+mesesTxt();
  document.getElementById('hRankNote').textContent=(k==='z'?'Ordenados por el valor mínimo del índice en los meses filtrados.':k==='cdd'?'Ordenados por la racha seca más larga dentro de un mes.':'Ordenados por la lluvia acumulada de los meses filtrados frente a su normal 1991–2020.')+
    (HS.enso!=='all'?' Solo se cuentan los meses en fase '+FASE_TXT[HS.enso]+'.':'')+' ONI JJA: promedio de junio a agosto.';
  return rows;}

function renderCmpYears(h,S,rank){const k=kind(),last=S.length-1;
  let yrs=HS.cmp.slice();let auto=false;
  if(!yrs.length){auto=true;yrs=rank.slice(0,3).map(r=>r.y);const yl=yOf(last);if(!yrs.includes(yl))yrs.push(yl);}
  const pal=['#c0392b','#2980b9','#8e44ad','#16a085','#d35400','#2c3e50'],ds=[];
  yrs.forEach((y,j)=>{const d=[];for(let m=1;m<=12;m++){const i=(y-Y0)*12+m-1;d.push(i>last?null:(k==='p'?h.p[i]:S[i]));}
    ds.push({label:String(y),data:d,borderColor:pal[j%pal.length],backgroundColor:pal[j%pal.length],borderWidth:2.2,pointRadius:2.5,tension:.25,spanGaps:false});});
  if(k==='p')ds.push({label:'Normal 1991–2020',data:normalesP(h).map(v=>v===null?null:Math.round(v)),borderColor:'#7f8c8d',borderDash:[6,4],borderWidth:2,pointRadius:0,fill:false});
  if(k==='z')[-1,-1.5,-2].forEach((t,j)=>ds.push({label:'≤ '+t,data:Array(12).fill(t),borderColor:['#58d68d','#f39c12','#e74c3c'][j],borderDash:[3,4],borderWidth:1,pointRadius:0}));
  if(CH.hCmpChart)CH.hCmpChart.destroy();
  CH.hCmpChart=new Chart(document.getElementById('hCmpChart'),{type:'line',data:{labels:MSHORT.slice(),datasets:ds},options:{responsive:true,maintainAspectRatio:false,animation:false,
    plugins:{legend:{display:true,position:'top',labels:{boxWidth:12,filter:it=>!/^≤/.test(it.text)}}},
    scales:{y:k==='z'?{suggestedMin:-3,suggestedMax:2,title:{display:true,text:idxName()}}:{beginAtZero:true,title:{display:true,text:k==='p'?'mm':'días'}}}}});
  document.getElementById('hCmpTtl').textContent='Comparación de años · '+(k==='p'?'lluvia mensual (mm)':idxName());
  document.getElementById('hCmpNote').textContent=(auto?'Sin años elegidos: se muestran los 3 más secos de los filtros y el año más reciente. ':'')+'Escriba hasta 6 años arriba o haga clic en el año en la tabla de color.'+(k==='z'?' Líneas punteadas: umbrales de alerta del SAAT.':'');}

// Eventos (teoría de rachas de McKee et al., 1993): el evento empieza cuando el índice baja de 0,
// cuenta si llega a ≤ −1.0 y termina cuando vuelve a ser ≥ 0. Igual que el catálogo del Bloque 2.
function eventos(S){const ev=[];let cur=null;
  for(let i=0;i<S.length;i++){const v=S[i];
    if(v!==null&&v!==undefined&&v<0){if(!cur)cur={a:i,b:i,pk:i,mag:0};cur.b=i;cur.mag+=-v;if(v<S[cur.pk])cur.pk=i;}
    else{if(cur&&S[cur.pk]<=-1)ev.push(cur);cur=null;}}
  if(cur&&S[cur.pk]<=-1){cur.abierto=true;ev.push(cur);}
  return ev;}
function renderEventos(S,thr,last){const card=document.getElementById('hEvCard');if(kind()!=='z'){card.style.display='none';return;}card.style.display='';
  const all=eventos(S),f=all.filter(e=>pasaFiltro(e.pk)&&meets(S[e.pk],thr===null?-1:thr));
  f.sort((a,b)=>b.mag-a.mag);
  const ym=i=>MSHORT[mOf(i)-1]+' '+yOf(i);
  document.querySelector('#hEv thead').innerHTML='<tr><th>#</th><th>Inicio</th><th>Fin</th><th>Duración</th><th>Pico</th><th>Mes del pico</th><th>Magnitud</th><th>ONI máx.</th></tr>';
  document.querySelector('#hEv tbody').innerHTML=f.slice(0,15).map((e,j)=>{let om=null;for(let i=e.a;i<=e.b;i++){const o=oniAt(i);if(o!==null&&(om===null||o>om))om=o;}
    const fz=fase(om);return '<tr><td>'+(j+1)+'</td><td>'+ym(e.a)+'</td><td>'+(e.abierto?'<b>en curso</b>':ym(e.b))+'</td><td class="num">'+(e.b-e.a+1)+' meses</td>'+
    '<td class="num"><span class="sw" style="background:'+colorOf(S[e.pk])+'"></span>'+sg2(S[e.pk])+'</td><td>'+ym(e.pk)+'</td><td class="num">'+e.mag.toFixed(1)+'</td>'+
    '<td>'+(fz?'<span class="pill" style="background:'+FASE_COL[fz]+'">'+sg2(om)+'</span>':'—')+'</td></tr>';}).join('')||'<tr><td colspan="8">No hay eventos con los filtros elegidos.</td></tr>';
  document.getElementById('hEvTtl').textContent='Catálogo de eventos de sequía · '+idxName();
  document.getElementById('hEvNote').textContent=f.length+' eventos en los filtros ('+all.length+' en toda la serie)'+(f.length>15?'; se listan los 15 de mayor magnitud':'')+
    '. Evento (McKee et al., 1993): meses seguidos con el índice < 0 que llegan al menos a −1.0. Magnitud = suma de |índice| durante el evento. '+
    'Los filtros de años, meses y ENOS se aplican al mes del pico; la severidad, al valor del pico.'+(HS.scale<=3?' Con 1 o 3 meses los eventos de la estación seca son referenciales.':'');}

function renderCanicula(uid){const C=window.SAAT_CANICULA,th=document.querySelector('#hCan thead'),tb=document.querySelector('#hCan tbody');
  const rows=C&&C.u[uid];if(!rows){th.innerHTML='';tb.innerHTML='<tr><td>Sin datos de canícula para esta unidad.</td></tr>';return;}
  const durs=rows.map(r=>r[7]).filter(v=>v!==null),md=median(durs);
  const R=rows.filter(r=>r[0]>=HS.y0&&r[0]<=HS.y1&&(HS.enso==='all'||fase(r[1])===HS.enso)).sort((a,b)=>b[0]-a[0]);
  th.innerHTML='<tr><th>Año</th><th>ONI JJA</th><th>Inicio estación</th><th>Canícula</th><th>Duración</th><th>Profundidad</th><th>Racha seca</th><th>Ventana primera</th><th>Ventana postrera</th><th>Fin estación</th></tr>';
  tb.innerHTML=R.map(r=>{const f=fase(r[1]),dc=r[7]===null?'':r[7]>=1.5*md?'#f6c9c0':r[7]<=0.6*md?'#d6eaf8':'';
    return '<tr><td><b>'+r[0]+'</b></td><td>'+(f?'<span class="pill" style="background:'+FASE_COL[f]+'">'+sg2(r[1])+'</span>':'—')+'</td>'+
      '<td>'+fmd(r[2])+(r[4]?' <span class="tag">falso inicio</span>':'')+'</td><td>'+(r[5]?fmd(r[5])+' – '+fmd(r[6]):'no definida')+'</td>'+
      '<td class="num" style="background:'+dc+'">'+(r[7]===null?'—':r[7]+' d')+'</td><td class="num">'+(r[8]===null?'—':r[8]+' %')+'</td><td class="num">'+(r[9]===null?'—':r[9]+' d')+'</td>'+
      '<td class="num">'+(r[10]===null?'—':r[10]+' d')+'</td><td class="num">'+(r[11]===null?'—':r[11]+' d')+'</td><td>'+(r[3]?fmd(r[3]):'—')+'</td></tr>';}).join('')||'<tr><td colspan="10">Sin años en los filtros.</td></tr>';
  document.getElementById('hCanNote').innerHTML='Canícula por media móvil triangular de 31 días; estación lluviosa por balance pentadal (P &gt; PET sostenido). '+
    'Duración mediana: <b>'+nf0(md)+' días</b>; en rojo, canículas ≥ 1.5 veces la mediana; en azul, ≤ 0.6 veces. Ventana de primera = inicio de la estación → inicio de la canícula; '+
    'de postrera = fin de la canícula → fin de la estación. Datos fijos del Bloque 2 (CHIRPS final hasta el 30-sep-2026); el filtro de meses no se aplica a esta tabla.';}

function exportHist(){const h=HIST[curUnit];if(!h)return;const thr=SEV[kind()][HS.sev].v,S=serieDe(h);
  const cols=['p','spi1','spi3','spi6','spi12','spei1','spei3','spei6','spei12','cdd'];
  const L=['unidad,anio,mes,'+cols.map(c=>c==='p'?'P_mm':c==='cdd'?'CDD_mes_d':c.toUpperCase().replace(/(\d+)/,'_$1')).join(',')+',P_pct_normal,ONI'];
  const nm=normalesP(h);
  for(let i=0;i<h.p.length;i++){if(!pasaFiltro(i)||!meets(S[i],thr))continue;
    const pp=h.p[i]===null||!nm[i%12]?'':(100*h.p[i]/nm[i%12]).toFixed(0);
    L.push([curUnit,yOf(i),mOf(i)].concat(cols.map(c=>{const v=h[c]&&h[c][i];return v===null||v===undefined?'':v;})).concat([pp,oniAt(i)===null?'':oniAt(i)]).join(','));}
  download('SAAT_v4_historial_'+curUnit+'_'+HS.idx+(kind()==='z'?HS.scale:'')+'_'+new Date().toISOString().slice(0,10)+'.csv',L.join('\n'));}

/* ===========================================================================
   CLIMA DE REFERENCIA (Dashboard): Bloque 1 + fechas del Bloque 2
   =========================================================================== */
const CR=()=>window.SAAT_CLIMA&&window.SAAT_CLIMA.u;
const anualT=(u,k)=>avg(u[k]);
let cVar='Pan',cMap=null,cLySubs=null,cLyMuni=null,cMuniDib=null;
const RAMPA={Pan:['#eff3ff','#c6dbef','#9ecae1','#6baed6','#3182bd','#08519c'],pMO:['#f7fcf0','#d9f0d3','#a6dba0','#5aae61','#1b7837','#00441b'],
  T:['#ffffb2','#fed976','#feb24c','#fd8d3c','#f03b20','#bd0026']};
const VTXT={Pan:'Lluvia anual (mm)',pMO:'Lluvia de mayo a octubre (% del año)',TX:'Temperatura máxima media (°C)',TM:'Temperatura media (°C)',TN:'Temperatura mínima media (°C)'};
function cVal(u,k){return k==='Pan'||k==='pMO'?u[k]:anualT(u,k);}
function cRango(k){const v=Object.keys(CR()).filter(id=>UNITS[id]&&UNITS[id].tipo==='subcuenca').map(id=>cVal(CR()[id],k));
  let a=Math.min(...v),b=Math.max(...v);const st=k==='Pan'?50:k==='pMO'?0.5:0.5;a=Math.floor(a/st)*st;b=Math.ceil(b/st)*st;return [a,b];}
function cColor(k,v){const [a,b]=cRango(k),R=RAMPA[k[0]==='T'?'T':k];if(v===null||v===undefined)return '#ccc';
  const j=Math.max(0,Math.min(R.length-1,Math.floor((v-a)/(b-a)*R.length)));return R[j];}

function renderClima(){const C=CR();const u=C&&C[curUnit];const box=document.getElementById('cKpis');
  if(!u){box.innerHTML='<div class="warn">Falta data/clima_ref.js.</div>';return;}
  const tm=anualT(u,'TM'),iw=u.TM.indexOf(Math.max(...u.TM)),ic=u.TM.indexOf(Math.min(...u.TM));
  const kp=(n,l,l2)=>'<div class="kpi sm"><div class="n">'+n+'</div><div class="l">'+l+'</div>'+(l2?'<div class="l2">'+l2+'</div>':'')+'</div>';
  box.innerHTML=kp(nf0(u.Pan)+' mm','Lluvia anual normal','El '+nf1(u.pMO)+' % cae de mayo a octubre · CV anual '+nf1(u.cv)+' %')+
    kp(nf1(tm)+' °C','Temperatura media anual','Máx. '+nf1(anualT(u,'TX'))+' °C · mín. '+nf1(anualT(u,'TN'))+' °C')+
    kp(MFULL[iw],'Mes más cálido ('+nf1(u.TM[iw])+' °C)','Más fresco: '+MFULL[ic].toLowerCase()+' ('+nf1(u.TM[ic])+' °C)')+
    kp(nf0(u.z)+' m','Elevación media','La temperatura se corrige −6.5 °C por cada 1,000 m sobre la celda POWER (927 m)')+
    kp(fmd(u.inicio)+' – '+fmd(u.fin),'Estación lluviosa (normal)',u.can?'Canícula: '+fmd(u.can[0])+' – '+fmd(u.can[1])+' (profundidad '+nf0(u.canProf)+' %)':'')+
    kp((u.sen10>=0?'+':'')+nf0(u.sen10)+' mm/década','Tendencia de la lluvia anual 1981–2025',u.mk_p<0.05?'Significativa (Mann-Kendall, p = '+u.mk_p.toFixed(3)+')':'No significativa (Mann-Kendall, p = '+u.mk_p.toFixed(2)+')');
  // climograma
  if(CH.cClimChart)CH.cClimChart.destroy();
  CH.cClimChart=new Chart(document.getElementById('cClimChart'),{data:{labels:MSHORT.slice(),datasets:[
    {type:'line',label:'Tmáx (°C)',data:u.TX,borderColor:'#c0392b',backgroundColor:'#c0392b',yAxisID:'y1',tension:.3,pointRadius:2},
    {type:'line',label:'Tmed (°C)',data:u.TM,borderColor:'#e67e22',backgroundColor:'#e67e22',yAxisID:'y1',tension:.3,pointRadius:2},
    {type:'line',label:'Tmín (°C)',data:u.TN,borderColor:'#2980b9',backgroundColor:'#2980b9',yAxisID:'y1',tension:.3,pointRadius:2},
    {type:'bar',label:'Lluvia (mm)',data:u.P,backgroundColor:'#7fb3d5',borderRadius:3,yAxisID:'y'}]},
    options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false},plugins:{legend:{position:'top',labels:{boxWidth:12}}},
      scales:{y:{beginAtZero:true,title:{display:true,text:'Lluvia (mm/mes)'}},y1:{position:'right',suggestedMin:10,suggestedMax:35,grid:{display:false},title:{display:true,text:'Temperatura (°C)'}}}}});
  document.getElementById('cClimNote').textContent='Lluvia: CHIRPS v2.0 promediado por área, sin corrección de sesgo. Temperatura: NASA POWER corregida por altitud (Bloque 1, Tabla 13), incertidumbre ±0.5 °C.';
  // lluvia anual
  const yrs=[],cols=[],can=(window.SAAT_CANICULA&&window.SAAT_CANICULA.u[curUnit])||[];const oj={};can.forEach(r=>oj[r[0]]=r[1]);
  for(let y=1981;y<=2025;y++){yrs.push(y);const f=fase(oj[y]);cols.push(f==='nino'?'#e59866':f==='nina'?'#85c1e9':'#a9cce3');}
  const mid=(1981+2025)/2,b0=median(u.Pyr.map((v,j)=>v-u.sen10/10*(1981+j-mid)));
  if(CH.cYrChart)CH.cYrChart.destroy();
  CH.cYrChart=new Chart(document.getElementById('cYrChart'),{data:{labels:yrs,datasets:[
    {type:'line',label:'Normal 1991–2020',data:yrs.map(()=>u.Pan),borderColor:'#1c2b22',borderDash:[6,4],borderWidth:1.5,pointRadius:0},
    {type:'line',label:'Tendencia (Sen)',data:yrs.map(y=>Math.round(b0+u.sen10/10*(y-mid))),borderColor:'#8e44ad',borderWidth:1.5,pointRadius:0},
    {type:'bar',label:'Lluvia anual (mm)',data:u.Pyr,backgroundColor:cols,borderRadius:2}]},
    options:{responsive:true,maintainAspectRatio:false,animation:false,plugins:{legend:{position:'top',labels:{boxWidth:12}}},scales:{y:{beginAtZero:false,title:{display:true,text:'mm/año'}},x:{ticks:{maxRotation:0,autoSkip:true,maxTicksLimit:12}}}}});
  const mn=u.Pyr.indexOf(Math.min(...u.Pyr));
  document.getElementById('cYrNote').innerHTML='Barras naranjas: años El Niño (ONI de junio a agosto ≥ +0.5); azules: La Niña; celestes: neutros. '+
    'Año más seco: <b>'+(1981+mn)+'</b> ('+nf0(u.Pyr[mn])+' mm). La serie termina en 2025, último año completo con CHIRPS final; 2026 se sigue en la pestaña Historial.';
  renderCTabla();drawCMap();}

function renderCTabla(){const C=CR(),M=MUNI_ORDER.filter(k=>C[k]);
  document.querySelector('#cTbl thead').innerHTML='<tr><th>Variable</th>'+M.map(k=>'<th>'+GEO.municipios[k].nombre+'</th>').join('')+'</tr>';
  const F=[['Lluvia anual (mm)',u=>nf0(u.Pan)],['% de mayo a octubre',u=>nf1(u.pMO)+' %'],['CV de la lluvia anual',u=>nf1(u.cv)+' %'],
    ['Tmáx media (°C)',u=>nf1(anualT(u,'TX'))],['Tmed (°C)',u=>nf1(anualT(u,'TM'))],['Tmín media (°C)',u=>nf1(anualT(u,'TN'))],['Elevación media (m)',u=>nf0(u.z)],
    ['Inicio de la estación',u=>fmd(u.inicio)],['Canícula',u=>u.can?fmd(u.can[0])+' – '+fmd(u.can[1]):'—'],['Profundidad de la canícula',u=>nf0(u.canProf)+' %'],
    ['Fin de la estación',u=>fmd(u.fin)],['Tendencia lluvia (mm/década)',u=>(u.sen10>=0?'+':'')+nf0(u.sen10)+(u.mk_p<0.05?' *':'')]];
  document.querySelector('#cTbl tbody').innerHTML=F.map(([l,f])=>'<tr><td>'+l+'</td>'+M.map(k=>'<td class="num"'+(k===curMuni?' style="font-weight:700"':'')+'>'+f(C[k])+'</td>').join('')+'</tr>').join('');
  document.getElementById('cTblNote').textContent='Municipio completo, normales 1991–2020. * = tendencia significativa (p < 0.05).';}

function popClima(id){const u=CR()[id],U=UNITS[id];if(!u||!U)return '';
  const r=(l,v)=>'<tr><td>'+l+'</td><td><b>'+v+'</b></td></tr>';
  return '<div class="cpop"><b>'+esc(U.short)+' ('+id+')</b><br><span style="color:#5c6b62">'+nf1(U.area)+' km² · elevación media '+nf0(u.z)+' m</span>'+
    '<table>'+r('Lluvia anual',nf0(u.Pan)+' mm')+r('May–oct',nf1(u.pMO)+' %')+r('CV anual',nf1(u.cv)+' %')+
    r('Tmáx media',nf1(anualT(u,'TX'))+' °C')+r('Tmed',nf1(anualT(u,'TM'))+' °C')+r('Tmín media',nf1(anualT(u,'TN'))+' °C')+
    r('Estación lluviosa',fmd(u.inicio)+' – '+fmd(u.fin))+(u.can?r('Canícula',fmd(u.can[0])+' – '+fmd(u.can[1])):'')+'</table>'+
    '<button class="btn" style="padding:5px 10px;font-size:.76rem;margin-top:4px" data-sel="'+id+'">Analizar esta subcuenca</button></div>';}
function initCMap(){if(cMap||typeof L==='undefined')return;
  cMap=L.map('cMap',{scrollWheelZoom:false,zoomControl:true,attributionControl:true});
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',{maxZoom:16,attribution:'© Esri'}).addTo(cMap);
  cMap.createPane('cm');cMap.getPane('cm').style.zIndex=420;cMap.getPane('cm').style.pointerEvents='none';
  cLySubs=L.layerGroup().addTo(cMap);cLyMuni=L.layerGroup().addTo(cMap);
  cMap.on('popupopen',e=>{const b=e.popup.getElement().querySelector('[data-sel]');if(b)b.addEventListener('click',()=>{cMap.closePopup();selectUnit(b.dataset.sel);});});
  segBind('cMapSeg',b=>{cVar=b.dataset.v;styleCMap();});}
function drawCMap(){const el=document.getElementById('cMap');if(typeof L==='undefined'){el.innerHTML='<div style="padding:20px;color:#5c6b62">Mapa no disponible (sin Leaflet).</div>';return;}
  initCMap();if(el.offsetWidth===0)return;cMap.invalidateSize();
  if(cMuniDib!==curMuni){cMuniDib=curMuni;cLySubs.clearLayers();cLyMuni.clearLayers();
    (GEO.subcuencas[curMuni]||[]).forEach(s=>{if(s.astilla||!CR()[s.id])return;
      const ly=L.geoJSON({type:'Feature',geometry:s.geometry,properties:{id:s.id}},{style:{color:'#fff',weight:1,fillOpacity:.85,fillColor:'#ccc'}});
      ly.__id=s.id;ly.bindPopup(()=>popClima(s.id),{maxWidth:260});ly.addTo(cLySubs);});
    L.geoJSON({type:'Feature',geometry:GEO.municipios[curMuni].geometry,properties:{}},{pane:'cm',interactive:false,style:{color:'#1c2b22',weight:2,fill:false}}).addTo(cLyMuni);
    const bb=L.featureGroup(cLySubs.getLayers().concat(cLyMuni.getLayers())).getBounds();if(bb.isValid())cMap.fitBounds(bb,{padding:[8,8]});}
  styleCMap();}
function styleCMap(){if(!cLySubs)return;
  cLySubs.eachLayer(ly=>{const id=ly.__id,u=CR()[id],v=cVal(u,cVar),sel=id===curUnit;
    ly.setStyle({fillColor:cColor(cVar,v),color:sel?'#A4CD39':'#ffffff',weight:sel?4:1,fillOpacity:.85});if(sel)ly.bringToFront();
    ly.unbindTooltip();ly.bindTooltip(UNITS[id].short+' ('+id+'): <b>'+(cVar==='Pan'?nf0(v)+' mm':cVar==='pMO'?nf1(v)+' %':nf1(v)+' °C')+'</b>',{sticky:true});});
  const [a,b]=cRango(cVar),R=RAMPA[cVar[0]==='T'?'T':cVar],st=(b-a)/R.length,f=v=>cVar==='Pan'?nf0(v):nf1(v);
  document.getElementById('cMapLeg').innerHTML='<b style="color:#5c6b62">'+VTXT[cVar]+':</b>'+R.map((c,j)=>'<span><i style="background:'+c+'"></i>'+f(a+j*st)+'–'+f(a+(j+1)*st)+'</span>').join('')+
    '<span><i style="background:#fff;border:3px solid #A4CD39"></i>Unidad seleccionada</span>'+
    (cVar[0]==='T'?'<span style="color:#b9770e">Las diferencias de temperatura entre subcuencas provienen de la corrección por elevación: NASA POWER (0.5°) no distingue subcuencas vecinas.</span>':
     '<span style="color:#5c6b62">CHIRPS (≈5 km) apenas distingue subcuencas vecinas; las diferencias pequeñas no son significativas.</span>');}
