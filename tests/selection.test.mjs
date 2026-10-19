import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import geodesic from 'geographiclib-geodesic';
import {buildRouteChains,nearestOnLine,sliceLineBetween} from '../src/selection.mjs';
import {stations,transverse} from '../src/geo.mjs';
const geod=geodesic.Geodesic.WGS84;
const origin=[-68,-35];
const east=distance=>{const p=geod.Direct(origin[1],origin[0],90,distance);return[p.lon2,p.lat2];};
const distance=(a,b)=>geod.Inverse(a[1],a[0],b[1],b[0]).s12;
const feature=(id,coords,route_id='T3')=>({type:'Feature',properties:{route_id,segment_id:id,name:id},geometry:{type:'LineString',coordinates:coords}});

test('une fuentes ordenadas hasta 1 m conservando extremos sin mutar fuentes',()=>{
  const features=[feature('a',[east(0),east(100)]),feature('b',[east(100.5),east(200)]),feature('c',[east(200.7),east(300)])];
  const snapshot=JSON.stringify(features);
  const chains=buildRouteChains(features);
  assert.equal(chains.length,1);
  assert.equal(chains[0].properties.route_id,'T3');
  assert.deepEqual(chains[0].properties.source_segment_ids,['a','b','c']);
  assert.equal(chains[0].geometry.coordinates.length,6);
  assert.ok(Math.abs(chains[0].properties.length_m-300)<0.001);
  assert.equal(chains[0].properties.join_gaps_m.length,2);
  assert.match(chains[0].properties.title,/a.*b.*c/);
  assert.equal(JSON.stringify(features),snapshot);
});

test('huecos mayores a 1 m y propuestas diferentes generan cadenas sin puentes',()=>{
  const chains=buildRouteChains([feature('a',[east(0),east(100)]),feature('x',[east(0),east(50)],'T2'),feature('b',[east(101.1),east(200)])]);
  assert.equal(chains.length,3);
  const blue=chains.filter(f=>f.properties.route_id==='T3');
  assert.deepEqual(blue.map(f=>f.properties.source_segment_ids),[['a'],['b']]);
  assert.notEqual(blue[0].properties.chain_id,blue[1].properties.chain_id);
  assert.equal(blue[0].geometry.coordinates.length,2);
  assert.equal(blue[1].geometry.coordinates.length,2);
  assert.ok(blue.reduce((sum,f)=>sum+f.properties.length_m,0)<199);
});

test('el azul real constituye una cadena y roja/naranja conservan sus discontinuidades',()=>{
  const source=JSON.parse(readFileSync(new URL('../public/data/routes.geojson',import.meta.url)));
  const chains=buildRouteChains(source);
  assert.equal(chains.filter(f=>f.properties.route_id==='T3').length,1);
  assert.equal(chains.filter(f=>f.properties.route_id==='T1').length,4);
  assert.equal(chains.filter(f=>f.properties.route_id==='T2').length,2);
  const blue=chains.find(f=>f.properties.route_id==='T3');
  assert.equal(blue.properties.source_segment_ids.length,5);
  assert.ok(blue.properties.length_m>489417 && blue.properties.length_m<489421);
});

test('nearest devuelve pie interior, progresiva WGS84 e índice original',()=>{
  const line=[east(0),east(400),east(1000)];
  const foot=east(650),off=geod.Direct(foot[1],foot[0],0,100);
  const hit=nearestOnLine(line,[off.lon2,off.lat2]);
  assert.equal(hit.segment_index,1);
  assert.ok(Math.abs(hit.chainage_m-650)<0.03);
  assert.equal(hit.distance_m,hit.chainage_m);
  assert.ok(Math.abs(hit.offset_m-100)<0.001);
  assert.ok(distance(hit.coord,foot)<0.03);
  const cut=sliceLineBetween(line,hit.distance_m,900);
  assert.ok(distance(cut[0],hit.coord)<0.001);
});

