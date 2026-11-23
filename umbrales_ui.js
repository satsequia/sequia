/* ===========================================================================
   SAAT Sequías v6 · Pestaña «Umbrales» y nivel técnico en Inicio, Mapa y Alertas
   GOAL · HN-M26-53765 · M.Sc. Roberto Elías Granados Chahín
   Requiere ingest/umbrales_motor.js, data/umbrales.js y app.js.
   =========================================================================== */
const nfmm=v=>(v===null||v===undefined)?'—':Math.round(v).toLocaleString('es-HN');
function nivPill(n,txt){if(n===null||n===undefined)return '<span class="pill" style="background:#b8c2bd">SIN EVALUAR</span>';
  const N=NIVELES[n];return '<span class="pill" style="background:'+N.c+'">'+(txt||N.t)+'</span>';}
function serieTec(id){return tieneDoc('chirps__'+id)&&powerReadyFor(id);}
// Nivel técnico compacto de una unidad: resumen de la ingesta o cálculo local si su serie está cargada
function tecOf(id){
  if(serieTec(id)){try{return tecCompacto(tecnicoNow(id));}catch(e){console.warn('tec',id,e.message);}}
  const r=RESUMEN&&RESUMEN.u&&RESUMEN.u[id]&&RESUMEN.u[id].chirps;return (r&&r.tec)||null;}
function tecLluviaTxt(l){if(!l)return 'Lluvia del ciclo: aún sin evaluación (se evalúa desde el cierre del 2.º mes del ciclo).';
  const C=CICLOS[l.c];return '<b>Lluvia de la '+C.nombre.toLowerCase()+'</b> ('+MSHORT[C.m0-1].toLowerCase()+'–'+MSHORT[l.m-1].toLowerCase()+'): <b>'+nfmm(l.p)+' mm</b>'+
    ' · normal '+nfmm(l.u[0])+' · umbrales verde ≤ '+nfmm(l.u[1])+' / amarilla ≤ '+nfmm(l.u[2])+' / roja ≤ '+nfmm(l.u[3])+' mm → '+nivPill(l.n);}
function tecSpeiTxt(s){if(!s)return 'SPEI-3 persistente: aún sin dos meses completos de la temporada.';
  return '<b>SPEI-3 de dos meses seguidos</b>: '+MSHORT[s.m1-1].toLowerCase()+' '+fmt(s.z1)+' · '+MSHORT[s.m2-1].toLowerCase()+' '+fmt(s.z2)+' → '+nivPill(s.n);}
function tecFaseTxt(t){return t.f==='inicio'?'Temporada '+t.y+' en inicio: la primera evaluación es al cierre de junio.':
  t.f==='cierre'?'Temporada '+t.y+' cerrada (may–oct): se muestra el nivel con que cerró. La próxima evaluación es al cierre de junio.':
  'Temporada '+t.y+' en curso · evaluación al fin de cada mes.';}

/* ---- Inicio: tarjeta de nivel técnico ---- */
function renderTecInicio(){const el=document.getElementById('tecInicio');if(!el)return;
  if(!UMBR){el.innerHTML='<div class="warn">Falta data/umbrales.js: no se puede calcular el nivel técnico.</div>';return;}
  const t=tecOf(curUnit);
  if(!t){el.innerHTML='<h3 class="sec">Nivel técnico de alerta (umbrales por ciclo)</h3><p class="note">Sin datos CHIRPS y de temperatura cargados para esta unidad.</p>';return;}
  el.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><h3 class="sec" style="margin:0">Nivel técnico de alerta · umbrales por ciclo productivo</h3>'+
    '<span style="font-size:1rem">'+nivPill(t.n,t.n===null?null:'NIVEL TÉCNICO: '+NIVELES[t.n].t)+'</span></div>'+
    '<p class="par" style="margin-top:8px">'+tecLluviaTxt(t.l)+'</p><p class="par">'+tecSpeiTxt(t.s)+'</p>'+
    '<p class="note">'+tecFaseTxt(t)+' Siempre con CHIRPS (los umbrales son milímetros de CHIRPS), datos al '+fechaTxt(t.asof)+
    '. Es un nivel <b>técnico</b>: la declaratoria municipal requiere confirmación con indicadores locales (pestaña 🎯 Umbrales). Propuesta pendiente de validación.</p>';}

/* ---- Pestaña Umbrales ---- */
let uCiclo='primera',uCmp=[2015,2023];
function aniosUmb(txt){return [...new Set(String(txt).split(/[^0-9]+/).map(Number).filter(y=>y>=Y0&&y<=CAL_YEAR))].slice(0,5);}
function acumCiclo(uid,ck,y){const a=asOfO(uid,'chirps'),e=cicloEstado(uid,ck,y,a);if(!e)return [];
  const v=e.pasos.map(p=>p.p);if(e.enCurso)v.push(e.enCurso.p);return v;}
