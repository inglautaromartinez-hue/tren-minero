import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import geodesic from 'geographiclib-geodesic';
import {buildRouteChains} from '../src/selection.mjs';
import {distance} from '../src/geo.mjs';
import {createRouteStudy,studyParts,studyStations,sectionAt,snapStudy} from '../src/route-study.mjs';
import {buildStudyBuffer} from '../src/study-buffer.mjs';
const geod=geodesic.Geodesic.WGS84,origin=[-68,-35];
function east(m){const p=geod.Direct(origin[1],origin[0],90,m);return[p.lon2,p.lat2];}
const chain=(id,from,to)=>({type:'Feature',properties:{route_id:'T1',chain_id:id,source_segment_ids:[id]},geometry:{type:'LineString',coordinates:[east(from),east(to)]}});
const fixture=()=>createRouteStudy([chain('first',0,1000),chain('second',5000,5500)],'T1');

test('alternativa entera usa multipart y excluye el hueco de longitud y geometría',()=>{
  const chains=[chain('first',0,1000),chain('second',5000,5500)],snapshot=JSON.stringify(chains);
  const feature=createRouteStudy(chains,'T1');
  assert.equal(feature.geometry.type,'MultiLineString');
  assert.equal(feature.geometry.coordinates.length,2);
  assert.deepEqual(feature.properties.part_chain_ids,['first','second']);
  assert.equal(feature.properties.whole_route,true);
  assert.equal(feature.properties.segment_id,'route:T1');
  assert.ok(Math.abs(feature.properties.length_m-1500)<0.001);
  assert.ok(Math.abs(feature.properties.length_km-1.5)<0.000001);
  assert.equal(JSON.stringify(chains),snapshot);
  const parts=studyParts(feature);
  assert.equal(parts[0].properties.from_m,0);
  assert.ok(Math.abs(parts[1].properties.from_m-1000)<0.001);
  assert.equal(parts[1].properties.chain_id,'second');
});

test('estacionado acumula sin puentes y declara corte con progresiva repetida en frontera',()=>{
  const feature=fixture(),points=studyStations(feature,400),parts=studyParts(feature);
  assert.deepEqual(points.map(p=>p.part_id),['first','first','first','first','second','second','second']);
  const boundary=points.findIndex(p=>p.break_before);
  assert.equal(points[boundary].part_id,'second');
  assert.ok(Math.abs(points[boundary].distance-points[boundary-1].distance)<0.001);
  assert.ok(distance(points[boundary-1].xy,points[boundary].xy)>3999);
  assert.ok(Math.abs(points.at(-1).distance-1500)<0.001);
  assert.deepEqual(points[boundary].xy,parts[1].geometry.coordinates[0]);
});

test('snap devuelve progresiva global y parte correcta sin seleccionar el hueco',()=>{
  const feature=fixture(),hit=snapStudy(feature,east(5200));
  assert.equal(hit.part_id,'second');
  assert.ok(Math.abs(hit.local_chainage_m-200)<0.001);
  assert.ok(Math.abs(hit.chainage_m-1200)<0.001);
  const gap=snapStudy(feature,east(3000));
  assert.ok(gap.offset_m>1999);
  assert.ok(Math.abs(gap.chainage_m-1000)<0.001);
});

test('secciones usan progresiva local y permiten elegir el lado exacto de la frontera',()=>{
  const feature=fixture(),parts=studyParts(feature),boundary=parts[1].properties.from_m;
  const center=points=>points.find(p=>p.distance===0);
  const section=sectionAt(feature,boundary+200,100,25);
  assert.equal(center(section).part_id,'second');
  assert.ok(distance(center(section).xy,east(5200))<0.001);
  assert.ok(Math.abs(distance(section[0].xy,section.at(-1).xy)-200)<0.001);
  assert.ok(distance(center(sectionAt(feature,boundary)).xy,east(5000))<0.001);
  assert.ok(distance(center(sectionAt(feature,boundary,100,25,{partId:'first'})).xy,east(1000))<0.001);
  assert.ok(distance(center(sectionAt(feature,-10)).xy,east(0))<0.001);
  assert.ok(distance(center(sectionAt(feature,999999)).xy,east(5500))<0.001);
});

