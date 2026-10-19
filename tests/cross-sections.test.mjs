import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import geodesic from 'geographiclib-geodesic';
import {distance,transverse} from '../src/geo.mjs';
import {buildRouteChains} from '../src/selection.mjs';
import {buildCrossSections,nearestCrossSection,crossSectionPoints,summarizeCrossSections,CROSS_SECTION_OFFSETS} from '../src/cross-sections.mjs';
const geod=geodesic.Geodesic.WGS84,origin=[-68,-35];
const along=m=>{const p=geod.Direct(origin[1],origin[0],90,m);return[p.lon2,p.lat2];};
const chain=(id,from,to)=>({type:'Feature',properties:{route_id:'T1',chain_id:id},geometry:{type:'LineString',coordinates:[along(from),along(to)]}});
const fixture=()=>[chain('first',0,250),chain('second',5000,5150)];

test('secciones cada100 m reinician por cadena, incluyen extremos y no cubren huecos',()=>{
 const chains=fixture(),copy=JSON.stringify(chains),entries=buildCrossSections(chains,'T1');
 assert.equal(entries.length,7);
 assert.deepEqual(entries.map(e=>e.part_id),['first','first','first','first','second','second','second']);
 assert.deepEqual(entries.map(e=>Math.round(e.chainage_m)),[0,100,200,250,0,100,150]);
 assert.deepEqual(entries.map(e=>Math.round(e.route_distance_m)),[0,100,200,250,250,350,400]);
 assert.ok(distance(entries[3].xy,entries[4].xy)>4749);
 assert.equal(new Set(entries.map(e=>e.id)).size,7);
 assert.ok(entries.every(e=>e.z.length===9&&e.z.every(z=>z===null)&&e.status==='pending'));
 assert.equal(JSON.stringify(chains),copy);
 assert.deepEqual(entries.map(e=>e.id),buildCrossSections(chains,'T1').map(e=>e.id));
});

test('un extremo múltiplo de100 no genera ID ni estación duplicados por redondeo numérico',()=>{
 const entries=buildCrossSections([chain('exact',0,1000)],'T1');
 assert.equal(entries.length,11);
 assert.equal(new Set(entries.map(e=>e.id)).size,entries.length);
 assert.ok(Math.abs(entries.at(-1).chainage_m-1000)<.001);
 assert.ok(distance(entries.at(-1).xy,along(1000))<.001);
});

test('reconstrucción conserva ±100m, nueve cotas y tangente geodésica sin interpolar alturas',()=>{
 const chains=fixture(),entry=buildCrossSections(chains,'T1')[1];
 entry.z=[30,31,null,33,34,35,36,37,38];entry.status='partial';
 const points=crossSectionPoints(entry,chains),reference=transverse(chains[0].geometry.coordinates,entry.chainage_m,100,25);
 assert.deepEqual(points.map(p=>p.distance),CROSS_SECTION_OFFSETS);
 assert.deepEqual(points.map(p=>p.z),entry.z);
 assert.ok(points.every((p,i)=>distance(p.xy,reference[i].xy)<.00001));
 assert.ok(distance(points[4].xy,entry.xy)<.001);
 assert.ok(Math.abs(distance(points[0].xy,points[8].xy)-200)<.001);
 assert.ok(points[0].xy[1]>points[4].xy[1]);
 assert.ok(points[8].xy[1]<points[4].xy[1]);
});

test('selección más cercana permite preservar parte, no modifica entradas y rechaza datos inválidos',()=>{
 const entries=buildCrossSections(fixture(),'T1'),copy=JSON.stringify(entries);
 assert.equal(nearestCrossSection(entries,along(5120)).chainage_m,100);
 assert.equal(nearestCrossSection(entries,along(5120)).part_id,'second');
 assert.equal(nearestCrossSection(entries,along(5120),{partId:'first'}).part_id,'first');
 assert.equal(nearestCrossSection(entries,along(5120),{partId:'missing'}),null);
 assert.equal(nearestCrossSection([],origin),null);
 assert.equal(JSON.stringify(entries),copy);
 assert.throws(()=>nearestCrossSection(entries,[0,100]));
 assert.throws(()=>buildCrossSections(fixture(),'T1',0));
 assert.throws(()=>crossSectionPoints({...entries[0],part_id:'foreign'},fixture()));
 assert.throws(()=>crossSectionPoints({...entries[0],chainage_m:300},fixture()));
});

test('catálogo real cubre tres alternativas y conserva sus4/2/1 cadenas independientes',()=>{
 const source=JSON.parse(readFileSync(new URL('../public/data/routes.geojson',import.meta.url))),chains=buildRouteChains(source);
 const counts={T1:6572,T2:3276,T3:4896};
 for(const [id,parts] of [['T1',4],['T2',2],['T3',1]]){
  const entries=buildCrossSections(chains,id);
  assert.equal(entries.length,counts[id]);
  assert.equal(new Set(entries.map(e=>e.part_id)).size,parts);
  assert.equal(new Set(entries.map(e=>e.id)).size,entries.length);
 }
});

test('completitud de procesamiento no convierte NoData o fallo real en cotas inventadas',()=>{
 const entries=buildCrossSections(fixture(),'T1');
 for(const s of entries){s.status='unavailable';s.attempts=3;s.missing_reason='nodata_or_read_failure';}
 const summary=summarizeCrossSections(entries);
 assert.equal(summary.all_processed,true);
 assert.equal(summary.all_samples_valid,false);
 assert.equal(summary.status,'complete');
 assert.equal(summary.missing_samples,entries.length*9);
 assert.equal(summary.elevation_status,'unavailable');
 entries[0].status='pending';assert.equal(summarizeCrossSections(entries).all_processed,false);
});

test('datos publicados están procesados, preservan faltantes explícitos y omiten hashes internos',()=>{
 const file=new URL('../public/data/indexcross-sections.json',import.meta.url);
 if(!existsSync(file))return; // This check starts once generation has produced its index.
 const index=JSON.parse(readFileSync(file));
 assert.equal(index.complete,true,'No publicar catálogo pendiente o parcial.');
 assert.equal(index.spacing_m,100);
 assert.deepEqual(index.offsets,CROSS_SECTION_OFFSETS);
 for(const id of ['T1','T2','T3']){
  const data=JSON.parse(readFileSync(new URL(`../public/data/cross-sections-${id}.json`,import.meta.url)));
  assert.equal(data.route_id,id);assert.equal(data.status,'complete');
  assert.equal(data.sections.length,index.routes[id].count);
  assert.equal(data.spacing_m,100);assert.deepEqual(data.offsets,CROSS_SECTION_OFFSETS);
  assert.equal(index.routes[id].pending_sections,0);
  assert.ok(data.sections.every(s=>s.status!=='pending'&&s.z.length===9&&s.z.every(z=>z===null||Number.isFinite(z))));
  assert.ok(data.sections.filter(s=>s.z.some(z=>z===null)).every(s=>s.missing_reason&&s.attempts>=1&&s.attempts<=3));
  assert.equal(new Set(data.sections.map(s=>s.id)).size,data.sections.length);
  assert.ok(data.sections.every(s=>s.route_id===id&&s.xy.length===2&&Number.isFinite(s.chainage_m)&&Number.isFinite(s.route_distance_m)));
  assert.ok(!JSON.stringify(data).includes('sha256'));
 }
});