function renderUmbChart(uid){if(typeof Chart==='undefined')return;const C=CICLOS[uCiclo],U=umbralesDe(uid,uCiclo);if(!U)return;
  const lab=U.map((x,k)=>MSHORT[C.m0+k-1]),t=tecnicoNow(uid),yA=t.anio,cols=['#8e44ad','#2980b9','#16a085','#d35400','#7f8c8d'];
  const band=(i,c,fill)=>({label:['Normal 1991–2020','Umbral verde','Umbral amarillo','Umbral rojo'][i],data:U.map(x=>x[i]),borderColor:c,borderWidth:i?1:2,borderDash:i?[]:[6,4],pointRadius:0,backgroundColor:fill,fill:fill?(i===3?'origin':'+1'):false,order:10});
  const ds=[band(1,'#58d68d','rgba(88,214,141,.35)'),band(2,'#f39c12','rgba(243,156,18,.35)'),band(3,'#e74c3c','rgba(231,76,60,.35)'),band(0,'#1c2b22',null)];
  const act=acumCiclo(uid,uCiclo,yA),est=cicloEstado(uid,uCiclo,yA,asOfO(uid,'chirps'));
  ds.push({label:yA+(est&&est.enCurso?' (mes en curso al día '+est.enCurso.dia+')':''),data:act,borderColor:'#000',backgroundColor:'#000',borderWidth:2.5,pointRadius:4,order:1});
  uCmp.filter(y=>y!==yA).forEach((y,i)=>ds.push({label:String(y),data:acumCiclo(uid,uCiclo,y),borderColor:cols[i%5],backgroundColor:cols[i%5],borderWidth:1.6,pointRadius:3,order:2}));
  if(CH.uChart)CH.uChart.destroy();
  CH.uChart=new Chart(document.getElementById('uChart'),{type:'line',data:{labels:lab,datasets:ds},options:{responsive:true,maintainAspectRatio:false,
    plugins:{legend:{position:'bottom',labels:{boxWidth:14,font:{size:11}}},tooltip:{callbacks:{label:c=>c.dataset.label+': '+nfmm(c.parsed.y)+' mm'}}},
    scales:{y:{beginAtZero:true,title:{display:true,text:'Lluvia acumulada desde el 1 de '+MFULL[C.m0-1].toLowerCase()+' (mm)'}},x:{title:{display:true,text:'Acumulado hasta el fin de…'}}}}});}
function renderUmbTabla(uid,t){const tb=document.querySelector('#uTabla tbody');tb.innerHTML='';
  ['primera','postrera','lluviosa'].forEach(ck=>{const C=CICLOS[ck],U=umbralesDe(uid,ck),e=t[ck];
    U.forEach((x,k)=>{const p=e.pasos[k],ec=(e.enCurso&&e.enCurso.k===k+1)?e.enCurso:null;
      const obs=p?nfmm(p.p)+' mm':ec?nfmm(ec.p)+' mm <span style="color:var(--muted)">(al día '+ec.dia+')</span>':'—';
      const niv=p?(k===0?'<span style="color:var(--muted)">indicativo</span>':nivPill(p.nivel)):ec?'<span style="color:var(--muted)">en curso</span>':'';
      const pc=i=>x[0]?' <span style="color:var(--muted)">('+Math.round(100*x[i]/x[0])+' %)</span>':'';
      tb.insertAdjacentHTML('beforeend','<tr'+(k===0?' style="border-top:2px solid var(--line)"':'')+'><td>'+(k===0?'<b>'+C.nombre+'</b>':'')+'</td><td>'+MSHORT[C.m0-1].toLowerCase()+(k?'–'+MSHORT[C.m0+k-1].toLowerCase():'')+'</td>'+
        '<td class="num">'+nfmm(x[0])+'</td><td class="num" style="background:#e3f7ea">'+nfmm(x[1])+pc(1)+'</td><td class="num" style="background:#fdebd0">'+nfmm(x[2])+pc(2)+'</td><td class="num" style="background:#fadbd8">'+nfmm(x[3])+pc(3)+'</td>'+
        '<td class="num">'+obs+'</td><td>'+niv+'</td></tr>');});});}
