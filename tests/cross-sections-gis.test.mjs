import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import geodesic from 'geographiclib-geodesic';
import {buildRouteChains} from '../src/selection.mjs';
import {studyParts,createRouteStudy} from '../src/route-study.mjs';
import {buildCrossSections,crossSectionPoints,nearestCrossSection} from '../src/cross-sections.mjs';
const geod=geodesic.Geodesic.WGS84;
const inv=(a,b)=>geod.Inverse(a[1],a[0],b[1],b[0]);
const angle=(a,b)=>Math.abs(((a-b+540)%360)-180);
function fromSource(coords,at){
  let sum=0;
  for(let i=1;i<coords.length;i++){
    const edge=inv(coords[i-1],coords[i]);
    if(edge.s12<=0)continue;
    if(sum+edge.s12>=at-.001){const point=geod.Direct(coords[i-1][1],coords[i-1][0],edge.azi1,Math.max(0,Math.min(edge.s12,at-sum)));return{xy:[point.lon2,point.lat2],azi:point.azi2};}
    sum+=edge.s12;
  }
  throw Error('La estación excede los vértices originales.');
}
const source=JSON.parse(readFileSync(new URL('../public/data/routes.geojson',import.meta.url)));
const chains=buildRouteChains(source);

test('GIS independiente: centros y nueve posiciones de cada cadena real coinciden con vértices fuente WGS84',()=>{
  let checked=0;
  for(const route of ['T1','T2','T3']){
    const parts=studyParts(createRouteStudy(chains,route)),entries=buildCrossSections(chains,route);
    for(const part of parts){
      const local=entries.filter(s=>s.part_id===part.properties.part_id);
      for(const section of [local[0],local[Math.floor(local.length/2)],local.at(-1)]){
        const reference=fromSource(part.geometry.coordinates,section.chainage_m);
        assert.ok(inv(reference.xy,section.xy).s12<.001);
        const sectionWithValues={...section,z:[10,11,null,13,14,15,16,17,18]};
        const points=crossSectionPoints(sectionWithValues,chains);
        assert.equal(points.length,9);
        assert.deepEqual(points.map(p=>p.z),sectionWithValues.z);
        assert.ok(inv(points[4].xy,reference.xy).s12<.001);
        for(let i=0;i<points.length;i++){
          const offset=-100+i*25,observed=inv(reference.xy,points[i].xy);
          assert.ok(Math.abs(observed.s12-Math.abs(offset))<.001);
          if(offset!==0)assert.ok(Math.abs(angle(observed.azi1,reference.azi)-90)<.00001);
        }
        checked++;
      }
    }
  }
  assert.equal(checked,21);
});

test('GIS independiente: 100 m locales reinician y las fronteras no reciben estaciones dentro de huecos',()=>{
  let total=0;
  for(const route of ['T1','T2','T3']){
    const entries=buildCrossSections(chains,route),parts=studyParts(createRouteStudy(chains,route));
    total+=entries.length;
    for(const part of parts){
      const local=entries.filter(s=>s.part_id===part.properties.part_id);
      assert.equal(local[0].chainage_m,0);
      assert.ok(Math.abs(local.at(-1).chainage_m-part.properties.length_m)<.001);
      for(const section of local.slice(1,-1))assert.ok(Math.abs(section.chainage_m/100-Math.round(section.chainage_m/100))<1e-8);
      assert.ok(Math.abs(local[0].route_distance_m-part.properties.from_m)<.001);
      const chosen=nearestCrossSection(entries,local[0].xy,{partId:part.properties.part_id});
      assert.equal(chosen.id,local[0].id);
    }
    const again=buildCrossSections(chains,route);
    assert.deepEqual(entries.map(s=>s.id),again.map(s=>s.id));
    assert.equal(new Set(entries.map(s=>s.id)).size,entries.length);
    assert.equal(nearestCrossSection(entries,entries[0].xy,{partId:'not_a_source_chain'}),null);
  }
  assert.equal(total,14744);
});

test('GIS independiente: catálogo publicado terminado concuerda con centros fuente y sus conteos',()=>{
  const index=JSON.parse(readFileSync(new URL('../public/data/indexcross-sections.json',import.meta.url)));
  assert.equal(index.complete,true);
  let sections=0,samples=0;
  for(const route of ['T1','T2','T3']){
    const data=JSON.parse(readFileSync(new URL(`../public/data/cross-sections-${route}.json`,import.meta.url)));
    const parts=studyParts(createRouteStudy(chains,route));
    assert.equal(data.sections.length,index.routes[route].count);
    for(const part of parts){
      const rows=data.sections.filter(s=>s.part_id===part.properties.part_id);
      for(const section of [rows[0],rows[Math.floor(rows.length/2)],rows.at(-1)]){
        const reference=fromSource(part.geometry.coordinates,section.chainage_m);
        assert.ok(inv(reference.xy,section.xy).s12<.002); // millimetre-format rounding
      }
    }
    assert.ok(data.sections.every(s=>s.z.length===9&&s.z.every(Number.isFinite)));
    sections+=data.sections.length;samples+=data.sections.reduce((sum,s)=>sum+s.z.length,0);
    assert.equal(index.routes[route].pending_sections,0);
    assert.equal(index.routes[route].missing_samples,0);
  }
  assert.equal(sections,14744);assert.equal(samples,132696);
});
