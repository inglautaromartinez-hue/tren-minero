import test from 'node:test';
import assert from 'node:assert/strict';
import {clipParcelSnapshot,clipSnapshot} from '../src/parcel-snapshot.mjs';
import {areaWGS84} from '../src/parcel-intersection.mjs';
const ring=(west,south,east,north)=>[[-68+west,-35+south],[-68+east,-35+south],[-68+east,-35+north],[-68+west,-35+north],[-68+west,-35+south]];
const square=(west,south,east,north)=>({type:'Polygon',coordinates:[ring(west,south,east,north)]});
const shape=(coords,properties={})=>({type:'Feature',properties:{nc:'0000123',route_id:'T1',parcel_m2:1000000,source_layers:['public:test'],...properties},geometry:coords});
const corridor=(geometry=square(0,0,.001,.001))=>({type:'Feature',properties:{route_id:'T1'},geometry});
const snapshot=features=>({type:'FeatureCollection',features,metadata:{query_plan_complete:true,analysis_complete:true,support_buffer_m:125,support_geometry:square(-.01,-.01,.01,.01),routes:{T1:{evaluated:true}}}});
const area=geometry=>areaWGS84(geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates);

test('recorte conserva superficie ORIGINAL y no divide por la superficie del snapshot',()=>{
  const source=snapshot([shape(square(0,0,.002,.002),{owner:'sensitive-owner',CUIT_TITUL:'sensitive-tax-id'})]);
  const before=JSON.stringify(source),result=clipParcelSnapshot(source,corridor(),{revision:7});
  assert.equal(result.features.length,1);
  const p=result.features[0].properties;
  assert.equal(p.nc,'0000123');
  assert.equal(p.parcel_m2,1000000);
  assert.ok(p.affected_pct<2&&p.affected_pct>0.5);
  assert.ok(Math.abs(p.affected_pct-p.affected_m2/1000000*100)<1e-10);
  assert.ok(Math.abs(p.affected_m2-area(corridor().geometry))<0.001);
  assert.equal(result.metadata.selected_revision,7);
  assert.equal(result.metadata.analysis_complete,true);
  assert.equal(result.metadata.routes.T1.analysis_complete,true);
  assert.equal(result.metadata.custom_buffer_coverage_status,'within_snapshot_support');
  assert.equal(result.metadata.official_coverage_confirmed,false);
  assert.equal(JSON.stringify(source),before);
  assert.ok(!JSON.stringify(result).includes('sensitive-'));
});

test('NC repetida se une antes del recorte y las otras rutas no se mezclan',()=>{
  const g=square(0,0,.001,.001);
  const result=clipSnapshot(snapshot([shape(g),shape(g),shape(g,{nc:'other-route',route_id:'T2'})]),corridor());
  assert.equal(result.features.length,1);
  assert.equal(result.metadata.routes.T1.parcel_count,1);
  assert.ok(Math.abs(result.metadata.routes.T1.covered_union_m2-area(g))<0.001);
  assert.equal(result.metadata.routes.T2.parcel_count,null);
  assert.equal(result.metadata.routes.T2.evaluated,false);
});

test('sumatorio por NC y cobertura espacial unida se distinguen entre sí',()=>{
  const g=square(0,0,.001,.001),result=clipSnapshot(snapshot([shape(g),shape(g,{nc:'second-nc'})]),corridor());
  assert.equal(result.features.length,2);
  assert.equal(result.metadata.routes.T1.parcel_count,2);
  assert.ok(Math.abs(result.metadata.routes.T1.affected_sum_m2-2*result.metadata.routes.T1.covered_union_m2)<0.001);
});

test('la disolución por lotes preserva cobertura con más de 32 NC y el prefiltro omite geometrías lejanas',()=>{
  const g=square(0,0,.001,.001),features=Array.from({length:70},(_,i)=>shape(g,{nc:`NC${i}`}));
  features.push(shape(square(.005,.005,.006,.006),{nc:'FAR'}));
  const result=clipSnapshot(snapshot(features),corridor());
  assert.equal(result.features.length,70);
  assert.ok(Math.abs(result.metadata.routes.T1.covered_union_m2-area(g))<.001);
  assert.equal(result.metadata.routes.T1.union_status,'complete');
  assert.ok(result.metadata.analysis_complete);
});