function renderUmbRetro(uid){const a=asOfO(uid,'chirps'),yMax=a.m>=5?a.y:a.y-1,el=document.getElementById('uRetro');
  const filas=[['Primera',y=>tecnicoEn(uid,y,a).primera.max],['Postrera',y=>tecnicoEn(uid,y,a).postrera.max],['SPEI-3 (2 meses)',y=>{const t=tecnicoEn(uid,y,a);return speiPersist(uid,y,a).max;}],['Nivel técnico',y=>tecnicoEn(uid,y,a).max]];
  const yrs=[];for(let y=Y0;y<=yMax;y++)yrs.push(y);
  let h='<div class="retro" style="grid-template-columns:130px repeat('+yrs.length+',minmax(11px,1fr))">';
  filas.forEach((f,i)=>{h+='<div class="rl"'+(i===3?' style="font-weight:800"':'')+'>'+f[0]+'</div>';
    yrs.forEach(y=>{const n=f[1](y);h+='<div class="rc" title="'+y+' · '+f[0]+': '+(n===null?'sin evaluar':NIVELES[n].t.toLowerCase())+'" style="background:'+(n===null?'#fff':n===0?'#eef1ee':NIVELES[n].c)+'"></div>';});});
  h+='<div class="rl"></div>'+yrs.map(y=>'<div class="ry">'+(y%5===0||y===yMax?y:'')+'</div>').join('')+'</div>';
  const cnt=k=>yrs.filter(y=>{const n=tecnicoEn(uid,y,a).max;return n!==null&&n>=k;});
  const am=cnt(2);
  el.innerHTML=h+'<p class="note" style="margin-top:8px">Nivel más alto alcanzado cada temporada. En '+yrs.length+' temporadas el nivel técnico habría sido verde o superior en <b>'+cnt(1).length+'</b>, amarillo o superior en <b>'+am.length+'</b> y rojo en <b>'+cnt(3).length+'</b>.'+
    (am.length?' Años con nivel amarillo o rojo: '+am.join(', ')+'.':'')+' Pase el cursor sobre una celda para ver el año.</p>';}
function renderUmb(){const uid=curUnit,box=document.getElementById('uEstado');
  if(!UMBR||!umbralesDe(uid,'primera')){box.innerHTML='<div class="warn">No hay umbrales definidos para esta unidad (data/umbrales.js).</div>';return;}
  if(!serieTec(uid)){box.innerHTML='<p class="note">Cargando la serie de la unidad…</p>';return;}
  const t=tecnicoNow(uid),c=tecCompacto(t);
  box.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><h3 class="sec" style="margin:0">Nivel técnico vigente · temporada '+t.anio+'</h3>'+
    '<span style="font-size:1rem">'+nivPill(t.nivel,t.nivel===null?null:'NIVEL TÉCNICO: '+NIVELES[t.nivel].t)+'</span></div>'+
    '<p class="par" style="margin-top:8px">'+tecLluviaTxt(c.l)+'</p><p class="par">'+tecSpeiTxt(c.s)+'</p>'+
    '<p class="note">'+tecFaseTxt(c)+' Nivel más alto de la temporada: <b>'+(t.max===null?'sin evaluar':NIVELES[t.max].t.toLowerCase())+'</b>. CHIRPS al '+fechaTxt(t.asof)+
    (esPreliminar(uid,'chirps',t.asof)?' (incluye días preliminares)':'')+'.</p>'+
    (curSrc!=='chirps'?'<div class="warn" style="margin-top:8px">La fuente activa es '+SOURCES[curSrc].name+', pero esta pestaña usa siempre <b>CHIRPS</b>: los umbrales son milímetros de CHIRPS.</div>':'');
  document.getElementById('uChartTtl').textContent='Lluvia acumulada de la '+CICLOS[uCiclo].nombre.toLowerCase()+' ('+CICLOS[uCiclo].rango+') frente a sus umbrales';
  renderUmbChart(uid);renderUmbTabla(uid,t);renderUmbRetro(uid);}
function exportUmb(){const uid=curUnit,L=['unidad,nombre,ciclo,acumulado_desde,acumulado_hasta,normal_mm,verde_mm,amarilla_mm,roja_mm'];
  ['primera','postrera','lluviosa'].forEach(ck=>{const C=CICLOS[ck];(umbralesDe(uid,ck)||[]).forEach((x,k)=>L.push([uid,'"'+UNITS[uid].short+'"',ck,MSHORT[C.m0-1],MSHORT[C.m0+k-1],x[0],x[1],x[2],x[3]].join(',')));});
  download('SAAT_v6_'+uid+'_umbrales.csv',L.join('\n'));}
(function(){const g=id=>document.getElementById(id);if(!g('umbrales'))return;
  segBind('uCicloSeg',b=>{uCiclo=b.dataset.c;renderUmb();});
  g('uCmp').addEventListener('change',e=>{uCmp=aniosUmb(e.target.value);e.target.value=uCmp.join(', ');renderUmb();});
  g('uCsv').addEventListener('click',exportUmb);})();
