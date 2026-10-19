import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';
import {stations,slope,transverse,distance} from './geo.mjs';
import {buildRouteChains,nearestOnLine,sliceLineBetween} from './selection.mjs';
import {routeSummary,validateParcelData} from './parcel-data.mjs';

const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const num=(n,d=1)=>n==null?'—':new Intl.NumberFormat('es-AR',{maximumFractionDigits:d}).format(n);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const reverse=p=>[p[1],p[0]];
const railIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 3v18h14M9 4l10 6-10 6M13 8v8"/></svg>';
let manifest,routes,corridors,stationData,chains,map,active='T3',selected=null,selectedChain=null,studyBuffer=null;
let selectionMode=true,pendingStart=null,pickCrossMode=false,revision=0,panel='long',panelOpen=false;
let highlight,endpointMarkers,bufferHighlight,longMarker=null,crossMarker=null,crossLine=null,parcelOutlineLayer=null,parcelOverlapLayer=null,parcelFocusLayer=null;
let profile=[],crossProfile=[],crossFraction=.5,parcelData=null,parcelOutlines=null,focusedNC=null;
let bufferWorker=null,parcelWorker=null,parcelController=null,longController=null,crossController=null,autoTimer,lastQueryKey='';
const visible=new Set(['T1','T2','T3']),lineLayers={},globalBuffers={},profileCache=new Map();
const routeInfo=id=>manifest.routes[id];
async function json(url){const r=await fetch(url);if(!r.ok)throw Error(`No se pudo cargar la vista (${r.status}).`);return r.json();}

