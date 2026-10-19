import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {setImmediate as nextTurn} from 'node:timers/promises';
import {parseAst} from 'rollup/parseAst';
import {validateParcelData,routeSummary} from '../src/parcel-data.mjs';
import {buildRouteChains,sliceLineBetween} from '../src/selection.mjs';
import {createRouteStudy,snapStudy} from '../src/route-study.mjs';
import {buildStudyBuffer} from '../src/study-buffer.mjs';
import {clipParcelSnapshot} from '../src/parcel-snapshot.mjs';

const root=new URL('..',import.meta.url),read=path=>readFileSync(new URL(path,root),'utf8');

// Lifecycle only: no browser, network, parcel measurements or Leaflet drawing
// are simulated as integration results. The worker returns an empty protocol
// payload; actual snapshot geometry/content is tested separately below.
function loaderHarness({holdFetch=false,holdWorker=false,failOutlines=false,failOnce=false,custom=false}={}){
  const source=read('src/main.js'),ast=parseAst(source),node=ast.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='loadParcelCensus');
  assert.ok(node,'Debe existir el cargador general independiente del zoom');
  const detailNode=ast.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='queryParcels');
  const body=(source.slice(node.start,node.end)+'\n'+source.slice(detailNode.start,detailNode.end)).replaceAll('import.meta.url',JSON.stringify(import.meta.url)).replace("await import('./wfs-client.mjs')",'globalThis.WFS_TEST_DOUBLE');
  const controls=new Map(),workers=[],requests=[],pending=[],result={type:'FeatureCollection',features:[],metadata:{analysis_complete:true,routes:{T1:{analysis_complete:true}}}};
  const snapshot=result;
  class WorkerDouble{
    constructor(){workers.push(this);}terminate(){this.terminated=true;}
    postMessage(message){this.message=message;if(!holdWorker)queueMicrotask(()=>this.respond());}
    respond(){this.onmessage?.({data:{type:this.message.type==='snapshot'?'snapshot':'parcel',result:this.message.type==='snapshot'?result:{type:'FeatureCollection',features:[],metadata:{warnings:[]}}}});}
  }
  const context={AbortController,DOMException,URL,Worker:WorkerDouble,Map,Set,
    $:selector=>{if(!controls.has(selector))controls.set(selector,{});return controls.get(selector);},
    num:String,renderParcelDashboard:()=>{},scheduleParcelQuery:()=>{},cancelParcelQuery:()=>{},toast:()=>{},validateParcelData,
    WFS_TEST_DOUBLE:{ALLOWED_WFS_LAYERS:['test-only'],queryWfs:async()=>({type:'FeatureCollection',features:[]})},
    getCensusIndex:async()=>({routes:{T1:{url:'/data/parcel-census-T1.geojson',analysis_url:'/data/parcel-analysis-T1.geojson',parcel_count:0,...(failOutlines?{outlines_url:'/data/parcel-outlines-T1.geojson'}:{})}}}),
    fetch:async url=>{requests.push(url);if(failOutlines&&url.includes('parcel-outlines')||failOnce&&requests.length===1)return {ok:false,status:503};if(holdFetch)await new Promise(resolve=>pending.push(resolve));return {ok:true,json:async()=>snapshot};},
  };
  vm.createContext(context);
  vm.runInContext(`let selected={properties:{route_id:'T1',whole_route:${!custom}}},studyBuffer={properties:{route_id:'T1'}},active='T1',revision=1,censusController=null,censusWorker=null,censusError='',censusIndexPromise=null,parcelData=null,parcelSnapshot=null,focusedNC=null,parcelOutlines=null,draws=0,zoom=7,parcelController=null,parcelWorker=null,lastQueryKey='';const censusCache=new Map(),outlineCache=new Map();const map={getZoom:()=>zoom,getBounds:()=>({getWest:()=>-68.01,getSouth:()=>-35,getEast:()=>-68,getNorth:()=>-34.99})};function drawParcels(){draws++;}${body}\nglobalThis.api={loadParcelCensus,queryParcels,zoomIn:()=>zoom=12,state:()=>({active,parcelData,parcelSnapshot,censusError,draws}),change:()=>{censusController?.abort();censusController=null;revision++;active='T2';selected={properties:{route_id:'T2'}};studyBuffer={properties:{route_id:'T2'}};parcelData={marker:'current-T2'};}};`,context);
  return {api:context.api,workers,requests,pending,result,controls};
}

