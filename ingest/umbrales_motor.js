/* ===========================================================================
   SAAT Sequías v5 · Umbrales por ciclo productivo y NIVEL TÉCNICO de alerta
   GOAL · HN-M26-53765 · M.Sc. Roberto Elías Granados Chahín

   Aplica el documento «Umbrales de Alerta Temprana» (Bloque 3):
     1. Lluvia acumulada del ciclo (primera may–jul, postrera ago–oct) frente a los umbrales en mm
        de data/umbrales.js (equivalen a SPI −1.0 / −1.5 / −2.0); se evalúa al fin de cada mes
        desde el 2.º mes del ciclo.
     2. SPEI-3 mensual con persistencia: dos meses completos seguidos (may–oct) bajo el umbral.
     Nivel técnico = el mayor de los dos. SIEMPRE con CHIRPS (los umbrales son mm de CHIRPS).
   Lo usan la web y la ingesta (resumen.js). Requiere indices.js, motor_unidades.js y data/umbrales.js.
   =========================================================================== */
const UMBR=(typeof window!=='undefined'&&window.SAAT_UMBRALES)||null;
const CICLOS={primera:{m0:5,n:3,nombre:'Primera',rango:'may–jul'},postrera:{m0:8,n:3,nombre:'Postrera',rango:'ago–oct'},
  lluviosa:{m0:5,n:6,nombre:'Estación lluviosa',rango:'may–oct'}};
const NIVELES=[{k:'normal',t:'SIN ALERTA',c:'#7f8c8d'},{k:'verde',t:'VERDE',c:'#58d68d'},{k:'amarilla',t:'AMARILLA',c:'#f39c12'},{k:'roja',t:'ROJA',c:'#e74c3c'}];
function umbralesDe(uid,ck){return (UMBR&&UMBR.u[uid])?UMBR.u[uid][ck]:null;}     // [[normal,verde,amarilla,roja],…] por paso
function nivelDeLluvia(p,um){return (p===null||p===undefined||!um)?null:p<=um[3]?3:p<=um[2]?2:p<=um[1]?1:0;}
function nivelDeIndice(z){return (z===null||z===undefined)?null:z<=-2?3:z<=-1.5?2:z<=-1?1:0;}
function mesCompleto(a,y,m){return a.y>y||(a.y===y&&(a.m>m||(a.m===m&&a.d>=daysInMonth(y,m))));}

// Estado de un ciclo del año y con datos hasta a={y,m,d}: pasos mensuales cerrados y mes en curso
function cicloEstado(uid,ck,y,a){const C=CICLOS[ck],U=umbralesDe(uid,ck);if(!U)return null;
  const pasos=[];let ac=0,ok=true,enCurso=null;
  for(let k=1;k<=C.n&&ok;k++){const m=C.m0+k-1;
    if(mesCompleto(a,y,m)){const v=sumMonth(uid,'chirps',y,m);
      if(v===null)ok=false;else{ac+=v;pasos.push({k:k,mes:m,p:ac,um:U[k-1],nivel:nivelDeLluvia(ac,U[k-1]),evalua:k>=2});}}
    else{if(a.y===y&&a.m===m){const v=sumToDay(uid,'chirps',y,m,a.d);if(v!==null)enCurso={k:k,mes:m,dia:a.d,p:ac+v,um:U[k-1]};}ok=false;}}
  const ev=pasos.filter(p=>p.evalua);
  return {ciclo:ck,anio:y,pasos:pasos,enCurso:enCurso,cerrado:pasos.length===C.n,
    ultimo:ev.length?ev[ev.length-1]:null,max:ev.length?Math.max.apply(null,ev.map(p=>p.nivel)):null};}

// SPEI-3 de los meses completos de may a oct y nivel con persistencia de 2 meses seguidos
function speiPersist(uid,y,a){const zs=[];
  for(let m=5;m<=10;m++){if(!mesCompleto(a,y,m))break;zs.push({m:m,z:speiAt(uid,'chirps',3,y,m)});}
  let max=null,ult=null;
  for(let i=1;i<zs.length;i++){const z1=zs[i-1].z,z2=zs[i].z;if(z1===null||z2===null){ult=null;continue;}
    const n=Math.min(nivelDeIndice(z1),nivelDeIndice(z2));max=max===null?n:Math.max(max,n);
    ult={m1:zs[i-1].m,m2:zs[i].m,z1:z1,z2:z2,nivel:n};}
  return {ultimo:ult,max:max,meses:zs};}

// Nivel técnico de la temporada del año y con datos hasta a. nivel = vigente (última evaluación);
// max = el más alto alcanzado en la temporada (criterio del retroanálisis del documento).
function tecnicoEn(uid,y,a){if(!umbralesDe(uid,'primera'))return null;
  return memo('tec|'+uid+'|'+y+'|'+a.y+'|'+a.m+'|'+a.d,()=>{
    const pr=cicloEstado(uid,'primera',y,a),po=cicloEstado(uid,'postrera',y,a),ll=cicloEstado(uid,'lluviosa',y,a),sp=speiPersist(uid,y,a);
    const vig=(po&&po.ultimo)?po:(pr&&pr.ultimo)?pr:null;
    const nl=vig?vig.ultimo.nivel:null,ns=sp.ultimo?sp.ultimo.nivel:null;
    const nivel=(nl===null&&ns===null)?null:Math.max(nl===null?0:nl,ns===null?0:ns);
    const mx=[pr.max,po.max,sp.max].filter(v=>v!==null);
    return {anio:y,fase:!mesCompleto(a,y,6)?'inicio':mesCompleto(a,y,10)?'cierre':'activa',nivel:nivel,max:mx.length?Math.max.apply(null,mx):null,
      lluvia:vig?{ciclo:vig.ciclo,mes:vig.ultimo.mes,p:vig.ultimo.p,um:vig.ultimo.um,nivel:nl}:null,spei:sp.ultimo,
      primera:pr,postrera:po,lluviosa:ll,speiMeses:sp.meses};});}
// Temporada vigente: la del año del último dato CHIRPS; de enero a abril, la que cerró en octubre anterior
function tecnicoNow(uid){const a=asOfO(uid,'chirps'),y=a.m>=5?a.y:a.y-1,t=tecnicoEn(uid,y,a);
  return t?Object.assign({},t,{asof:a}):null;}
// Versión compacta para v3_meta/resumen (mapa, tabla y alertas sin cargar la serie de cada unidad)
function tecCompacto(t){if(!t)return null;const r1=v=>Math.round(v*10)/10,r2=v=>Math.round(v*100)/100;
  return {y:t.anio,f:t.fase,n:t.nivel,mx:t.max,asof:t.asof,
    l:t.lluvia?{c:t.lluvia.ciclo,m:t.lluvia.mes,p:r1(t.lluvia.p),u:t.lluvia.um,n:t.lluvia.nivel}:null,
    s:t.spei?{m1:t.spei.m1,m2:t.spei.m2,z1:r2(t.spei.z1),z2:r2(t.spei.z2),n:t.spei.nivel}:null};}
