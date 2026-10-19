import test from 'node:test';
import assert from 'node:assert/strict';
import geodesic from 'geographiclib-geodesic';
import {buildStudyBuffer,intersectStudyCandidates} from '../src/study-buffer.mjs';
import {areaWGS84} from '../src/parcel-intersection.mjs';
const geod=geodesic.Geodesic.WGS84;
const origin=[-68,-35];
const point=(at,azi,d)=>{const p=geod.Direct(at[1],at[0],azi,d);return[p.lon2,p.lat2];};
const east=d=>point(origin,90,d);
const line=coords=>({type:'Feature',properties:{route_id:'T3'},geometry:{type:'LineString',coordinates:coords}});
const ringContains=(ring,point)=>{let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;};
const contains=(buffer,point)=>buffer.geometry.coordinates.some(p=>ringContains(p[0],point)&&!p.slice(1).some(r=>ringContains(r,point)));
const collection=features=>({type:'FeatureCollection',metadata:{source_date:'unknown'},features});
const parcel=(nc,coords,extra={})=>({type:'Feature',properties:{nc,source_layer:'public:test',...extra},geometry:{type:'Polygon',coordinates:[coords]}});

test('buffer WGS84 de 1 km tiene ancho 200 m, extremos redondos y área esperada',()=>{
  const feature=line([east(0),east(1000)]),snapshot=JSON.stringify(feature);
  const buffer=buildStudyBuffer(feature);
  assert.equal(buffer.geometry.type,'MultiPolygon');
  assert.equal(buffer.properties.route_id,'T3');
  assert.equal(buffer.properties.buffer_m,100);
  assert.equal(buffer.properties.geodesic_nominal,true);
  assert.equal(buffer.properties.strip_count,2);
  assert.equal(buffer.properties.cap_sides,64);
  assert.ok(Math.abs(buffer.properties.length_m-1000)<0.001);
  const expected=200*1000+Math.PI*100**2;
  assert.ok(Math.abs(buffer.properties.area_ha*10000-expected)<75);
  assert.ok(Math.abs(areaWGS84(buffer.geometry.coordinates)/10000-buffer.properties.area_ha)<1e-9);
  const mid=east(500),azi=geod.Inverse(origin[1],origin[0],mid[1],mid[0]).azi2;
  for(const side of [-90,90]){
    assert.ok(contains(buffer,point(mid,azi+side,99.5)));
    assert.ok(!contains(buffer,point(mid,azi+side,100.5)));
  }
  assert.ok(contains(buffer,east(-99.5)));
  assert.ok(!contains(buffer,east(-100.5)));
  assert.ok(contains(buffer,east(1099.5)));
  assert.ok(!contains(buffer,east(1100.5)));
  assert.equal(JSON.stringify(feature),snapshot);
});

test('cada arista larga se densifica a 500 m sin agregar círculos por subdivisión',()=>{
  const buffer=buildStudyBuffer(line([east(0),east(4500)]));
  assert.ok(buffer.properties.strip_count>=9&&buffer.properties.strip_count<=10);
  assert.ok(buffer.properties.length_m/buffer.properties.strip_count<=500);
  assert.equal(buffer.properties.source_vertex_count,2);
  assert.ok(contains(buffer,point(east(2250),0,99.5)));
  assert.ok(!contains(buffer,point(east(2250),0,101)));
});

test('giros y recorridos sobre sí mismos se disuelven sin sumar superposición dos veces',()=>{
  const straight=buildStudyBuffer(line([east(0),east(1000)]));
  const repeated=buildStudyBuffer(line([east(0),east(1000),east(0)]));
  assert.ok(Math.abs(straight.properties.area_ha-repeated.properties.area_ha)<0.0001);
  const bend=buildStudyBuffer(line([origin,east(500),point(east(500),0,500)]));
  assert.ok(Number.isFinite(bend.properties.area_ha));
  assert.ok(bend.properties.area_ha>18&&bend.properties.area_ha<24);
  assert.ok(contains(bend,east(500)));
});