test('nearest conserva extremos y funciona sobre una arista larga sin densificar la fuente',()=>{
  const line=[east(0),east(45000)];
  assert.ok(nearestOnLine(line,east(-20)).chainage_m<0.001);
  assert.ok(Math.abs(nearestOnLine(line,east(45020)).chainage_m-45000)<0.001);
  const hit=nearestOnLine(line,east(22345));
  assert.ok(Math.abs(hit.chainage_m-22345)<0.001);
  assert.equal(line.length,2);
});

test('slice permite orden invertido y conserva vértices interiores',()=>{
  const line=[east(0),east(400),east(1000)];
  const forward=sliceLineBetween(line,250,850);
  const reversed=sliceLineBetween(line,850,250);
  assert.equal(forward.length,3);
  assert.deepEqual(reversed,[...forward].reverse());
  assert.ok(distance(forward[0],east(250))<0.001);
  assert.deepEqual(forward[1],line[1]);
  assert.ok(distance(forward[2],east(850))<0.001);
});

test('slice clampa límites, devuelve exactamente extremos y quita duplicados adyacentes',()=>{
  const line=[east(0),east(0),east(400),east(400),east(1000)];
  const total=1000;
  const selected=sliceLineBetween(line,0,total+100);
  assert.deepEqual(selected,[line[0],line[2],line[4]]);
  assert.deepEqual(sliceLineBetween(line,-200,total+200),selected);
  const equal=sliceLineBetween(line,400,400);
  assert.equal(equal.length,1);
  assert.ok(distance(equal[0],east(400))<0.001);
});

test('líneas vacías o degeneradas no generan NaN, puentes ni rangos inventados',()=>{
  assert.equal(nearestOnLine([],origin),null);
  assert.deepEqual(sliceLineBetween([],0,100),[]);
  assert.deepEqual(sliceLineBetween([origin,origin],0,100),[origin]);
  const nearest=nearestOnLine([origin,origin],east(25));
  assert.equal(nearest.chainage_m,0);
  assert.ok(Math.abs(nearest.offset_m-25)<0.001);
  assert.deepEqual(buildRouteChains([feature('empty',[origin,origin])]),[]);
  assert.throws(()=>sliceLineBetween([origin],NaN,100),TypeError);
  assert.throws(()=>buildRouteChains([],{maxGapM:-1}),RangeError);
});

test('selección rechaza longitudes y latitudes fuera del dominio WGS84',()=>{
  for(const point of [[181,-35],[-181,-35],[-68,91],[-68,-91]]) {
    assert.throws(()=>nearestOnLine([origin,east(100)],point),TypeError);
    assert.throws(()=>nearestOnLine([origin,point],origin),TypeError);
    assert.throws(()=>sliceLineBetween([origin,point],0,20),TypeError);
    assert.throws(()=>buildRouteChains([feature('invalid',[origin,point])]),TypeError);
  }
});

test('progresivas, recortes y transversales comparten el mismo eje geodésico',()=>{
  const source=JSON.parse(readFileSync(new URL('../public/data/routes.geojson',import.meta.url))).features;
  const original=source.find(f=>f.properties.segment_id==='T2-01').geometry.coordinates;
  let longest=0,index=1;
  for(let i=1;i<original.length;i++)if(distance(original[i-1],original[i])>longest){longest=distance(original[i-1],original[i]);index=i;}
  const coords=original.slice(index-1,index+1);
  const line=sliceLineBetween(coords,1000,longest-1000);
  const total=stations(line,1000).at(-1).distance;
  assert.ok(Math.abs(total-(longest-2000))<0.001);
  for(const at of [0,total/2,total]){
    const section=transverse(line,at,100,25),center=section.find(p=>p.distance===0).xy;
    const snapped=nearestOnLine(line,center);
    assert.ok(Math.abs(snapped.chainage_m-at)<0.001);
    assert.ok(snapped.offset_m<0.001);
    assert.ok(Math.abs(distance(section[0].xy,section.at(-1).xy)-200)<0.001);
    const pointRange=sliceLineBetween(line,at,at);
    assert.ok(distance(pointRange[0],center)<0.001);
  }
});