test('census lifecycle: análisis general listo carga a zoom regional sin worker ni exigir área visible',async()=>{
  const h=loaderHarness();await h.api.loadParcelCensus();
  assert.equal(h.requests.length,1);assert.match(h.requests[0],/parcel-analysis-T1/);assert.equal(h.workers.length,0);
  assert.equal(h.api.state().parcelData.features,h.result.features);assert.equal(h.api.state().draws,1);
  assert.equal(h.api.state().parcelData.metadata.study_scope,'full_route_prepared_analysis');
});

test('census lifecycle: una descarga tardía no reemplaza la alternativa nueva',async()=>{
  const h=loaderHarness({holdFetch:true}),loading=h.api.loadParcelCensus();
  await nextTurn();assert.equal(h.pending.length,1);
  h.api.change();h.pending[0]();await loading;
  assert.equal(h.api.state().active,'T2');assert.equal(h.api.state().parcelData.marker,'current-T2');
  assert.equal(h.api.state().draws,0);assert.equal(h.workers.length,0);
});

test('census lifecycle: mensaje de worker cancelado no dibuja el corredor anterior',async()=>{
  const h=loaderHarness({holdWorker:true,custom:true}),loading=h.api.loadParcelCensus();
  await nextTurn();assert.equal(h.workers.length,1);
  assert.match(h.requests[0],/parcel-census-T1/);assert.equal(h.workers[0].message.type,'snapshot');
  h.api.change();h.workers[0].respond();await loading;
  assert.equal(h.api.state().parcelData.marker,'current-T2');assert.equal(h.api.state().draws,0);
});

test('census lifecycle: fallo del contorno visual conserva el resultado analítico',async()=>{
  const h=loaderHarness({failOutlines:true});await h.api.loadParcelCensus();
  assert.equal(h.requests.length,2);assert.match(h.requests[1],/parcel-outlines/);
  assert.equal(h.api.state().parcelData.features,h.result.features);assert.equal(h.api.state().draws,1);
  assert.match(h.controls.get('#parcel-status').textContent,/Contornos de contexto pendientes/);
});

test('census lifecycle: error HTTP no equivale a cero y permite reintentar',async()=>{
  const h=loaderHarness({failOnce:true});await h.api.loadParcelCensus();
  assert.equal(h.api.state().parcelData,null);assert.match(h.api.state().censusError,/503/);assert.equal(h.api.state().draws,0);
  await h.api.loadParcelCensus({refresh:true});assert.equal(h.api.state().parcelData.features,h.result.features);assert.equal(h.api.state().censusError,'');
});

test('census lifecycle: detalle visible no sustituye la colección analítica general',async()=>{
  const h=loaderHarness();await h.api.loadParcelCensus();h.api.zoomIn();const baseline=h.api.state().parcelData;
  await h.api.queryParcels();assert.equal(h.api.state().parcelData,baseline);
  assert.match(h.controls.get('#parcel-status').textContent,/Se conserva el total del análisis del corredor/);
});

const data=path=>JSON.parse(read(`public/data/${path}`));
const closeArea=(actual,expected)=>assert.ok(Math.abs(actual-expected)<Math.max(1,Math.abs(expected)*1e-7),`${actual} m² difiere de ${expected} m²`);

