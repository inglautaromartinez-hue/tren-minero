import test from 'node:test';
import assert from 'node:assert/strict';
import {queryWfs,bboxForCoordinates,WFS_ENDPOINT,ALLOWED_WFS_LAYERS} from '../src/wfs-client.mjs';

// Synthetic transport fixtures only: these tests make no live WFS requests.
const layer=ALLOWED_WFS_LAYERS.at(-1),bbox=[-68.02,-34.65,-68,-34.63];
const feature=id=>({type:'Feature',id:`parcel.${id}`,properties:{NOMENCLATU:`00${id}`,PADRON:'123',DEPARTAMEN:'SAN RAFAEL',NRO_PLANO:'1',CUIT_TITUL:'PRIVATE-DO-NOT-RETAIN',NOMBRE:'Nombre no solicitado'},geometry:{type:'MultiPolygon',coordinates:[[[[-68.01,-34.64],[-68.005,-34.64],[-68.005,-34.635],[-68.01,-34.64]]]]}});
const page=(features,totalFeatures,extra={})=>({type:'FeatureCollection',totalFeatures,features,...extra});
const reply=data=>new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});

test('WFS: pagina por total estable, conserva NC textual y sólo pide campos permitidos',async()=>{
  const requests=[],progress=[];
  const result=await queryWfs({layers:[layer],bbox,onProgress:p=>progress.push(p),fetchImpl:async(url,options)=>{
    const u=new URL(url);requests.push(u);assert.equal(options.credentials,'omit');
    return reply(requests.length===1?page(Array.from({length:500},(_,i)=>feature(i)),501):page([feature(500)],501));
  }});
  assert.equal(result.features.length,501);assert.equal(result.features[0].properties.NOMENCLATU,'000');
  assert.equal(requests[0].origin+requests[0].pathname,WFS_ENDPOINT);
  assert.deepEqual(requests.map(u=>u.searchParams.get('startIndex')),['0','500']);
  for(const request of requests){const q=request.searchParams;assert.equal(q.get('version'),'1.0.0');assert.equal(q.get('srsName'),'EPSG:4326');assert.equal(q.get('sortBy'),'fid_1');assert.equal(q.get('bbox'),bbox.join(',')+',EPSG:4326');assert.equal(q.get('propertyName'),'the_geom,NOMENCLATU,PADRON,DEPARTAMEN,NRO_PLANO');assert.equal(q.get('maxFeatures'),'500');}
  assert.equal(result.metadata.query_complete,true);assert.equal(result.metadata.truncated,false);
  assert.equal(result.metadata.source_date,'unknown');assert.equal(result.metadata.coverage_status,'unknown');
  assert.equal(progress.at(-1).received,501);assert.equal(progress.at(-1).allReceived,501);
  assert.equal(result.features[0].properties.source_layer,layer);
  assert.equal(result.features[0].id,`${layer}:parcel.0`);
  assert.ok(!JSON.stringify(result).includes('PRIVATE-DO-NOT-RETAIN'));
  assert.ok(!Object.hasOwn(result.features[0].properties,'NOMBRE'));
});

test('WFS: colecciones vacías verificadas completan sólo la consulta espacial',async()=>{
  const result=await queryWfs({layers:[layer],bbox,fetchImpl:async()=>reply(page([],0))});
  assert.deepEqual(result.features,[]);assert.equal(result.metadata.query_complete,true);
  assert.equal(result.metadata.query_scope,'requested_bbox_and_layers_only');assert.equal(result.metadata.coverage_status,'unknown');
});

test('WFS: IDs iguales en capas distintas no se confunden',async()=>{
  const result=await queryWfs({layers:ALLOWED_WFS_LAYERS.slice(0,2),bbox,fetchImpl:async()=>reply(page([feature(1)],1))});
  assert.equal(new Set(result.features.map(f=>f.id)).size,2);
});

test('WFS: total desconocido o inestable y páginas repetidas no dan falso completo',async()=>{
  for(const badTotal of [undefined,null,'unknown','',-1]){
    await assert.rejects(queryWfs({layers:[layer],bbox,fetchImpl:async()=>reply(page([feature(1)],badTotal))}),/total verificable/);
  }
  for(const variant of ['changed','duplicate','empty']){
    let calls=0;
    await assert.rejects(queryWfs({layers:[layer],bbox,fetchImpl:async()=>{
      calls++;return reply(calls===1?page([feature(1)],2):variant==='changed'?page([feature(2)],3):variant==='duplicate'?page([feature(1)],2):page([],2));
    }}),/cambió|repitió|incompleta/);
  }
});

test('WFS: límite global entre capas exige acotar sin devolver parciales',async()=>{
  let calls=0;
  await assert.rejects(queryWfs({layers:ALLOWED_WFS_LAYERS.slice(0,2),bbox,maxFeatures:3,fetchImpl:async()=>{calls++;return reply(page([feature(1),feature(2)],2));}}),/límite.*Acotá/);
  assert.equal(calls,2);
});

test('WFS: rechaza HTTP, HTML de login y excepción XML',async()=>{
  for(const response of [new Response('Sin acceso',{status:403}),new Response('<!DOCTYPE html><title>Login</title>'),new Response('<ServiceExceptionReport>error</ServiceExceptionReport>')]){
    await assert.rejects(queryWfs({layers:[layer],bbox,fetchImpl:async()=>response}),/HTTP 403|HTML\/XML/);
  }
});

test('WFS: CRS, coordenadas proyectadas, NC numérica y atributos no textuales son incompatibles',async()=>{
  for(const change of [
    p=>p.crs={type:'name',properties:{name:'EPSG:32719'}},
    p=>p.features[0].geometry.coordinates[0][0][1]=[350000,6100000],
    p=>p.features[0].properties.NOMENCLATU=123,
    p=>p.features[0].properties.PADRON={CUIT:'no'},
    p=>delete p.features[0].id,
  ]){const invalid=page([feature(1)],1);change(invalid);await assert.rejects(queryWfs({layers:[layer],bbox,fetchImpl:async()=>reply(invalid)}));}
});

test('WFS: capas, endpoint y bbox se validan antes de emitir solicitudes',async()=>{
  let calls=0;const fetchImpl=async()=>{calls++;return reply(page([],0));};
  for(const extra of [{layers:['geonode:unapproved']},{layers:[layer,layer]},{endpoint:'https://otro.example/wfs'},{bbox:[-34,-68,-34,-67]},{maxFeatures:5001}]){
    await assert.rejects(queryWfs({layers:[layer],bbox,fetchImpl,...extra}));
  }assert.equal(calls,0);
});

test('WFS: cancelación no convierte una página previa en resultado completo',async()=>{
  const controller=new AbortController();let calls=0;
  await assert.rejects(queryWfs({layers:[layer],bbox,signal:controller.signal,onProgress:()=>controller.abort(),fetchImpl:async()=>{calls++;return reply(page([feature(1)],2));}}),{name:'AbortError'});
  assert.equal(calls,1);
});

test('bbox: margen, coordenadas anidadas y validación WGS84',()=>{
  const b=bboxForCoordinates([[[-68,-35],[-67,-34]]],.01);
  for(const [i,expected]of[-68.01,-35.01,-66.99,-33.99].entries())assert.ok(Math.abs(b[i]-expected)<1e-10);
  assert.throws(()=>bboxForCoordinates([]));assert.throws(()=>bboxForCoordinates([[350000,6100000]]));assert.throws(()=>bboxForCoordinates([[-68,-35]],0));
});