async function init(){
 [manifest,routes,corridors,stationData]=await Promise.all(['/data/manifest.json','/data/routes.geojson','/data/corridors.geojson','/data/stations.geojson'].map(json));
 chains=buildRouteChains(routes);
 render();initMap();events();updateSelectionUI();guide();
}
function render(){
 $('#app').innerHTML=`
 <header class="header"><a class="brand" href="#" aria-label="LAUGIS · Tren Minero"><span class="brand-icon">${railIcon}</span><span><strong>LAUGIS</strong><small>TREN MINERO · ANÁLISIS TERRITORIAL</small></span></a><nav aria-label="Vistas"><button data-view="explore" class="nav active">Explorar</button><button data-view="compare" class="nav">Comparar trazas</button><button data-view="about" class="nav">Información</button></nav><span class="stage"><i></i> Estudio preliminar</span><button id="mobile-panel" class="mobile-toggle" aria-expanded="false">Trazas</button></header>
 <main class="workspace"><aside id="sidebar" class="sidebar"><div class="side-heading"><div class="eyebrow">EXPLORADOR TERRITORIAL</div><h1>Elegí el recorrido.<br>Explorá sus detalles.</h1><p>Tocá una línea en el mapa o marcá dos puntos para estudiar una parte del recorrido.</p></div><div class="section-label">PROPUESTAS <span>01—03</span></div><div id="route-list">${Object.values(manifest.routes).map((r,i)=>`<div class="route-card" style="--route:${r.color}"><button class="route-select" data-route="${r.id}" aria-pressed="false"><span class="route-number">0${i+1}</span><span><strong>Traza ${i+1}</strong><small>${esc(r.name)}</small></span><span class="route-arrow">↗</span></button><label class="visibility"><input type="checkbox" data-visible="${r.id}" checked> Ver en mapa</label></div>`).join('')}</div>
 <section class="study-selection"><div class="section-label">TRAMO EN ESTUDIO</div><p id="selection-name" class="selection-name">Todavía no elegiste un tramo.</p><p id="selection-detail" class="metric-note">Tocá una línea para ver el recorrido continuo. Usá inicio y fin para acotarlo.</p><button id="draw-range" class="button primary full">Marcar inicio y fin <span>⌖</span></button><div class="selection-actions"><button id="focus-study" class="button secondary" disabled>Acercar tramo</button><button id="whole-chain" class="button secondary" disabled>Completo</button><button id="cancel-range" class="button secondary" hidden>Cancelar</button></div><div class="metric-grid study-metrics"><div><strong id="study-length">—</strong><small>km seleccionados</small></div><div><strong id="study-area">—</strong><small>ha de corredor ±100 m</small></div></div><div id="open-analysis" class="analysis-buttons"><button data-analysis="long" disabled>↗ Perfil longitudinal</button><button data-analysis="cross" disabled>↗ Perfiles transversales</button><button data-analysis="parcels" disabled>↗ Parcelas y superficies</button></div></section>
 <section class="wfs-section"><div class="section-label">PARCELAS ALCANZADAS</div><p>Al acercarte al tramo, sus parcelas se consultan y resaltan automáticamente.</p><label class="auto-query"><input id="auto-parcels" type="checkbox" checked> Mostrar parcelas al acercar</label><button id="query-parcels" class="button secondary full" disabled>Actualizar parcelas visibles <span>↗</span></button><button id="cancel-parcels" class="button secondary full" hidden>Cancelar consulta</button><p id="parcel-status" role="status">Elegí un tramo y acercate para ver las parcelas.</p><div class="parcel-key"><span><i class="key-parcel"></i>Parcela alcanzada</span><span><i class="key-overlap"></i>Parte dentro del corredor</span></div></section><div class="side-footer"><strong>LAUGIS</strong><br><span>Análisis territorial · Proyecto personal</span></div></aside>
 <section class="map-area" aria-label="Mapa interactivo de trazas"><div id="map"></div><div class="map-top"><div class="map-title"><span class="live-dot"></span><strong id="map-selection-title">Elegí un tramo en el mapa</strong><small id="map-selection-hint">Tocá una línea para comenzar</small></div><div class="map-tools"><button id="fit" title="Ver propuestas visibles" aria-label="Ver propuestas visibles">⛶</button><button id="toggle-buffers" class="tool active" aria-pressed="true">±100 m</button><select id="basemap" aria-label="Mapa base"><option value="satellite">Satélite</option><option value="map">Mapa</option></select></div></div><div id="selection-guide" class="map-guide" role="status">Elegí una línea. Después podés abrir perfiles y parcelas.</div><div id="map-status" class="map-status" role="status" hidden></div><div class="map-legend"><span><i style="background:#e45b61"></i>Traza 1</span><span><i style="background:#ed9a35"></i>Traza 2</span><span><i style="background:#3985ef"></i>Traza 3</span></div>
 <div id="analysis-launcher" class="analysis-launcher" hidden><button data-analysis="long">Longitudinal</button><button data-analysis="cross">Transversales</button><button data-analysis="parcels">Parcelas</button></div>
 <section id="analysis-dock" class="analysis-dock" hidden aria-label="Análisis del tramo seleccionado"><div class="dock-heading"><div><span class="eyebrow">TRAMO SELECCIONADO</span><strong id="dock-title"></strong></div><button id="close-analysis" title="Cerrar panel" aria-label="Cerrar panel de análisis">×</button></div><div class="dock-tabs" role="tablist" aria-label="Análisis del tramo"><button role="tab" data-analysis="long" id="tab-long" aria-controls="panel-long">Perfil longitudinal</button><button role="tab" data-analysis="cross" id="tab-cross" aria-controls="panel-cross">Transversales</button><button role="tab" data-analysis="parcels" id="tab-parcels" aria-controls="panel-parcels">Parcelas</button></div>
 <section id="panel-long" class="dock-body" role="tabpanel" aria-labelledby="tab-long"><div class="panel-toolbar"><p>Recorré el perfil con el mouse o el dedo: el punto se marca sobre la imagen satelital.</p><div><label>Paso <select id="profile-step"><option value="1000">1.000 m</option><option value="250">250 m</option><option value="100">100 m</option></select></label><button id="load-profile" class="button primary">Consultar perfil</button><button id="cancel-profile" class="button secondary" hidden>Cancelar</button></div></div><div id="profile-chart" class="chart-empty"><span class="chart-icon">⌁</span><p>Elegí un tramo para ver su relieve.</p></div><div id="profile-stats" class="profile-stats"></div></section>
 <section id="panel-cross" class="dock-body" role="tabpanel" aria-labelledby="tab-cross" hidden><div class="panel-toolbar"><p>Elegí dónde cortar el tramo. Al recorrer el perfil se marca el punto sobre la sección del mapa.</p><button id="pick-cross" class="button secondary">Elegir sección en mapa</button></div><div class="cross-controls"><label for="cross-at">Posición sobre el tramo <output id="cross-label">50 %</output></label><input id="cross-at" type="range" min="0" max="1000" value="500"><button id="load-cross" class="button primary">Consultar sección</button></div><div id="cross-chart" class="chart-empty"><p>Sección perpendicular al eje · izquierda (−) / derecha (+).</p></div><div id="cross-stats" class="profile-stats"></div></section>
 <section id="panel-parcels" class="dock-body" role="tabpanel" aria-labelledby="tab-parcels" hidden><div class="parcel-dash"><div><strong id="dash-count">—</strong><span>parcelas detectadas</span></div><div><strong id="dash-overlap">—</strong><span>ha dentro de parcelas</span></div><div><strong id="dash-corridor">—</strong><span>ha del corredor elegido</span></div></div><div class="parcel-toolbar"><input id="parcel-search" type="search" placeholder="Buscar nomenclatura catastral" aria-label="Buscar nomenclatura catastral"><button id="panel-query-parcels" class="button secondary">Actualizar consulta</button></div><p id="dashboard-scope" class="metric-note">La consulta corresponde al área visible. Las zonas sin cobertura confirmada no se interpretan como libres de afectación.</p><div id="parcel-table" class="empty-table">Acercate al tramo para mostrar sus parcelas.</div></section></section></section>
 <section id="compare-view" class="content-view" hidden><div class="view-intro"><div class="eyebrow">PROPUESTAS FERROVIARIAS</div><h1>Comparar los recorridos.</h1><p>Las propuestas tienen extremos diferentes. Las longitudes y superficies describen sus ejes disponibles; la evaluación parcelaria se realiza sobre el tramo que elijas en el mapa.</p></div><div id="compare-table"></div></section>
 <section id="about-view" class="content-view" hidden><div class="view-intro"><div class="eyebrow">LAUGIS · TREN MINERO</div><h1>Una mirada territorial.</h1><p>Proyecto personal de Ing. Agrim. LAUTARO DARIO MARTINEZ para explorar propuestas ferroviarias, su relación con las parcelas y el relieve.</p></div><div class="method-grid"><article><h2>Corredor de estudio</h2><p>Se considera una franja de 100 m a cada lado del eje. La selección sobre el mapa permite acotar qué parte del recorrido se consulta.</p><p>La superficie del corredor es una referencia de estudio; no equivale a una expropiación ni a una superficie de obra definida.</p></article><article><h2>Lectura del relieve</h2><p>Los perfiles representan la superficie del terreno obtenida de Copernicus GLO-30, con resolución aproximada de 30 m. La pendiente del terreno no es una rasante ferroviaria de diseño.</p><p>Un muestreo más frecuente no aumenta el detalle del modelo. Los sectores sin elevación disponible se muestran como interrupciones.</p><a href="https://registry.opendata.aws/copernicus-dem/" target="_blank" rel="noopener">Fuente de elevación y condiciones de uso ↗</a></article></div></section></main><div id="toast" class="toast" role="status" hidden></div>`;
}
function initMap(){
 map=L.map('map',{zoomControl:false,preferCanvas:false}).setView([-35.3,-68.5],7);L.control.zoom({position:'bottomright'}).addTo(map);
 const base=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'});
 const satellite=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Tiles © Esri · Sources: Esri, Maxar, Earthstar Geographics'}).addTo(map);
 let failures=0;[base,satellite].forEach(layer=>layer.on('tileerror',()=>{if(++failures>=3){$('#map-status').hidden=false;$('#map-status').textContent='El mapa base no responde. Podés cambiarlo a Mapa.';}}));
 $('#basemap').onchange=e=>{map.removeLayer(base);map.removeLayer(satellite);(e.target.value==='map'?base:satellite).addTo(map);failures=0;$('#map-status').hidden=true;};
 for(const [pane,z] of [['corridors',340],['parcel-outlines',360],['parcel-overlaps',370],['study',440]]){map.createPane(pane);map.getPane(pane).style.zIndex=z;}
 for(const r of Object.values(manifest.routes)){
  globalBuffers[r.id]=L.geoJSON(corridors.features.filter(f=>f.properties.route_id===r.id),{pane:'corridors',interactive:false,style:{color:r.color,weight:0,fillOpacity:.12}}).addTo(map);
  lineLayers[r.id]=L.featureGroup().addTo(map);
  for(const f of chains.filter(c=>c.properties.route_id===r.id)){
   const latlngs=f.geometry.coordinates.map(reverse);
   L.polyline(latlngs,{color:r.color,weight:4,opacity:.95,interactive:false}).addTo(lineLayers[r.id]);
   L.polyline(latlngs,{color:r.color,weight:22,opacity:0}).bindTooltip('Tocá para elegir este recorrido',{sticky:true}).on('click',e=>handleRouteClick(f,e.latlng)).addTo(lineLayers[r.id]);
  }
 }
 L.geoJSON(stationData,{pointToLayer:(_,ll)=>L.circleMarker(ll,{radius:3.5,color:'#fff',weight:1.5,fillColor:'#375449',fillOpacity:1}),onEachFeature:(f,l)=>l.bindTooltip(esc(f.properties.name))}).addTo(map);
 map.on('moveend',scheduleParcelQuery);fitAll();
 if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>positionMapControls()).observe($('#analysis-dock'));
}
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,5500);}
function setView(view){
 $$('.nav').forEach(b=>b.classList.toggle('active',b.dataset.view===view));$('.map-area').hidden=view!=='explore';$('#sidebar').hidden=view!=='explore';$('#compare-view').hidden=view!=='compare';$('#about-view').hidden=view!=='about';$('.workspace').classList.toggle('wide',view!=='explore');
 if(view==='explore')setTimeout(()=>map.invalidateSize(),0);if(view==='compare')renderComparison();
}
function fitAll(){const points=chains.filter(f=>visible.has(f.properties.route_id)).flatMap(f=>f.geometry.coordinates).map(reverse);if(points.length)map.fitBounds(L.latLngBounds(points),{padding:[35,55]});}
function focusStudy(){if(!selected)return;const dock=panelOpen?$('#analysis-dock').getBoundingClientRect().height:0;map.fitBounds(L.latLngBounds(selected.geometry.coordinates.map(reverse)),{paddingTopLeft:[35,100],paddingBottomRight:[45,dock+35],maxZoom:16});}
function syncLayers(){
 for(const id of Object.keys(lineLayers)){if(visible.has(id)){lineLayers[id].addTo(map);if($('#toggle-buffers').getAttribute('aria-pressed')==='true')globalBuffers[id].addTo(map);}else{map.removeLayer(lineLayers[id]);map.removeLayer(globalBuffers[id]);}}
}
function handleRouteClick(chain,latlng){
 const hit=nearestOnLine(chain.geometry.coordinates,[latlng.lng,latlng.lat]);if(!hit)return;
 if(pickCrossMode&&selected){const p=nearestOnLine(selected.geometry.coordinates,[latlng.lng,latlng.lat]);if(chain.properties.chain_id!==selectedChain.properties.chain_id){toast('Elegí la sección sobre el tramo resaltado.');return;}if(p.offset_m>120){toast('Tocá sobre el tramo resaltado para ubicar la sección.');return;}pickCrossMode=false;crossFraction=p.chainage_m/selected.properties.length_m;$('#cross-at').value=Math.round(crossFraction*1000);updateCrossLabel();guide();openPanel('cross',false);loadCross();return;}
 if(selectionMode){
  if(!pendingStart){pendingStart={chain,hit};$('#whole-chain').disabled=false;drawEndpoints([hit.coord],true);$('#selection-guide').textContent='Inicio marcado. Tocá el final sobre el mismo recorrido continuo.';return;}
  if(pendingStart.chain.properties.chain_id!==chain.properties.chain_id){toast('Los dos puntos deben estar sobre el mismo recorrido continuo; no se conectan huecos.');return;}
  const a=Math.min(pendingStart.hit.chainage_m,hit.chainage_m),b=Math.max(pendingStart.hit.chainage_m,hit.chainage_m);
  if(b-a<20){toast('Separá un poco los puntos para elegir un tramo de al menos 20 m.');return;}
  const coords=sliceLineBetween(chain.geometry.coordinates,a,b);selectionMode=false;pendingStart=null;
  chooseStudy(chain,coords,{from:a,to:b,custom:true});return;
 }
 chooseStudy(chain,chain.geometry.coordinates,{from:0,to:chain.properties.length_m,custom:false});
}
function chooseStudy(chain,coords,{from,to,custom}){
 cancelRequests();revision++;selectionMode=false;pendingStart=null;pickCrossMode=false;selectedChain=chain;active=chain.properties.route_id;studyBuffer=null;parcelData=null;parcelOutlines=null;focusedNC=null;lastQueryKey='';profile=[];crossProfile=[];crossFraction=.5;
 const length=coords.slice(1).reduce((s,c,i)=>s+distance(coords[i],c),0);
 selected={type:'Feature',properties:{route_id:active,segment_id:`${chain.properties.chain_id}:${Math.round(from)}-${Math.round(to)}`,chain_id:chain.properties.chain_id,name:custom?`Traza ${active.slice(1)} · km ${num(from/1000)} a ${num(to/1000)}`:`Traza ${active.slice(1)} · recorrido continuo`,length_m:length,length_km:length/1000,from_m:from,to_m:to,custom},geometry:{type:'LineString',coordinates:coords}};
 removeLayer(highlight);removeLayer(bufferHighlight);clearParcelLayers();clearCursors();
 const color=routeInfo(active).color,latlngs=coords.map(reverse);
 highlight=L.featureGroup([L.polyline(latlngs,{pane:'study',color:'#fff',weight:11,opacity:.95,interactive:false}),L.polyline(latlngs,{pane:'study',color,weight:6,opacity:1,interactive:false})]).addTo(map);
 drawEndpoints([coords[0],coords.at(-1)]);$('#cross-at').value=500;updateCrossLabel();$('#profile-chart').className='chart-empty';$('#profile-chart').innerHTML='<span class="chart-icon">⌁</span><p>Consultá el perfil del tramo resaltado.</p>';$('#cross-chart').className='chart-empty';$('#cross-chart').textContent='Elegí una sección del tramo resaltado.';$('#profile-stats').textContent='';$('#cross-stats').textContent='';$('#parcel-status').textContent='Preparando el corredor del tramo elegido…';
 updateSelectionUI();guide();openPanel(panel,true);buildBuffer();if(custom)requestAnimationFrame(focusStudy);
 $('#sidebar').classList.remove('mobile-open');$('#mobile-panel').setAttribute('aria-expanded','false');
}
function removeLayer(layer){if(layer&&map.hasLayer(layer))map.removeLayer(layer);}
function drawEndpoints(coords,pending=false){removeLayer(endpointMarkers);endpointMarkers=L.featureGroup(coords.map((p,i)=>L.circleMarker(reverse(p),{pane:'study',radius:7,color:'#fff',weight:3,fillColor:pending?'#e4a233':routeInfo(active).color,fillOpacity:1}).bindTooltip(i?'Fin':'Inicio',{permanent:true,direction:'top',className:'endpoint-label'}))).addTo(map);}
function clearCursors(){removeLayer(longMarker);longMarker=null;removeLayer(crossMarker);crossMarker=null;removeLayer(crossLine);crossLine=null;}
function clearParcelLayers(){removeLayer(parcelOutlineLayer);parcelOutlineLayer=null;removeLayer(parcelOverlapLayer);parcelOverlapLayer=null;removeLayer(parcelFocusLayer);parcelFocusLayer=null;}
function cancelRequests(){
 longController?.abort();longController=null;crossController?.abort();crossController=null;cancelParcelQuery(false);bufferWorker?.terminate();bufferWorker=null;clearTimeout(autoTimer);clearTimeout(events.crossTimer);
 $('#load-profile').disabled=false;$('#load-profile').textContent='Consultar perfil';$('#cancel-profile').hidden=true;$('#load-cross').disabled=false;$('#load-cross').textContent='Consultar sección';
}
function guide(){
 $('#draw-range').classList.toggle('drawing',selectionMode);$('#cancel-range').hidden=!selectionMode;
 $('#selection-guide').textContent=selectionMode?'Tocá el punto de inicio sobre una traza. Podés mover y acercar el mapa.':pickCrossMode?'Tocá un punto del tramo resaltado para ubicar la sección transversal.':selected?'Tramo resaltado: abrí un análisis o marcá un nuevo inicio y fin.':'Elegí una línea. Después podés abrir perfiles y parcelas.';
 map.getContainer().classList.toggle('picking',selectionMode||pickCrossMode);
}
function updateSelectionUI(){
 const yes=!!selected;$$('[data-analysis]').forEach(b=>b.disabled=!yes);$('#whole-chain').disabled=!yes&&!pendingStart;$('#focus-study').disabled=!yes;$('#query-parcels').disabled=!studyBuffer;
 $$('.route-card').forEach(c=>{const b=c.querySelector('[data-route]');c.classList.toggle('selected',yes&&b.dataset.route===active);b.setAttribute('aria-pressed',yes&&b.dataset.route===active);});
 $('#selection-name').textContent=yes?selected.properties.name:'Todavía no elegiste un tramo.';$('#selection-detail').textContent=yes?`${num(selected.properties.length_km)} km entre los puntos Inicio y Fin. La línea resaltada es la que se analiza.`:'Tocá una línea para ver el recorrido continuo. Usá inicio y fin para acotarlo.';
 $('#study-length').textContent=yes?num(selected.properties.length_km):'—';$('#study-area').textContent=studyBuffer?num(studyBuffer.properties.area_ha):'—';$('#map-selection-title').textContent=yes?selected.properties.name:'Elegí un tramo en el mapa';$('#map-selection-hint').textContent=yes?`${num(selected.properties.length_km)} km · corredor de ±100 m`:'Tocá una línea para comenzar';$('#dock-title').textContent=yes?selected.properties.name:'';$('#analysis-launcher').hidden=!yes||panelOpen;renderParcelDashboard();
}
function openPanel(name,load=true){
 if(!selected)return;panel=name;panelOpen=true;$('#analysis-dock').hidden=false;$('#analysis-launcher').hidden=true;
 for(const id of ['long','cross','parcels']){$('#panel-'+id).hidden=id!==name;const b=$('#tab-'+id);b.classList.toggle('active',id===name);b.setAttribute('aria-selected',id===name);}
 requestAnimationFrame(positionMapControls);
 if(load&&name==='long'&&!profile.length)loadProfile();
 if(load&&name==='cross'&&!crossProfile.length)loadCross();
 if(name==='parcels'){renderParcelDashboard();scheduleParcelQuery();}
}
function closePanel(){panelOpen=false;$('#analysis-dock').hidden=true;$('#analysis-launcher').hidden=!selected;positionMapControls();}
function positionMapControls(){const height=panelOpen?$('#analysis-dock').getBoundingClientRect().height+28:24;$('.map-legend').style.bottom=height+'px';$('.leaflet-bottom.leaflet-right').style.bottom=(panelOpen?height:0)+'px';}
function buildBuffer(){
 const current=revision,worker=new Worker(new URL('./study-worker.js',import.meta.url),{type:'module'});bufferWorker=worker;
 const finish=()=>{worker.terminate();if(bufferWorker===worker)bufferWorker=null;};
 worker.onmessage=e=>{if(current!==revision||bufferWorker!==worker)return;if(e.data.type==='buffer'){studyBuffer=e.data.buffer;finish();removeLayer(bufferHighlight);bufferHighlight=L.geoJSON(studyBuffer,{pane:'corridors',interactive:false,style:{color:routeInfo(active).color,weight:1,fillOpacity:.18}}).addTo(map);$('#parcel-status').textContent='Acercate al tramo para ver las parcelas alcanzadas.';updateSelectionUI();scheduleParcelQuery();}else if(e.data.type==='error'){finish();$('#parcel-status').textContent='No se pudo preparar el corredor del tramo.';toast(e.data.message);}};
 worker.onerror=()=>{if(current!==revision||bufferWorker!==worker){worker.terminate();return;}finish();$('#parcel-status').textContent='No se pudo preparar el corredor del tramo.';toast('No pudo prepararse el corredor. Elegí un tramo más corto y reintentá.');};worker.postMessage({type:'buffer',feature:selected,revision:current});
}
function plot(points,target,{cross=false,onPoint}){
 const el=$(target),valid=points.filter(p=>Number.isFinite(p.z));el.className='linked-chart';
 if(!valid.length){el.textContent='No hay elevaciones disponibles para esta sección.';return;}
 const w=960,h=156,pad={l:58,r:20,t:18,b:27},first=points[0].distance,last=points.at(-1).distance;
 let low=Math.min(...valid.map(p=>p.z)),high=Math.max(...valid.map(p=>p.z));if(high-low<2){low-=1;high+=1;}
 const x=d=>pad.l+(d-first)/(last-first||1)*(w-pad.l-pad.r),y=z=>h-pad.b-(z-low)/(high-low)*(h-pad.t-pad.b);
 let path='',pen=false;for(const p of points){if(!Number.isFinite(p.z)){pen=false;continue;}path+=`${pen?'L':'M'}${x(p.distance)},${y(p.z)} `;pen=true;}
 el.innerHTML=`<svg viewBox="0 0 ${w} ${h}" tabindex="0" role="img" aria-label="${cross?'Perfil transversal':'Perfil longitudinal'}. Usá flechas para recorrer los puntos.">${[0,.5,1].map(t=>{const z=low+(high-low)*t;return `<line x1="${pad.l}" x2="${w-pad.r}" y1="${y(z)}" y2="${y(z)}" stroke="#e0e8dc"/><text x="${pad.l-7}" y="${y(z)+4}" text-anchor="end">${num(z,0)} m</text>`;}).join('')}<path d="${path}" fill="none" stroke="${routeInfo(active).color}" stroke-width="2.5"/>${[0,.25,.5,.75,1].map(t=>{const d=first+t*(last-first);return `<text x="${x(d)}" y="${h-5}" text-anchor="middle">${num(cross?d:d/1000)} ${cross?'m':'km'}</text>`;}).join('')}<line class="profile-cursor" y1="10" y2="${h-pad.b}" stroke="#2c4b38" stroke-dasharray="3 3" visibility="hidden"/><circle class="profile-dot" r="4" fill="${routeInfo(active).color}" stroke="#fff" stroke-width="2" visibility="hidden"/></svg><output class="chart-readout"></output><input class="chart-scrubber" type="range" min="0" max="${points.length-1}" value="0" aria-label="Recorrer puntos del perfil">`;
 const svg=el.querySelector('svg'),scrubber=el.querySelector('input');let currentIndex=0;
 const show=i=>{currentIndex=Math.max(0,Math.min(points.length-1,i));const p=points[currentIndex],cursor=el.querySelector('.profile-cursor'),dot=el.querySelector('.profile-dot');cursor.setAttribute('x1',x(p.distance));cursor.setAttribute('x2',x(p.distance));cursor.setAttribute('visibility','visible');dot.setAttribute('cx',x(p.distance));dot.setAttribute('cy',Number.isFinite(p.z)?y(p.z):h-pad.b);dot.setAttribute('visibility',Number.isFinite(p.z)?'visible':'hidden');el.querySelector('output').textContent=`${num(cross?p.distance:p.distance/1000)} ${cross?'m':'km'} · ${Number.isFinite(p.z)?num(p.z)+' m':'Sin cota'}`;scrubber.value=currentIndex;scrubber.setAttribute('aria-valuetext',el.querySelector('output').textContent);onPoint(p);};
 const move=e=>{const matrix=svg.getScreenCTM();if(!matrix)return;const point=svg.createSVGPoint();point.x=e.clientX;point.y=e.clientY;const sx=point.matrixTransform(matrix.inverse()).x,d=first+Math.max(0,Math.min(1,(sx-pad.l)/(w-pad.l-pad.r)))*(last-first);let index=0;for(let i=1;i<points.length;i++)if(Math.abs(points[i].distance-d)<Math.abs(points[index].distance-d))index=i;show(index);};
 svg.onpointerdown=e=>{svg.setPointerCapture?.(e.pointerId);move(e);};svg.onpointermove=e=>{if(e.pointerType!=='touch'||e.buttons||svg.hasPointerCapture?.(e.pointerId))move(e);};
 svg.onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();show(e.key==='Home'?0:e.key==='End'?points.length-1:currentIndex+(e.key==='ArrowRight'?1:-1));}};scrubber.oninput=e=>show(Number(e.target.value));
}
function markProfilePoint(point,cross=false){
 const ll=reverse(point.xy),options={pane:'study',radius:7,color:'#fff',weight:3,fillColor:cross?'#e8b33d':routeInfo(active).color,fillOpacity:1};
 let marker=cross?crossMarker:longMarker;
 if(!marker||!map.hasLayer(marker)){marker=L.circleMarker(ll,options).addTo(map);if(cross)crossMarker=marker;else longMarker=marker;}else marker.setLatLng(ll);
 const projected=map.latLngToContainerPoint(ll),size=map.getSize(),bottom=panelOpen?$('#analysis-dock').getBoundingClientRect().height+30:20;
 if(projected.x<30||projected.x>size.x-30||projected.y<90||projected.y>size.y-bottom){const desired=L.point(size.x/2,(size.y-bottom+90)/2),offset=projected.subtract(desired);map.panBy(offset,{animate:false});}
}
async function loadProfile(){
 if(!selected)return;longController?.abort();const controller=new AbortController();longController=controller;
 const current=revision,feature=selected,step=Number($('#profile-step').value),key=`${feature.properties.chain_id}:${feature.properties.from_m}:${feature.properties.to_m}:${step}`;$('#load-profile').disabled=true;$('#cancel-profile').hidden=false;
 try{
  const cached=profileCache.get(key);let result=cached;
  if(!result){const{elevations}=await import('./elevation.js');result=await elevations(stations(feature.geometry.coordinates,step),(done,total)=>{if(current===revision&&longController===controller)$('#load-profile').textContent=`Cargando ${Math.round(done/total*100)} %`;},controller.signal);}
  if(controller.signal.aborted||current!==revision||longController!==controller)return;
  profile=result;if(profileCache.size>8)profileCache.delete(profileCache.keys().next().value);profileCache.set(key,result);
  plot(profile,'#profile-chart',{onPoint:p=>markProfilePoint(p)});
  const zs=profile.filter(p=>Number.isFinite(p.z)).map(p=>p.z),grades=profile.slice(1).map((p,i)=>slope(profile[i],p)).filter(Number.isFinite);
  $('#profile-stats').textContent=`${num(feature.properties.length_km)} km de tramo · Mín. ${num(zs.length?Math.min(...zs):null)} m · Máx. ${num(zs.length?Math.max(...zs):null)} m · |Pendiente| máx. entre muestras ${grades.length?num(Math.max(...grades.map(Math.abs)))+' ‰':'sin dato'} · ${zs.length}/${profile.length} cotas · paso ${num(step,0)} m`;
 }catch(error){if(error.name!=='AbortError'&&current===revision){$('#profile-stats').textContent='La consulta no se completó. Podés reintentar.';toast(error.message);}}
 finally{if(longController===controller){longController=null;$('#load-profile').disabled=false;$('#load-profile').textContent='Consultar perfil';$('#cancel-profile').hidden=true;}}
}
function updateCrossLabel(){if(selected)$('#cross-label').textContent=`km ${num(selected.properties.length_km*crossFraction)} del tramo`;}
async function loadCross(){
 if(!selected)return;crossController?.abort();const controller=new AbortController();crossController=controller;
 const current=revision,feature=selected,at=feature.properties.length_m*crossFraction;$('#load-cross').disabled=true;$('#load-cross').textContent='Consultando…';crossProfile=[];$('#cross-chart').className='chart-empty';$('#cross-chart').textContent='Consultando el relieve de esta sección…';$('#cross-stats').textContent='';
 const section=transverse(feature.geometry.coordinates,at,100,25);removeLayer(crossLine);removeLayer(crossMarker);crossMarker=null;
 crossLine=L.featureGroup([L.polyline(section.map(p=>reverse(p.xy)),{pane:'study',color:'#fff',weight:8,interactive:false}),L.polyline(section.map(p=>reverse(p.xy)),{pane:'study',color:'#e0ab32',weight:3,dashArray:'5 4',interactive:false})]).addTo(map);
 markProfilePoint(section[4],true);
 try{const{elevations}=await import('./elevation.js');const result=await elevations(section,()=>{},controller.signal);if(controller.signal.aborted||current!==revision||crossController!==controller)return;crossProfile=result;plot(result,'#cross-chart',{cross:true,onPoint:p=>markProfilePoint(p,true)});$('#cross-stats').textContent=`Sección en km ${num(at/1000)} del tramo · 100 m a izquierda y derecha · ${result.filter(p=>Number.isFinite(p.z)).length}/${result.length} cotas · resolución del modelo ~30 m`;}
 catch(error){if(error.name!=='AbortError'&&current===revision)toast(error.message);}
 finally{if(crossController===controller){crossController=null;$('#load-cross').disabled=false;$('#load-cross').textContent='Consultar sección';}}
}
function scheduleParcelQuery(){
 clearTimeout(autoTimer);if(!selected||!studyBuffer||!$('#auto-parcels').checked||$('.map-area').hidden||map.getZoom()<11)return;
 autoTimer=setTimeout(()=>queryParcels({automatic:true}),900);
}
function cancelParcelQuery(notify=true){parcelController?.abort();parcelController=null;parcelWorker?.terminate();parcelWorker=null;if($('#cancel-parcels'))$('#cancel-parcels').hidden=true;if($('#query-parcels'))$('#query-parcels').disabled=!studyBuffer;if(notify&&$('#parcel-status'))$('#parcel-status').textContent='Consulta cancelada. Los resultados anteriores se conservan.';}
async function queryParcels({automatic=false}={}){
 if(!selected||!studyBuffer){if(!automatic)toast('Primero elegí un tramo y esperá que se prepare su corredor.');return;}
 const b=map.getBounds(),bbox=[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()];
 if((bbox[2]-bbox[0])*(bbox[3]-bbox[1])>.18||map.getZoom()<10){if(!automatic)toast('Acercá el mapa al tramo para consultar sus parcelas.');return;}
 const key=`${revision}:${bbox.map(v=>v.toFixed(5)).join(',')}`;if(automatic&&key===lastQueryKey)return;
 cancelParcelQuery(false);const controller=new AbortController();parcelController=controller;const current=revision,buffer=studyBuffer;$('#query-parcels').disabled=true;$('#cancel-parcels').hidden=false;$('#parcel-status').textContent='Consultando parcelas del área visible…';
 try{
  const{queryWfs,ALLOWED_WFS_LAYERS}=await import('./wfs-client.mjs');
  const candidates=await queryWfs({layers:ALLOWED_WFS_LAYERS,bbox,signal:controller.signal,onProgress:p=>{if(current===revision&&parcelController===controller)$('#parcel-status').textContent=`Consultando parcelas… ${num(p.allReceived,0)} candidatas`;}});
  if(controller.signal.aborted||current!==revision)return;$('#parcel-status').textContent='Calculando qué parcelas alcanza el corredor…';
  const result=await new Promise((resolve,reject)=>{const worker=new Worker(new URL('./study-worker.js',import.meta.url),{type:'module'});parcelWorker=worker;worker.onmessage=e=>{if(controller.signal.aborted||current!==revision)return;if(e.data.type==='progress')$('#parcel-status').textContent=`Analizando ${num(e.data.done,0)}/${num(e.data.total,0)} parcelas`;if(e.data.type==='parcel'){worker.terminate();if(parcelWorker===worker)parcelWorker=null;resolve(e.data.result);}if(e.data.type==='error'){worker.terminate();if(parcelWorker===worker)parcelWorker=null;reject(Error(e.data.message));}};worker.onerror=()=>{worker.terminate();if(parcelWorker===worker)parcelWorker=null;reject(Error('El análisis parcelario no pudo completarse. Acotá el área y reintentá.'));};controller.signal.addEventListener('abort',()=>{worker.terminate();reject(new DOMException('Consulta cancelada','AbortError'));},{once:true});worker.postMessage({type:'parcel',candidates,buffer,revision:current});});
  if(controller.signal.aborted||current!==revision||parcelController!==controller)return;
  parcelData=validateParcelData(result);parcelOutlines=result.parcel_outlines;lastQueryKey=key;focusedNC=null;
  drawParcels();renderParcelDashboard();$('#parcel-status').textContent=`${num(new Set(result.features.map(f=>f.properties.nc)).size,0)} NC alcanzadas en las geometrías consultadas. Área visible; cobertura total sin confirmar.${result.metadata.warnings?.length?' Hay geometrías pendientes de revisar.':''}`;
 }catch(error){if(error.name!=='AbortError'&&current===revision&&parcelController===controller){$('#parcel-status').textContent=`Consulta incompleta. ${error.message} Se conservan los resultados anteriores.`;if(!automatic)toast(error.message);}}
 finally{if(parcelController===controller){parcelController=null;$('#query-parcels').disabled=!studyBuffer;$('#cancel-parcels').hidden=true;}}
}
function drawParcels(){
 clearParcelLayers();if(!parcelData)return;
 const onEach=(f,layer)=>{layer.bindTooltip(`NC ${esc(f.properties.nc)} · límite parcelario de la fuente`,{sticky:true});layer.on('click',()=>focusParcel(f.properties.nc,false));};
 if(parcelOutlines)parcelOutlineLayer=L.geoJSON(parcelOutlines,{pane:'parcel-outlines',style:{color:'#ffd35a',weight:2.5,opacity:1,fillColor:'#ffce46',fillOpacity:.13},onEachFeature:onEach}).addTo(map);
 parcelOverlapLayer=L.geoJSON(parcelData,{pane:'parcel-overlaps',style:{color:'#213f2b',weight:1.5,fillColor:'#b7ed62',fillOpacity:.72},onEachFeature:onEach}).addTo(map);
}
function renderParcelDashboard(){
 if(!$('#dash-count'))return;const stats=selected?routeSummary(parcelData,active):null;
 $('#dash-count').textContent=stats?.count!=null?num(stats.count,0):parcelData?'Sin resultados':'—';$('#dash-overlap').textContent=stats?.areaHa!=null?num(stats.areaHa,2):'—';$('#dash-corridor').textContent=studyBuffer?num(studyBuffer.properties.area_ha,2):'—';
 const known=parcelData?.features.length;$('#dashboard-scope').textContent=known?`Resultados del tramo y el área consultada · ${new Date(parcelData.metadata.fetched_at).toLocaleString('es-AR')}. La geometría disponible y la cobertura no certifican el estado parcelario completo.`:'La consulta corresponde al área visible. Las zonas sin cobertura confirmada no se interpretan como libres de afectación.';
 renderParcelTable();
}
function renderParcelTable(){
 if(!parcelData){$('#parcel-table').className='empty-table';$('#parcel-table').textContent='Acercate al tramo para mostrar sus parcelas.';return;}
 const search=$('#parcel-search').value.trim(),features=parcelData.features.filter(f=>f.properties.nc.includes(search));$('#parcel-table').className='table-scroll parcel-results';
 $('#parcel-table').innerHTML=`<table><thead><tr><th>NC</th><th>Dentro del corredor</th><th>% geometría disponible</th></tr></thead><tbody>${features.slice(0,150).map(f=>`<tr data-parcel="${esc(f.properties.nc)}" tabindex="0" class="${focusedNC===f.properties.nc?'focused':''}"><td>${esc(f.properties.nc)}</td><td>${num(f.properties.affected_m2,0)} m²</td><td>${num(f.properties.affected_pct)} %</td></tr>`).join('')}</tbody></table><p class="metric-note">${num(features.length,0)} resultados de la consulta. Se muestran hasta 150 filas.</p>`;
 $$('[data-parcel]').forEach(row=>{row.onclick=()=>focusParcel(row.dataset.parcel,true);row.onkeydown=e=>{if(e.key==='Enter')focusParcel(row.dataset.parcel,true);};});
}
function focusParcel(nc,zoom){
 focusedNC=nc;const features=(parcelOutlines?.features||parcelData?.features||[]).filter(f=>f.properties.nc===nc);removeLayer(parcelFocusLayer);
 parcelFocusLayer=L.geoJSON({type:'FeatureCollection',features},{pane:'study',interactive:false,style:{color:'#fff',weight:5,fillColor:'#ffd35a',fillOpacity:.16}}).addTo(map);openPanel('parcels',false);renderParcelTable();
 if(zoom&&features.length){const dock=$('#analysis-dock').getBoundingClientRect().height;map.fitBounds(parcelFocusLayer.getBounds(),{paddingTopLeft:[35,90],paddingBottomRight:[35,dock+35],maxZoom:17});}
 const row=$$('[data-parcel]').find(r=>r.dataset.parcel===nc);row?.scrollIntoView({block:'nearest',behavior:'smooth'});
}
function renderComparison(){
 $('#compare-table').innerHTML=`<div class="table-scroll"><table><thead><tr><th>Propuesta</th><th>Eje disponible</th><th>Corredor ±100 m</th><th>Alcance</th></tr></thead><tbody>${Object.values(manifest.routes).map((r,i)=>`<tr><td><span class="route-dot" style="background:${r.color}"></span><strong>Traza ${i+1}</strong><small>${esc(r.name)}</small></td><td>${num(r.length_km)} km</td><td>${num(r.corridor_ha,0)} ha</td><td>${r.id==='T2'?'Recorrido aproximado':'Geometría de referencia'}</td></tr>`).join('')}</tbody></table></div><p class="metric-note">La comparación muestra los ejes disponibles. Los recorridos no tienen los mismos extremos y no se asigna un orden de viabilidad.</p>`;
}
function events(){
 $$('.nav').forEach(b=>b.onclick=()=>setView(b.dataset.view));$('.brand').onclick=e=>{e.preventDefault();setView('explore');fitAll();};
 $$('[data-route]').forEach(b=>b.onclick=()=>{const id=b.dataset.route;if(!visible.has(id)){visible.add(id);$(`[data-visible="${id}"]`).checked=true;syncLayers();}map.fitBounds(lineLayers[id].getBounds(),{padding:[45,70]});$('#selection-guide').textContent='Elegí inicio y fin sobre la línea, o tocá un recorrido para seleccionarlo.';});
 $$('[data-visible]').forEach(b=>b.onchange=()=>{b.checked?visible.add(b.dataset.visible):visible.delete(b.dataset.visible);syncLayers();});
 $('#fit').onclick=fitAll;$('#toggle-buffers').onclick=e=>{const on=e.currentTarget.getAttribute('aria-pressed')!=='true';e.currentTarget.setAttribute('aria-pressed',on);e.currentTarget.classList.toggle('active',on);Object.values(globalBuffers).forEach(removeLayer);syncLayers();};
 $('#mobile-panel').onclick=()=>{const open=$('#sidebar').classList.toggle('mobile-open');$('#mobile-panel').setAttribute('aria-expanded',open);};
 $('#draw-range').onclick=()=>{selectionMode=true;pickCrossMode=false;pendingStart=null;removeLayer(endpointMarkers);closePanel();guide();};
 $('#cancel-range').onclick=()=>{selectionMode=false;pendingStart=null;if(selected)drawEndpoints([selected.geometry.coordinates[0],selected.geometry.coordinates.at(-1)]);else removeLayer(endpointMarkers);guide();};
 $('#focus-study').onclick=focusStudy;$('#whole-chain').onclick=()=>{const chain=pendingStart?.chain||selectedChain;if(chain){selectionMode=false;pendingStart=null;chooseStudy(chain,chain.geometry.coordinates,{from:0,to:chain.properties.length_m,custom:false});}};
 $$('[data-analysis]').forEach(b=>b.onclick=()=>openPanel(b.dataset.analysis));$('#close-analysis').onclick=closePanel;
 $('#load-profile').onclick=loadProfile;$('#profile-step').onchange=()=>{if(selected&&panel==='long')loadProfile();};$('#cancel-profile').onclick=()=>{longController?.abort();longController=null;$('#load-profile').disabled=false;$('#load-profile').textContent='Consultar perfil';$('#cancel-profile').hidden=true;};
 $('#load-cross').onclick=loadCross;$('#pick-cross').onclick=()=>{pickCrossMode=true;selectionMode=false;guide();};
 $('#cross-at').oninput=e=>{crossFraction=Number(e.target.value)/1000;updateCrossLabel();clearTimeout(events.crossTimer);events.crossTimer=setTimeout(loadCross,300);};
 $('#query-parcels').onclick=()=>queryParcels();$('#panel-query-parcels').onclick=()=>queryParcels();$('#cancel-parcels').onclick=()=>cancelParcelQuery();$('#auto-parcels').onchange=scheduleParcelQuery;$('#parcel-search').oninput=renderParcelTable;
}
init().catch(error=>{$('#app').innerHTML=`<main class="fatal"><h1>No pudimos cargar el explorador</h1><p>${esc(error.message)}</p><button onclick="location.reload()">Reintentar</button></main>`;});