test('census real: tres alternativas con NC únicas, trazabilidad, sin CUIT ni cobertura oficial inventada',()=>{
  const index=data('parcel-census.json');
  assert.equal(index.endpoint,'https://geonode-cam.marketsis.com.ar/geoserver/wfs');
  assert.equal(index.coverage_status,'unknown');assert.equal(index.owner_available,false);
  assert.ok(Number.isFinite(Date.parse(index.fetched_at)));assert.equal(index.source_date,'unknown');
  let planned=0,completed=0;
  for(const id of ['T1','T2','T3']){
    const entry=index.routes[id],snapshot=data(`parcel-census-${id}.geojson`),outlines=data(`parcel-outlines-${id}.geojson`),prepared=validateParcelData(data(`parcel-analysis-${id}.geojson`));
    assert.equal(entry.url,`/data/parcel-census-${id}.geojson`);assert.equal(entry.outlines_url,`/data/parcel-outlines-${id}.geojson`);
    assert.equal(entry.analysis_url,`/data/parcel-analysis-${id}.geojson`);
    assert.equal(entry.queries_planned,entry.queries_complete+entry.queries_failed);
    assert.equal(entry.query_plan_complete,entry.queries_failed===0&&entry.queries_complete===entry.queries_planned);
    assert.equal(entry.coverage_status,'unknown');assert.ok(entry.covered_union_m2<=entry.affected_sum_m2+1);
    closeArea(entry.corridor_m2-entry.covered_union_m2,entry.uncovered_m2);
    assert.equal(snapshot.metadata.route_id,id);assert.equal(snapshot.metadata.support_buffer_m,125);
    assert.equal(snapshot.metadata.study_buffer_m,100);assert.ok(snapshot.metadata.support_geometry);
    assert.equal(snapshot.metadata.owner_available,false);assert.equal(snapshot.metadata.owner_requested,false);
    assert.equal(snapshot.metadata.coverage_status,'unknown');assert.equal(snapshot.metadata.source_date,'unknown');
    for(const field of ['parcel_count','covered_union_m2','affected_sum_m2','query_plan_complete','queries_complete','excluded_records','source_conflicts'])assert.equal(snapshot.metadata.stats_100m[field],entry[field]);
    if(entry.excluded_records||entry.source_conflicts){assert.equal(entry.status,'partial');assert.equal(snapshot.metadata.analysis_complete,false);}
    const seen=new Set();
    for(const feature of snapshot.features){
      const p=feature.properties;assert.equal(p.route_id,id);assert.equal(typeof p.nc,'string');assert.ok(p.nc.length>0);
      assert.ok(!seen.has(p.nc),`${id}: NC analítica duplicada ${p.nc}`);seen.add(p.nc);
      assert.ok(p.parcel_m2===null||Number.isFinite(p.parcel_m2)&&p.parcel_m2>0);
      assert.ok(Number.isFinite(p.support_m2)&&p.support_m2>0);
      for(const key of Object.keys(p))assert.ok(!/cuit|titular|nombre|owner/i.test(key),`${id}: campo personal ${key}`);
    }
    assert.equal(seen.size,entry.support_nc_count);
    assert.equal(prepared.metadata.geometry_scope,'prepared_full_route_100m_intersections');assert.equal(prepared.metadata.study_buffer_m,100);
    assert.equal(prepared.features.length,entry.parcel_count);assert.equal(new Set(prepared.features.map(f=>f.properties.nc)).size,entry.parcel_count);
    const originals=new Map(snapshot.features.map(f=>[f.properties.nc,f.properties.parcel_m2]));let sum=0;
    for(const feature of prepared.features){
      const p=feature.properties;assert.equal(p.route_id,id);assert.ok(seen.has(p.nc));assert.equal(p.parcel_m2,originals.get(p.nc));
      sum+=p.affected_m2;if(p.parcel_m2!==null){
        // Published areas are rounded to .001 m² and percentages to .000001.
        const rounding=0.0000005+100*0.0005/p.parcel_m2+100*p.affected_m2*0.0005/(p.parcel_m2*p.parcel_m2);
        assert.ok(Math.abs(p.affected_pct-p.affected_m2/p.parcel_m2*100)<rounding+1e-9);
      }
      for(const key of Object.keys(p))assert.ok(!/cuit|titular|nombre|owner/i.test(key));
    }
    closeArea(sum,entry.affected_sum_m2);closeArea(prepared.metadata.routes[id].covered_union_m2,entry.covered_union_m2);
    assert.equal(prepared.metadata.coverage_status,'unknown');assert.equal(prepared.metadata.owner_available,false);
    assert.equal(outlines.type,'FeatureCollection');
    for(const feature of outlines.features){assert.ok(seen.has(feature.properties.nc));for(const key of Object.keys(feature.properties))assert.ok(!/cuit|titular|nombre|owner/i.test(key));}
    planned+=entry.queries_planned;completed+=entry.queries_complete;
  }
  assert.ok(planned>0);assert.equal(completed,planned,'El archivo final debe corresponder al plan terminado, aunque excluya geometrías inválidas');
});

