import test from 'node:test';
import assert from 'node:assert/strict';
import geodesic from 'geographiclib-geodesic';
import {prepareOverviewPoints} from '../scripts/prepare_overviews.mjs';
const geod=geodesic.Geodesic.WGS84;
const origin=[-68,-35];
const at=distance=>{const p=geod.Direct(origin[1],origin[0],90,distance);return[p.lon2,p.lat2];};
const feature=(name,a,b,route_id='T1')=>({type:'Feature',properties:{segment_id:name,route_id},geometry:{type:'LineString',coordinates:[at(a),at(b)]}});

test('perfil general acumula longitud de partes sin fabricar muestras en el hueco',()=>{
  const routes={type:'FeatureCollection',features:[feature('a',0,900),feature('b',3000,4100)]};
  const overview=prepareOverviewPoints(routes).T1;
  assert.equal(overview.parts,2);
  assert.ok(Math.abs(overview.length_m-2000)<0.001);
  const breaks=overview.profile.filter(point=>point.break_before);
  assert.equal(breaks.length,1);
  assert.ok(Math.abs(breaks[0].distance-900)<0.001);
  const boundary=overview.profile.findIndex(point=>point.break_before);
  assert.notEqual(overview.profile[boundary-1].part_id,overview.profile[boundary].part_id);
  assert.ok(Math.abs(overview.profile[boundary-1].distance-overview.profile[boundary].distance)<0.001);
  assert.ok(geod.Inverse(...[overview.profile[boundary-1].xy[1],overview.profile[boundary-1].xy[0],breaks[0].xy[1],breaks[0].xy[0]]).s12>2000);
  assert.ok(overview.profile.every(point=>point.z===null));
});

test('transversal 50% cae en la parte real y conserva izquierda/derecha ±100 m',()=>{
  const overview=prepareOverviewPoints({features:[feature('a',0,900),feature('b',3000,4100)]}).T1;
  assert.equal(overview.cross.length,9);
  assert.equal(overview.cross[0].distance,-100);
  assert.equal(overview.cross.at(-1).distance,100);
  assert.ok(overview.cross.every(point=>point.part_id==='T1:chain:2'));
  const center=overview.cross.find(point=>point.distance===0).xy;
  const expected=at(3100);
  assert.ok(geod.Inverse(center[1],center[0],expected[1],expected[0]).s12<0.001);
  assert.equal(overview.cross_chainage_m,1000);
});

test('la mitad exactamente en un límite usa la parte posterior como la interfaz',()=>{
  const overview=prepareOverviewPoints({features:[feature('a',0,900),feature('b',0,900)]}).T1;
  assert.equal(overview.parts,2);
  assert.equal(overview.cross_part_id,'T1:chain:2');
  const center=overview.cross.find(point=>point.distance===0).xy;
  assert.ok(geod.Inverse(center[1],center[0],origin[1],origin[0]).s12<0.001);
});