test('LineString personalizado conserva una sola parte y su estudio comienza en cero',()=>{
  const custom=chain('custom',200,700);custom.properties.from_m=200;
  const parts=studyParts(custom);
  assert.equal(parts.length,1);
  assert.equal(parts[0].properties.from_m,0);
  assert.ok(Math.abs(snapStudy(custom,east(400)).chainage_m-200)<0.001);
  assert.equal(studyStations(custom,250).filter(p=>p.break_before).length,0);
  assert.ok(distance(sectionAt(custom,100).find(p=>p.distance===0).xy,east(300))<0.001);
});

test('fuentes reales conservan 4/2/1 partes y no elevan huecos a distancia recorrida',()=>{
  const source=JSON.parse(readFileSync(new URL('../public/data/routes.geojson',import.meta.url)));
  const chains=buildRouteChains(source);
  for(const [id,count] of [['T1',4],['T2',2],['T3',1]]){
    const whole=createRouteStudy(chains,id);
    assert.equal(whole.geometry.coordinates.length,count);
    assert.ok(Math.abs(studyStations(whole,10000).at(-1).distance-whole.properties.length_m)<0.001);
    assert.equal(studyStations(whole,10000).filter(p=>p.break_before).length,count-1);
  }
  assert.equal(createRouteStudy(chains,'T3').geometry.type,'MultiLineString');
});

test('entradas inválidas, partes degeneradas y muestreo excesivo se rechazan',()=>{
  assert.throws(()=>createRouteStudy([],'T1'),RangeError);
  assert.throws(()=>createRouteStudy([chain('a',0,1),chain('a',3,4)],'T1'),TypeError);
  assert.throws(()=>studyParts({type:'Feature',geometry:{type:'Point',coordinates:origin}}),TypeError);
  assert.throws(()=>studyParts(chain('zero',0,0)),RangeError);
  assert.throws(()=>studyStations(fixture(),0),RangeError);
  assert.throws(()=>studyStations(fixture(),.00001),RangeError);
  assert.throws(()=>sectionAt(fixture(),NaN),TypeError);
  assert.throws(()=>sectionAt(fixture(),1200,100,25,{partId:'first'}),RangeError);
});

test('buffer multipart independiente no crea franja sobre un hueco de cuatro kilómetros',()=>{
  const feature=fixture(),buffer=buildStudyBuffer(feature);
  assert.equal(buffer.properties.part_count,2);
  assert.equal(buffer.geometry.coordinates.length,2);
  assert.ok(Math.abs(buffer.properties.length_m-1500)<0.001);
  const expected=200*1500+2*Math.PI*100**2;
  assert.ok(Math.abs(buffer.properties.area_ha*10000-expected)<150);
  const x=east(3000)[0];
  for(const polygon of buffer.geometry.coordinates){
    const values=polygon[0].map(p=>p[0]);
    assert.ok(Math.max(...values)<x||Math.min(...values)>x);
  }
});

test('buffers de partes superpuestas se disuelven sin duplicar área',()=>{
  const first=createRouteStudy([chain('a',0,1000)],'T1');
  const overlapping=createRouteStudy([chain('a',0,1000),chain('b',0,1000)],'T1');
  const single=buildStudyBuffer(first),doubled=buildStudyBuffer(overlapping);
  assert.equal(doubled.properties.part_count,2);
  assert.equal(doubled.geometry.coordinates.length,1);
  assert.ok(Math.abs(doubled.properties.area_ha-single.properties.area_ha)<1e-9);
  assert.ok(Math.abs(doubled.properties.length_m-2000)<0.001);
});
