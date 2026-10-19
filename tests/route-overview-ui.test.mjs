import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseAst} from 'rollup/parseAst';
import {buildRouteChains,nearestOnLine,sliceLineBetween} from '../src/selection.mjs';
import {createRouteStudy,studyParts,studyStations,sectionAt,snapStudy} from '../src/route-study.mjs';
import {distance,slope} from '../src/geo.mjs';

const root=new URL('..',import.meta.url),read=path=>readFileSync(new URL(path,root),'utf8');
const routes=JSON.parse(read('public/data/routes.geojson')),chains=buildRouteChains(routes);

test('overview real: alternativa completa conserva todas sus cadenas sin puentes',()=>{
  for(const [id,count]of [['T1',4],['T2',2],['T3',1]]){
    const expected=chains.filter(f=>f.properties.route_id===id),study=createRouteStudy(chains,id);
    assert.equal(study.properties.whole_route,true);assert.equal(study.geometry.type,'MultiLineString');
    assert.equal(study.properties.segment_id,`route:${id}`);assert.equal(study.geometry.coordinates.length,count);
    assert.deepEqual(study.geometry.coordinates,expected.map(f=>f.geometry.coordinates));
    const sourceLength=expected.reduce((sum,f)=>sum+f.properties.length_m,0);
    assert.ok(Math.abs(study.properties.length_m-sourceLength)<.001,'Los huecos no deben sumarse a la longitud del eje');
  }
});

test('overview real: estaciones de T1 conservan quiebres y no generan pendiente entre partes',()=>{
  const study=createRouteStudy(chains,'T1'),parts=studyParts(study),points=studyStations(study,1000);
  for(let i=0;i<parts.length;i++){
    const here=points.filter(p=>p.part_id===parts[i].properties.part_id);
    assert.deepEqual(here[0].xy,parts[i].geometry.coordinates[0]);
    assert.deepEqual(here.at(-1).xy,parts[i].geometry.coordinates.at(-1));
    assert.ok(Math.abs(here[0].distance-parts[i].properties.from_m)<1e-7);
    if(i){const start=points.indexOf(here[0]),previous=points[start-1];
      assert.equal(here[0].break_before,true);
      assert.ok(Math.abs(here[0].distance-previous.distance)<1e-6);
      assert.ok(distance(here[0].xy,previous.xy)>1);
      assert.equal(slope({...previous,z:100},{...here[0],z:900}),null,'No debe existir una pendiente a través del hueco');
    }
  }
  assert.ok(Math.abs(points.at(-1).distance-study.properties.length_m)<1e-6);
});

test('overview real: secciones en un límite ambiguo respetan la parte indicada',()=>{
  const study=createRouteStudy(chains,'T1'),parts=studyParts(study),second=parts[1],at=second.properties.from_m;
  const right=sectionAt(study,at,100,25,{partId:second.properties.part_id});
  const left=sectionAt(study,at,100,25,{partId:parts[0].properties.part_id});
  assert.ok(distance(right[4].xy,second.geometry.coordinates[0])<.001);
  assert.ok(distance(left[4].xy,parts[0].geometry.coordinates.at(-1))<.001);
  assert.ok(distance(right[4].xy,left[4].xy)>1);
  assert.equal(right[4].part_id,second.properties.part_id);
  const hit=snapStudy(study,second.geometry.coordinates[0]);
  assert.equal(hit.part_id,second.properties.part_id);assert.ok(Math.abs(hit.chainage_m-at)<.001);
  assert.ok(hit.local_chainage_m<.001);
});

