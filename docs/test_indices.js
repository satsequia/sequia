const I = require('../ingest/indices.js');
function synthPrecip(y,m){const base=[8,10,18,55,140,190,150,165,210,120,45,15][m-1];
  const seed=Math.sin(y*13+m*7)*10000; const u=seed-Math.floor(seed);
  return Math.round(base*(0.35+1.6*u*u)*100)/100;}
function synthTemp(y,m){const tx=[30,31,33,34,32,30,30,31,30,29,29,29][m-1];
  const tn=[15,15,17,18,19,19,18,18,18,18,16,15][m-1]; const w=(y-1991)*0.03; return [tx+w,tn+w];}
const LAT=14.05;
function accumD(y,m,s){let t=0;for(let k=0;k<s;k++){let mm=m-k,yy=y;while(mm<1){mm+=12;yy--;}
  const P=synthPrecip(yy,mm);const [tx,tn]=synthTemp(yy,mm);
  t+=P-I.petHargreavesMonth(tx,tn,LAT,yy,mm);}return t;}
function accumP(y,m,s){let t=0;for(let k=0;k<s;k++){let mm=m-k,yy=y;while(mm<1){mm+=12;yy--;}
  t+=synthPrecip(yy,mm);}return t;}
const years=[];for(let y=1991;y<=2020;y++)years.push(y);
const refD=years.map(y=>accumD(y,7,3));
const targetD=accumD(2020,7,3);
const refP=years.map(y=>accumP(y,7,3));
const targetP=accumP(2020,7,3);
// CDD synth año 2020 (igual que python)
let daily=[];
for(let m=1;m<=12;m++){const nd=I.daysInMonth(2020,m);const mtot=synthPrecip(2020,m);
  const wet=Math.max(1,Math.floor(mtot/12));
  for(let d=0;d<nd;d++){daily.push(d%Math.max(1,Math.floor(nd/wet))===0?mtot/wet:0.0);}}
const out={
  target_D:Math.round(targetD*1e4)/1e4,
  SPEI_3:Math.round(I.spei(refD,targetD)*1e6)/1e6,
  SPI_3_gamma:Math.round(I.spiGamma(refP,targetP)*1e6)/1e6,
  SPI_3_wilson_hilferty:Math.round(I.spiWilsonHilferty(refP,targetP)*1e6)/1e6,
  CDD_2020:I.cdd(daily),
  PET_jul2020:Math.round(I.petHargreavesMonth(...synthTemp(2020,7),LAT,2020,7)*1e4)/1e4,
  Ra_mid_jul:Math.round(I.raExtraterrestrial(LAT,196)*1e4)/1e4
};
console.log(JSON.stringify(out,null,2));
