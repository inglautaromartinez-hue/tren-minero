import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseAst} from 'rollup/parseAst';
import {buildRouteChains,nearestOnLine,sliceLineBetween} from '../src/selection.mjs';
import {createRouteStudy} from '../src/route-study.mjs';
import {nearestCrossSection} from '../src/cross-sections.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const chains=buildRouteChains(JSON.parse(read('public/data/routes.geojson')));
// Handlers reales en VM con efectos de DOM/Leaflet y fetch sustituidos.
// Se lee el catálogo real, sin afirmar interacción de navegador ni red.
function harness(custom=false){
 const source=read('src/main.js'),ast=parseAst(source),names=new Set(['loadCross','events','handleRouteClick']);
 const code=ast.body.filter(n=>n.type==='FunctionDeclaration'&&names.has(n.id.name)).map(n=>source.slice(n.start,n.end)).join('\n');
 const controls=new Map(),catalog=JSON.parse(read('public/data/cross-sections-T2.json'));
 const chain=chains.find(c=>c.properties.route_id==='T2');
 const selected=custom?{type:'Feature',properties:{route_id:'T2',chain_id:chain.properties.chain_id,from_m:150,to_m:350,length_m:200},geometry:{type:'LineString',coordinates:sliceLineBetween(chain.geometry.coordinates,150,350)}}:createRouteStudy(chains,'T2');
 const context={AbortController,chains,selected,nearestCrossSection,nearestOnLine,sliceLineBetween,num:String,
  $:selector=>{if(!controls.has(selector))controls.set(selector,{});return controls.get(selector);},$$:()=>[],fetch:async url=>{assert.equal(url,'/data/cross-sections-T2.json');return{ok:true,json:async()=>catalog};},
 };
 for(const name of ['fitAll','setView','syncLayers','focusStudy','closePanel','guide','loadProfile','scheduleParcelQuery','cancelParcelQuery','queryParcels','loadParcelCensus','renderParcelTable','openPanel','removeLayer','drawEndpoints','drawStudyEndpoints','updateCrossLabel','activateRoute','chooseStudy','toast'])context[name]=()=>{};
 vm.createContext(context);
 vm.runInContext(`let active='T2',revision=1,crossController=null,crossEntries=[],selectedCrossId=null,crossLine=null,selectionMode=false,pickCrossMode=true,pendingStart=null,endpointMarkers=null;const sectionCache=new Map(),visible=new Set(),shown=[];function showCrossSection(id){selectedCrossId=id;shown.push(id);} ${code}\nglobalThis.api={loadCross,events,handleRouteClick,state:()=>({crossEntries,selectedCrossId,shown})};`,context);
 return{...context,controls,chain};
}
test('UI transversal real: catálogo precalculado y flechas recorren secciones fijas',async()=>{
 const h=harness();await h.api.loadCross({pan:false});h.api.events();
 const before=h.api.state();assert.equal(before.crossEntries.length,3276);
 const at=before.crossEntries.findIndex(e=>e.id===before.selectedCrossId);
 h.controls.get('#cross-next').onclick();assert.equal(h.api.state().selectedCrossId,before.crossEntries[at+1].id);
 h.controls.get('#cross-prev').onclick();assert.equal(h.api.state().selectedCrossId,before.selectedCrossId);
});
test('UI transversal real: recorte conserva grilla original y clic elige sección almacenada',async()=>{
 const h=harness(true);await h.api.loadCross({pan:false});
 assert.deepEqual([...h.api.state().crossEntries].map(e=>e.chainage_m),[200,300]);
 const point=sliceLineBetween(h.chain.geometry.coordinates,243,243)[0];
 h.api.handleRouteClick(h.chain,{lng:point[0],lat:point[1]});
 const state=h.api.state(),entry=state.crossEntries.find(e=>e.id===state.selectedCrossId);
 assert.equal(entry.chainage_m,200);assert.equal(entry.z.length,9);assert.ok(entry.z.every(Number.isFinite));
});