// Exercise actual binding/selection functions without a browser. Rendering,
// map effects and asynchronous requests are explicit doubles at applyStudy;
// this checks delegation and selection state, not DOM/Leaflet interaction.
function harness(){
  const source=read('src/main.js'),ast=parseAst(source),names=new Set(['events','activateRoute','handleRouteClick','chooseStudy']);
  const functions=ast.body.filter(n=>n.type==='FunctionDeclaration'&&names.has(n.id.name)).map(n=>source.slice(n.start,n.end)).join('\n');
  assert.equal(ast.body.filter(n=>n.type==='FunctionDeclaration'&&names.has(n.id.name)).length,4);
  const controls=new Map(),cards=['T1','T2','T3'].map(id=>({dataset:{route:id}})),checks=['T1','T2','T3'].map(id=>({dataset:{visible:id},checked:true}));
  const context={chains,createRouteStudy,nearestOnLine,sliceLineBetween,snapStudy,distance,
    $:selector=>{if(!controls.has(selector))controls.set(selector,{});return controls.get(selector);},
    $$:selector=>selector==='[data-route]'?cards:selector==='[data-visible]'?checks:[],
    num:String,requestAnimationFrame:()=>{},setTimeout:()=>0,clearTimeout:()=>{},
  };
  for(const name of ['syncLayers','focusStudy','fitAll','closePanel','openPanel','guide','removeLayer','drawStudyEndpoints','loadProfile','loadCross','scheduleParcelQuery','cancelParcelQuery','queryParcels','renderParcelTable','updateCrossLabel','drawEndpoints'])context[name]=()=>{};
  vm.createContext(context);
  vm.runInContext(`let active='T3',selected=null,selectedChain=null,selectionMode=false,pickCrossMode=false,pendingStart=null,endpointMarkers=null;const visible=new Set(['T1','T2','T3']),applied=[],messages=[];function applyStudy(study,chain){selected=study;selectedChain=chain;active=study.properties.route_id;applied.push(study);}function toast(message){messages.push(message);} ${functions}\nglobalThis.api={events,activateRoute,handleRouteClick,state:()=>({active,selected,visible,pendingStart,applied,messages}),setRange:()=>{selectionMode=true;pendingStart=null;}};`,context);
  context.api.events();return {...context,controls,cards,checks};
}

test('overview UI: pulsar tarjeta activa toda T1 y filtra las otras propuestas',()=>{
  const h=harness();h.cards[0].onclick();const state=h.api.state();
  assert.equal(state.active,'T1');assert.equal(state.selected.properties.whole_route,true);
  assert.equal(state.selected.geometry.coordinates.length,4);assert.deepEqual([...state.visible],['T1']);
  assert.deepEqual(h.checks.map(c=>c.checked),[true,false,false]);
});

test('overview UI: clic de mapa cambia alternativa completa y no elige sólo su cadena',()=>{
  const h=harness(),chain=chains.find(c=>c.properties.route_id==='T2');
  h.cards[0].onclick();const [lng,lat]=chain.geometry.coordinates[0];h.api.handleRouteClick(chain,{lng,lat});
  const state=h.api.state();assert.equal(state.active,'T2');assert.equal(state.selected.geometry.coordinates.length,2);
  assert.equal(state.selected.properties.whole_route,true);assert.deepEqual([...state.visible],['T2']);
});

test('overview UI: ajustar mantiene alternativa activa y volver completa recupera todas sus partes',()=>{
  const h=harness();h.cards[0].onclick();h.api.setRange();
  const wrong=chains.find(c=>c.properties.route_id==='T2'),[lng,lat]=wrong.geometry.coordinates[0];
  h.api.handleRouteClick(wrong,{lng,lat});assert.equal(h.api.state().pendingStart,null);
  const chain=chains.find(c=>c.properties.route_id==='T1'),cut=sliceLineBetween(chain.geometry.coordinates,400,1400);
  for(const p of [cut[0],cut.at(-1)])h.api.handleRouteClick(chain,{lng:p[0],lat:p[1]});
  let state=h.api.state();assert.equal(state.active,'T1');assert.equal(state.selected.geometry.type,'LineString');
  assert.equal(state.selected.properties.custom,true);assert.ok(Math.abs(state.selected.properties.length_m-1000)<.01);
  assert.deepEqual([...state.visible],['T1']);
  h.controls.get('#whole-chain').onclick();state=h.api.state();
  assert.equal(state.active,'T1');assert.equal(state.selected.properties.whole_route,true);assert.equal(state.selected.geometry.coordinates.length,4);
});