let realT2;
function getRealT2(){
  if(realT2)return realT2;
  const snapshot=data('parcel-census-T2.geojson'),chains=buildRouteChains(data('routes.geojson')),study=createRouteStudy(chains,'T2');
  const full=clipParcelSnapshot(snapshot,buildStudyBuffer(study),{revision:101});
  return realT2={snapshot,chains,study,full};
}

test('census real: el recorte T2 de ±100 m reproduce NC y unión publicadas sin usar área de soporte como denominador',()=>{
  const {snapshot,full}=getRealT2(),entry=data('parcel-census.json').routes.T2;
  validateParcelData(full);assert.equal(full.features.length,entry.parcel_count);
  assert.equal(new Set(full.features.map(f=>f.properties.nc)).size,full.features.length);
  const info=full.metadata.routes.T2;closeArea(info.covered_union_m2,entry.covered_union_m2);closeArea(info.affected_sum_m2,entry.affected_sum_m2);
  assert.equal(full.metadata.custom_buffer_coverage_status,'within_snapshot_support');assert.equal(full.metadata.official_coverage_confirmed,false);
  assert.equal(full.metadata.coverage_status,'unknown');assert.equal(full.metadata.selected_revision,101);
  closeArea(routeSummary(full,'T2').areaHa*10000,info.covered_union_m2);
  const original=new Map(snapshot.features.map(f=>[f.properties.nc,f.properties.parcel_m2]));
  for(const feature of full.features){const p=feature.properties;assert.equal(p.parcel_m2,original.get(p.nc));if(p.parcel_m2!==null)assert.ok(Math.abs(p.affected_pct-p.affected_m2/p.parcel_m2*100)<1e-8);}
});

test('census real: ajustar T2 a un kilómetro produce su propio subconjunto y superficies',()=>{
  const {snapshot,chains,study,full}=getRealT2(),first=full.features[0];
  assert.ok(first,'La prueba debe usar una parcela efectivamente afectada');
  const snap=snapStudy(study,first.geometry.coordinates[0][0][0]),chain=chains.find(c=>c.properties.chain_id===snap.part_id);
  assert.ok(chain);const start=Math.max(0,snap.local_chainage_m-500),end=Math.min(chain.properties.length_m,snap.local_chainage_m+500);
  const selected={type:'Feature',properties:{route_id:'T2',custom:true},geometry:{type:'LineString',coordinates:sliceLineBetween(chain.geometry.coordinates,start,end)}};
  const cut=clipParcelSnapshot(snapshot,buildStudyBuffer(selected),{revision:102});validateParcelData(cut);
  assert.ok(cut.features.length>0&&cut.features.length<full.features.length);
  const fullNC=new Map(full.features.map(f=>[f.properties.nc,f.properties]));
  for(const f of cut.features){assert.ok(fullNC.has(f.properties.nc));assert.equal(f.properties.parcel_m2,fullNC.get(f.properties.nc).parcel_m2);}
  assert.ok(cut.metadata.routes.T2.covered_union_m2<full.metadata.routes.T2.covered_union_m2);
  assert.equal(cut.metadata.selected_revision,102);assert.equal(cut.metadata.official_coverage_confirmed,false);
  assert.equal(cut.metadata.custom_buffer_coverage_status,'within_snapshot_support');
});
