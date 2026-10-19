import test from 'node:test';
import assert from 'node:assert/strict';
import {areaWGS84,intersectCandidates} from '../src/parcel-intersection.mjs';

// Synthetic polygons in Mendoza's coordinate range, not real cadastral data.
const rectangle=(west,south,east,north)=>[[west,south],[east,south],[east,north],[west,north],[west,south]];
const shape=ring=>({type:'Polygon',coordinates:[ring]});
const parcel=(nc,ring,layer='fixture')=>({type:'Feature',properties:{nc,source_layer:layer,PADRON:'001',DEPARTAMEN:'Prueba',CUIT_TITUL:'PRIVATE'},geometry:shape(ring)});
const corridor=(id,ring)=>({type:'Feature',properties:{route_id:id},geometry:shape(ring)});
const collection=features=>({type:'FeatureCollection',features,metadata:{query_complete:true,source_date:'unknown'}});
const wide=rectangle(-68.1,-35.1,-67.9,-34.9),a=rectangle(-68,-35,-67.99,-34.99);

test('intersección: disuelve componentes NC, conserva identificador y omite atributos privados',()=>{
  const result=intersectCandidates(collection([parcel('0001',a,'capa1'),parcel('0001',a,'capa2')]),collection([corridor('T1',wide)]));
  assert.equal(result.features.length,1);const p=result.features[0].properties;
  assert.equal(p.nc,'0001');assert.equal(p.affected_pct,100);assert.ok(p.parcel_m2>900000&&p.parcel_m2<1100000);
  assert.deepEqual(p.source_layers,['capa1','capa2']);assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  assert.equal(p.owner,'');assert.equal(result.metadata.analysis_complete,true);
});

test('intersección: agujeros se restan y orientación de anillos no cambia superficie',()=>{
  const outer=rectangle(-68,-35,-67.98,-34.98),hole=rectangle(-67.995,-34.995,-67.985,-34.985);
  const first=areaWGS84([[outer,hole]]),reversed=areaWGS84([[outer.toReversed(),hole.toReversed()]]);
  assert.ok(Math.abs(first-reversed)<.001);assert.ok(first<areaWGS84([[outer]]));
  const component=rectangle(-68.1,-35.1,-68.09,-35.09);
  assert.ok(Math.abs(areaWGS84([[outer,hole],[component]])-first-areaWGS84([[component]]))<.001);
});

test('intersección: porcentaje usa parcela completa y no cuenta contacto sin área',()=>{
  const half=rectangle(-68,-35,-67.995,-34.99);
  const result=intersectCandidates(collection([parcel('0001',a)]),collection([corridor('T1',half)]));
  assert.equal(result.features.length,1);assert.ok(Math.abs(result.features[0].properties.affected_pct-50)<.01);
  const touch=rectangle(-67.99,-35,-67.98,-34.99);
  assert.equal(intersectCandidates(collection([parcel('0001',a)]),collection([corridor('T1',touch)])).features.length,0);
});

test('intersección: cobertura de NC superpuestas se informa como unión y no doble suma',()=>{
  const result=intersectCandidates(collection([parcel('0001',a),parcel('0002',a)]),collection([corridor('T1',wide)]));
  const m=result.metadata.routes.T1;
  assert.equal(m.parcel_count,2);assert.ok(Math.abs(m.affected_sum_m2-2*m.covered_union_m2)<.01);
});

test('intersección: componentes de corredor repetidos no duplican (NC,ruta)',()=>{
  const result=intersectCandidates(collection([parcel('0001',a)]),collection([corridor('T1',wide),corridor('T1',wide)]));
  assert.equal(result.features.length,1);assert.equal(result.metadata.routes.T1.parcel_count,1);
  assert.ok(Math.abs(result.metadata.routes.T1.affected_sum_m2-result.metadata.routes.T1.covered_union_m2)<.01);
});

test('intersección: una ruta ausente permanece sin evaluar y con métricas null',()=>{
  const result=intersectCandidates(collection([parcel('0001',a)]),collection([corridor('T1',wide)]));
  assert.equal(result.metadata.routes.T2.evaluated,false);assert.equal(result.metadata.routes.T2.parcel_count,null);
  assert.equal(result.metadata.routes.T2.covered_union_m2,null);
});
