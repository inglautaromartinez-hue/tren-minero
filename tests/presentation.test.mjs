import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {buildRouteChains,nearestOnLine,sliceLineBetween} from '../src/selection.mjs';
import geodesic from 'geographiclib-geodesic';
import {stations,transverse,distance} from '../src/geo.mjs';
import {buildStudyBuffer,intersectStudyCandidates} from '../src/study-buffer.mjs';
const root=new URL('..',import.meta.url);
const read=name=>readFileSync(new URL(name,root),'utf8');

test('presentación: marca LAUGIS y equipo interno fuera de la interfaz',()=>{
  const main=read('src/main.js'),html=read('index.html');
  assert.ok(/<title>[^<]*LAUGIS/i.test(html),'El título debe identificar LAUGIS');
  assert.ok(/LAUGIS/.test(main),'La interfaz debe identificar LAUGIS');
  assert.ok(!/import\s+project\s+from|config\/project\.json|teamView\s*\(|team-view|data-view=["']team["']/.test(main),'El equipo y su configuración deben quedar fuera del frontend');
  assert.ok(!/OBSERVATORIO TERRITORIAL · IDECAM|Colegio de Agrimensura de Mendoza/.test(main),'No debe quedar la marca institucional anterior');
});

test('presentación: descargas, CSV, repositorio y hashes internos no tienen controles ni handlers',()=>{
  const main=read('src/main.js');
  assert.ok(!/download-routes|download-manifest|export-parcels|function\s+download\s*\(|\.download\s*=|safeCSV/.test(main),'No deben quedar controles o handlers de exportación');
  assert.ok(!/https:\/\/github\.com\//.test(main),'La interfaz no debe enlazar el repositorio');
  assert.ok(!/source_sha256|SHA-256|AGENTS\.md|EQUIPO_Y_CONTROLES|qa_aplicacion|revision_topografia/.test(main),'La interfaz no debe presentar trazabilidad interna del equipo');
});

test('contrato UI: los controles estáticos usados por handlers existen en el template',()=>{
  const main=read('src/main.js');
  const render=read('index.html')+main.slice(main.indexOf('function render'),main.indexOf('function initMap'));
  const ids=new Set([...render.matchAll(/\bid="([a-z][\w-]*)"/gi)].map(match=>match[1]));
  const references=new Set([...main.matchAll(/\$\('#([a-z][\w-]*)'\)/gi)].map(match=>match[1]));
  const missing=[...references].filter(id=>!ids.has(id));
  assert.deepEqual(missing,[],'Un handler que accede a un control inexistente rompe init; los IDs dinámicos se revisan aparte');
  assert.ok(/init\(\)\.catch/.test(main),'La aplicación debe ejecutar su bootstrap y gestionar un fallo de inicio');
});

test('selección real: azul continuo, roja/naranja separadas en huecos mayores de un metro',()=>{
  const routes=JSON.parse(read('public/data/routes.geojson'));
  const chains=buildRouteChains(routes,{maxGapM:1});
  assert.deepEqual(['T1','T2','T3'].map(id=>chains.filter(c=>c.properties.route_id===id).length),[4,2,1]);
  const blue=chains.find(c=>c.properties.route_id==='T3');
  assert.deepEqual(blue.properties.source_segment_ids,['T3-01','T3-02','T3-03','T3-04','T3-05']);
  assert.ok(blue.properties.join_gaps_m.every(gap=>gap<=1));
  assert.deepEqual(blue.geometry.coordinates[0],routes.features.find(f=>f.properties.segment_id==='T3-01').geometry.coordinates[0]);
  assert.deepEqual(blue.geometry.coordinates.at(-1),routes.features.find(f=>f.properties.segment_id==='T3-05').geometry.coordinates.at(-1));
});

test('selección real: recorte y puntos invertidos conservan eje y progresivas',()=>{
  const routes=JSON.parse(read('public/data/routes.geojson'));
  const line=buildRouteChains(routes).find(c=>c.properties.route_id==='T3').geometry.coordinates;
  const cut=sliceLineBetween(line,400,1400),reversed=sliceLineBetween(line,1400,400);
  assert.deepEqual(reversed,cut.toReversed());
  const length=cut.slice(1).reduce((sum,p,i)=>sum+geodesic.Geodesic.WGS84.Inverse(cut[i][1],cut[i][0],p[1],p[0]).s12,0);
  assert.ok(Math.abs(length-1000)<.001,'El tramo elegido debe medir 1.000 m sobre el eje');
  const start=nearestOnLine(line,cut[0]),end=nearestOnLine(line,cut.at(-1));
  assert.ok(start.offset_m<.001&&end.offset_m<.001);
  assert.ok(Math.abs(start.chainage_m-400)<.01&&Math.abs(end.chainage_m-1400)<.01);
});

test('selección real: snap, perfil y sección comparten la misma progresiva WGS84 en tramo largo',()=>{
  const routes=JSON.parse(read('public/data/routes.geojson'));
  const line=buildRouteChains(routes).find(c=>c.properties.route_id==='T3').geometry.coordinates;
  const at=300000,expected=sliceLineBetween(line,at,at)[0];
  const point=stations(line,at)[1],center=transverse(line,at)[4];
  assert.equal(point.distance,at);
  assert.ok(distance(point.xy,expected)<.01,'El perfil debe conservar la progresiva elipsoidal de selección');
  assert.ok(distance(center.xy,expected)<.01,'La sección elegida sobre el mapa debe permanecer sobre el punto indicado');
});

test('selección real con parcelas sintéticas: perfil y afectación usan el mismo recorte',()=>{
  const routes=JSON.parse(read('public/data/routes.geojson'));
  const line=buildRouteChains(routes).find(c=>c.properties.route_id==='T3').geometry.coordinates;
  const coords=sliceLineBetween(line,400,1400),study={type:'Feature',properties:{route_id:'T3'},geometry:{type:'LineString',coordinates:coords}};
  const profile=stations(coords,100);
  assert.deepEqual(profile[0].xy,coords[0]);assert.deepEqual(profile.at(-1).xy,coords.at(-1));
  const parcelAt=(at,nc)=>{
    const [x,y]=sliceLineBetween(line,at,at)[0],d=.00005;
    return {type:'Feature',properties:{nc,source_layer:'synthetic-contract'},geometry:{type:'Polygon',coordinates:[[[x-d,y-d],[x+d,y-d],[x+d,y+d],[x-d,y+d],[x-d,y-d]]]}};
  };
  const result=intersectStudyCandidates({type:'FeatureCollection',features:[parcelAt(900,'TEST_INSIDE'),parcelAt(10400,'TEST_OUTSIDE')],metadata:{query_complete:true}},buildStudyBuffer(study),5);
  assert.deepEqual(result.features.map(f=>f.properties.nc),['TEST_INSIDE']);
  assert.deepEqual(result.parcel_outlines.features.map(f=>f.properties.nc),['TEST_INSIDE']);
  assert.equal(result.metadata.selected_revision,5);
});

// Explicit opt-in after a fresh build. Default CI tests run before build and
// must not silently validate an old dist directory as the current result.
test('presentación compilada: sin configuración interna ni nombres de agentes',{
  skip:process.env.CHECK_BUILT_PRESENTATION!=='1'?'Ejecutar CHECK_BUILT_PRESENTATION=1 después de npm run build':false,
},()=>{
  const assets=new URL('dist/assets/',root);assert.ok(existsSync(assets));
  const javascript=readdirSync(assets).filter(name=>name.endsWith('.js')).map(name=>readFileSync(new URL(name,assets),'utf8')).join('\n');
  assert.ok(/<title>[^<]*LAUGIS/i.test(read('dist/index.html')),'El título compilado debe identificar LAUGIS');
  assert.ok(!/qa_aplicacion|revision_topografia|EQUIPO_Y_CONTROLES|persistent_agent_service|task_scoped_ai_roles|Coordinador principal implementa|source_sha256|AGENTS\.md/.test(javascript),'El bundle no debe contener configuración interna ni nombres de agentes');
  assert.ok(!/OBSERVATORIO TERRITORIAL · IDECAM|Colegio de Agrimensura de Mendoza|Descargar ejes GeoJSON|Exportar CSV|https:\/\/github\.com\/inglautaromartinez-hue\/tren-minero/.test(javascript),'El bundle no debe presentar marca anterior ni exportaciones retiradas');
  const manifest=JSON.parse(read('dist/data/manifest.json'));
  assert.ok(!/source_sha256|source_placemarks|source_name|source_vertex_count|source_max_edge_km|persistent_agent_service|task_scoped_ai_roles/.test(JSON.stringify(manifest)),'La ficha desplegable no debe exponer procedencia interna o agentes');
  const deployedRoutes=JSON.parse(read('dist/data/routes.geojson'));
  assert.ok(!/source_name|source_vertex_count|source_max_edge_km|"trimmed"|mining_design_verified/.test(JSON.stringify(deployedRoutes)),'El mapa desplegado debe usar propiedades de presentación');
  assert.equal(existsSync(new URL('dist/data/corridors-analysis.geojson',root)),false,'El corredor analítico debe calcularse para la selección, sin servir el dataset completo');
});