test('los agujeros del snapshot permanecen excluidos de área y geometría',()=>{
  const g={type:'Polygon',coordinates:[ring(0,0,.001,.001),ring(.00025,.00025,.00075,.00075)]};
  const result=clipSnapshot(snapshot([shape(g)]),corridor());
  assert.equal(result.features[0].geometry.coordinates[0].length,2);
  assert.ok(Math.abs(result.features[0].properties.affected_m2-area(g))<0.001);
  assert.ok(result.features[0].properties.affected_m2<area(corridor().geometry)*.8);
});

test('denominador ausente o incompatible mantiene porcentaje desconocido',()=>{
  for(const features of [[shape(square(0,0,.001,.001),{parcel_m2:null})],[shape(square(0,0,.001,.001)),shape(square(0,0,.001,.001),{parcel_m2:500000})]]){
    const result=clipSnapshot(snapshot(features),corridor());
    assert.equal(result.features[0].properties.parcel_m2,null);
    assert.equal(result.features[0].properties.affected_pct,null);
    assert.ok(result.features[0].properties.affected_m2>0);
    assert.equal(result.metadata.analysis_complete,false);
    assert.ok(result.metadata.warnings.length>0);
  }
});

test('sin soporte comprobable o fuera de él no se afirma cobertura del recorte',()=>{
  const source=snapshot([shape(square(0,0,.002,.002))]);
  delete source.metadata.support_geometry;
  let result=clipSnapshot(source,corridor());
  assert.equal(result.metadata.analysis_complete,false);
  assert.equal(result.metadata.custom_buffer_coverage_status,'unknown');
  source.metadata.support_geometry=square(0,0,.0005,.001);
  result=clipSnapshot(source,corridor());
  assert.equal(result.metadata.custom_buffer_coverage_status,'outside_snapshot_support');
  assert.ok(result.metadata.support_uncovered_m2>1000);
  assert.equal(result.metadata.analysis_complete,false);
});

test('soporte por ruta tiene prioridad y un plan de consulta incompleto permanece explícito',()=>{
  const source=snapshot([shape(square(0,0,.002,.002))]);
  source.metadata.routes.T1.support_geometry=square(0,0,.0001,.001);
  source.metadata.query_plan_complete=false;
  const result=clipSnapshot(source,corridor());
  assert.equal(result.metadata.source_query_plan_complete,false);
  assert.equal(result.metadata.analysis_complete,false);
  assert.equal(result.metadata.custom_buffer_coverage_status,'outside_snapshot_support');
  assert.equal(result.metadata.routes.T1.coverage_status,'unknown');
});

test('cero local no convierte la cobertura oficial desconocida en completa',()=>{
  const source=snapshot([]),result=clipSnapshot(source,corridor());
  assert.equal(result.features.length,0);
  assert.equal(result.metadata.routes.T1.parcel_count,0);
  assert.equal(result.metadata.routes.T1.coverage_status,'unknown');
  assert.equal(result.metadata.official_coverage_confirmed,false);
  assert.equal(result.metadata.analysis_complete,true);
  delete source.metadata.routes.T1;
  source.metadata.query_plan_complete=false;
  const unavailable=clipSnapshot(source,corridor());
  assert.equal(unavailable.metadata.routes.T1.parcel_count,null);
  assert.equal(unavailable.metadata.source_snapshot_evaluated,false);
});

test('entradas inválidas y componente inválido se registran sin un cero pretendidamente completo',()=>{
  assert.throws(()=>clipSnapshot(null,corridor()),TypeError);
  assert.throws(()=>clipSnapshot(snapshot([]),{...corridor(),properties:{route_id:'T2'}},{routeId:'T1'}),TypeError);
  assert.throws(()=>clipSnapshot(snapshot([shape(square(0,0,.001,.001),{nc:123})]),corridor()),TypeError);
  const invalid=shape({type:'Polygon',coordinates:[[[0,0],[1,0],[1,1],[0,1]]]});
  const result=clipSnapshot(snapshot([invalid]),corridor());
  assert.equal(result.metadata.analysis_complete,false);
  assert.ok(result.metadata.warnings.length>0);
});