test('rechaza geometrías inválidas, línea degenerada, radio inválido y selección excesiva',()=>{
  assert.throws(()=>buildStudyBuffer(null),/LineString/);
  assert.throws(()=>buildStudyBuffer(line([origin,origin])),/longitud cero/);
  assert.throws(()=>buildStudyBuffer(line([origin,[NaN,-35]])),/finitas/);
  assert.throws(()=>buildStudyBuffer(line([[179,-35],[-179,-35]])),/antimeridiano/);
  assert.throws(()=>buildStudyBuffer(line([origin,east(1000)]),0),/radio/);
  assert.throws(()=>buildStudyBuffer(line([origin,east(1000001)])),/1000 km/);
  assert.throws(()=>buildStudyBuffer(line(Array(6001).fill(origin))),/vértices/);
  assert.throws(()=>buildStudyBuffer({...line([origin,east(20)]),properties:{route_id:'X'}}),/T1/);
});

test('duplica adyacente no genera NaN ni cambio de área',()=>{
  const a=buildStudyBuffer(line([origin,east(1000)]));
  const b=buildStudyBuffer(line([origin,origin,east(1000),east(1000)]));
  assert.equal(b.properties.source_vertex_count,2);
  assert.ok(Math.abs(a.properties.area_ha-b.properties.area_ha)<1e-9);
});

test('cruce seleccionado incluye sólo outlines completos disueltos de NC afectadas y sin datos extra',()=>{
  const buffer=buildStudyBuffer(line([origin,east(1000)]));
  const a=[[-68.0005,-35.002],[-67.995,-35.002],[-67.995,-34.998],[-68.0005,-34.998],[-68.0005,-35.002]];
  const far=[[-69,-36],[-68.99,-36],[-68.99,-35.99],[-69,-35.99],[-69,-36]];
  const candidates=collection([parcel('0001',a,{CUIT_TITUL:'sensitive-test-value'}),parcel('0001',a),parcel('0002',far)]);
  const result=intersectStudyCandidates(candidates,buffer,27);
  assert.equal(result.features.length,1);
  assert.equal(result.features[0].properties.nc,'0001');
  assert.equal(result.metadata.study_scope,'selected_study_buffer');
  assert.equal(result.metadata.selected_revision,27);
  assert.equal(result.metadata.buffer_m,100);
  assert.equal(result.metadata.routes.T1.evaluated,false);
  assert.equal(result.metadata.routes.T3.parcel_count,1);
  assert.equal(result.parcel_outlines.features.length,1);
  const outline=result.parcel_outlines.features[0];
  assert.equal(outline.properties.nc,'0001');
  assert.deepEqual(Object.keys(outline.properties).sort(),['nc','source_layers']);
  assert.ok(areaWGS84(outline.geometry.coordinates)>result.features[0].properties.affected_m2);
  assert.ok(!JSON.stringify(result).includes('sensitive-test-value'));
});

test('cero candidatas mantiene cero local, sin elevar cobertura a confirmada',()=>{
  const result=intersectStudyCandidates(collection([]),buildStudyBuffer(line([origin,east(1000)])),4);
  assert.equal(result.features.length,0);
  assert.equal(result.parcel_outlines.features.length,0);
  assert.equal(result.metadata.routes.T3.coverage_status,'unknown');
  assert.equal(result.metadata.routes.T3.parcel_count,0);
});

test('worker conserva revision y tipo en buffer, cruces y errores sin mezclar estudio previo',async()=>{
  const previous=globalThis.self,messages=[];
  globalThis.self={postMessage:message=>messages.push(message)};
  try{
    await import('../src/study-worker.js');
    self.onmessage({data:{type:'buffer',revision:10,feature:line([origin,east(1000)])}});
    const built=messages.find(message=>message.type==='buffer');
    assert.equal(built.revision,10);
    assert.equal(built.buffer.properties.buffer_m,100);
    self.onmessage({data:{type:'parcel',revision:11,candidates:collection([]),buffer:built.buffer}});
    const parcelResult=messages.find(message=>message.type==='parcel');
    assert.equal(parcelResult.revision,11);
    assert.equal(parcelResult.result.metadata.selected_revision,11);
    assert.equal(parcelResult.result.parcel_outlines.features.length,0);
    self.onmessage({data:{type:'buffer',revision:12,feature:line([origin,origin])}});
    assert.equal(messages.at(-1).type,'error');
    assert.equal(messages.at(-1).revision,12);
    assert.match(messages.at(-1).message,/longitud cero/);
  }finally{
    if(previous===undefined)delete globalThis.self;else globalThis.self=previous;
  }
});