test('overview UI: Inicio/Fin en partes distintas de T1 no construye un puente',()=>{
  const h=harness();h.cards[0].onclick();h.api.setRange();const parts=chains.filter(c=>c.properties.route_id==='T1');
  for(const chain of parts.slice(0,2)){const [lng,lat]=chain.geometry.coordinates[0];h.api.handleRouteClick(chain,{lng,lat});}
  assert.equal(h.api.state().selected.properties.whole_route,true);
  assert.equal(h.api.state().applied.length,1,'Un final en otra cadena no debe crear un nuevo estudio');
});

test('prepared Copernicus: JSON final corresponde a geometría, partes y secciones actuales',()=>{
  const data=JSON.parse(read('public/data/overviews.json'));
  assert.equal(data.model,'Copernicus GLO-30');assert.equal(data.step_m,1000);
  assert.ok(Number.isFinite(Date.parse(data.generated_at))&&Number.isFinite(Date.parse(data.finished_at)),'Sólo revisar un archivo de generación finalizada');
  let totalValid=0,totalMissing=0;
  for(const id of ['T1','T2','T3']){
    const prepared=data.routes[id],study=createRouteStudy(chains,id),parts=studyParts(study),expected=studyStations(study,1000);
    assert.equal(prepared.parts,parts.length);
    assert.ok(Math.abs(prepared.length_m-study.properties.length_m)<.01);
    assert.equal(prepared.profile.length,expected.length);
    for(let i=0;i<expected.length;i++){
      const actual=prepared.profile[i],point=expected[i];
      assert.equal(actual.part_id,point.part_id);assert.equal(Boolean(actual.break_before),Boolean(point.break_before));
      assert.ok(Math.abs(actual.distance-point.distance)<.001);
      assert.ok(distance(actual.xy,point.xy)<.01,`${id}: muestra ${i} debe permanecer sobre el eje actual`);
    }
    const cross=sectionAt(study,study.properties.length_m/2);
    assert.equal(prepared.cross.length,cross.length);
    assert.ok(Math.abs(prepared.cross_chainage_m-study.properties.length_m/2)<.01);
    for(let i=0;i<cross.length;i++){
      const point=prepared.cross[i];assert.equal(point.part_id,cross[i].part_id);
      assert.ok(Math.abs(point.distance-cross[i].distance)<.01);assert.ok(distance(point.xy,cross[i].xy)<.01);
    }
    const all=[...prepared.profile,...prepared.cross];
    assert.ok(all.every(point=>Object.hasOwn(point,'z')&&(point.z===null||Number.isFinite(point.z))),'Ausencia de elevación debe ser null explícito');
    const valid=all.filter(p=>Number.isFinite(p.z)).length,missing=all.filter(p=>p.z===null).length;
    assert.equal(prepared.valid_samples,valid);assert.equal(prepared.missing_samples,missing);
    assert.equal(prepared.status,missing===0?'complete':valid?'partial':'unavailable');totalValid+=valid;totalMissing+=missing;
  }
  assert.equal(data.complete,totalMissing===0);assert.equal(data.status,totalMissing===0?'complete':totalValid?'partial':'unavailable');
  assert.equal(data.total_samples,totalValid+totalMissing);
  assert.ok(!/CUIT_TITUL|qa_aplicacion|revision_topografia|task_scoped_ai_roles/.test(JSON.stringify(data)));
  if(process.env.CHECK_BUILT_PRESENTATION==='1'){
    const published=JSON.parse(read('dist/data/overviews.json'));
    assert.deepEqual(Object.keys(published).sort(),['schema_version','model','step_m','generated_at','routes'].sort(),'La salida pública no debe conservar metadatos internos de ejecución');
    assert.equal(published.model,data.model);assert.equal(published.step_m,data.step_m);
    for(const id of ['T1','T2','T3']){
      const p=published.routes[id];
      assert.deepEqual(Object.keys(p).sort(),['profile','cross','length_m','parts','status','valid_samples','missing_samples'].sort());
      assert.deepEqual(p.profile,data.routes[id].profile);assert.deepEqual(p.cross,data.routes[id].cross);
      assert.equal(p.length_m,data.routes[id].length_m);
    }
  }
});
