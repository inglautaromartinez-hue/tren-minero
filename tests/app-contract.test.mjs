import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transverse, distance} from '../src/geo.mjs';
import {validateParcelData,routeSummary} from '../src/parcel-data.mjs';

const fixture=()=>({type:'FeatureCollection',metadata:{source_date:'2026-10-19'},features:[{
  type:'Feature',properties:{nc:'001234',route_id:'T1',owner:'Titular de prueba',affected_m2:100,affected_pct:10},
  geometry:{type:'Polygon',coordinates:[[[-68,-35],[-67.99,-35],[-67.99,-34.99],[-68,-35]]]}
}]});

test('parcelario local: conserva NC de texto y rechaza campos o geometrías incompatibles',()=>{
  const data=fixture();assert.equal(validateParcelData(data).features[0].properties.nc,'001234');
  for(const change of [
    f=>f.features[0].properties.nc=1234,
    f=>f.features[0].properties.nc=' 001234 ',
    f=>f.features[0].properties.affected_m2=NaN,
    f=>f.features[0].properties.affected_pct=101,
    f=>f.features[0].properties.owner={name:'dato no textual'},
    f=>f.features[0].type='GeometryCollection',
    f=>f.features[0].geometry.coordinates=[],
    f=>f.features[0].geometry.coordinates[0].pop(),
    f=>f.features[0].geometry.coordinates[0][1]=[350000,6100000],
    f=>f.features[0].geometry.coordinates[0][1]=[-68,NaN],
    f=>f.crs={type:'name',properties:{name:'EPSG:32719'}},
    f=>f.features.push(structuredClone(f.features[0])),
  ]){const invalid=fixture();change(invalid);assert.throws(()=>validateParcelData(invalid));}
});

test('resumen parcelario: rutas sin evaluar mantienen null, incluso al cargar otra ruta',()=>{
  const data=validateParcelData(fixture());
  assert.equal(routeSummary(null,'T1').count,null);
  assert.equal(routeSummary(data,'T2').count,null);
  assert.equal(routeSummary(data,'T2').areaHa,null);
  assert.equal(routeSummary(data,'T1').count,1);
  assert.equal(routeSummary(data,'T1').areaHa,.01);
  assert.equal(routeSummary(data,'T1').coverage,'partial');
  data.features=[];data.metadata.routes={T1:{evaluated:true,coverage_status:'unknown'}};
  assert.equal(routeSummary(data,'T1').count,null);
  data.metadata.routes.T1.coverage_status='complete';
  assert.equal(routeSummary(data,'T1').count,0);
  assert.equal(routeSummary(data,'T1').areaHa,0);
});

// Offline unit tests. The TIFF reader is an explicit synthetic double: these
// checks do NOT verify Copernicus availability, CORS, real rasters or a browser.
let serial=0;
async function mockElevation({value=123,nodata=-32767,onRead=()=>{},onOpen=()=>{}}={}){
  const reads=[];
  const image={getOrigin:()=>[-69,-34],getResolution:()=>[.01,-.01],
    getWidth:()=>100,getHeight:()=>100,getGDALNoData:()=>nodata,
    readRasters:async options=>{reads.push(options);await onRead();const [x0,y0,x1,y1]=options.window;return new Float32Array((x1-x0)*(y1-y0)).fill(value);}};
  const key=`__offlineCOG${++serial}`;
  globalThis[key]=async(url,options)=>{onOpen(url,options);return {getImage:async()=>image};};
  const source=readFileSync(new URL('../src/elevation.js',import.meta.url),'utf8')
    .replace(/import\s*\{\s*fromUrl\s*\}\s*from\s*['"]geotiff['"];?/,`const fromUrl=globalThis[${JSON.stringify(key)}];`);
  const module=await import(`data:text/javascript;base64,${Buffer.from(source+`\n// isolated ${serial}`).toString('base64')}`);
  delete globalThis[key];
  return {...module,reads};
}

test('transversal: izquierda negativa y derecha positiva según sentido del eje',()=>{
  for(const coords of [[[-68,-35],[-68,-34.99]],[[-68,-34.99],[-68,-35]]]){
    const section=transverse(coords,400,100,25),center=section[4];
    assert.ok(Math.abs(distance(section[0].xy,section.at(-1).xy)-200)<.1);
    const north=coords[1][1]>coords[0][1];
    assert.ok(north?section.at(-1).xy[0]>center.xy[0]:section.at(-1).xy[0]<center.xy[0],'+100 m debe estar a la derecha del avance');
  }
});

test('COG offline: lectura acotada, caché de bloque y elevación cero válida',async()=>{
  let opened=0;
  const {elevations,reads}=await mockElevation({value:0,onOpen:(url,options)=>{
    opened++;assert.match(url,/Copernicus_DSM_COG_10_S35_00_W069_00_DEM/);
    assert.equal(options.allowFullFile,false);
  }});
  const points=[{xy:[-68.5,-34.5],distance:0},{xy:[-68.49,-34.5],distance:100}];
  const progress=[];
  const result=await elevations(points,(done,total)=>progress.push([done,total]));
  assert.deepEqual(result.map(p=>p.z),[0,0]);assert.equal(opened,1);assert.equal(reads.length,1);
  const [x0,y0,x1,y1]=reads[0].window;assert.ok(x1-x0<=64&&y1-y0<=64);
  assert.deepEqual(progress.at(-1),[2,2]);
});

test('COG offline: NoData o falta de cobertura no se convierten a cota cero',async()=>{
  const missing=await mockElevation({value:-32767});
  await assert.rejects(missing.elevations([{xy:[-68.5,-34.5],distance:0}]),/No se pudieron obtener elevaciones/);
  const outside=await mockElevation();
  await assert.rejects(outside.elevations([{xy:[-68.5,-33],distance:0}]),/No se pudieron obtener elevaciones/);
  assert.equal(outside.reads.length,0);
});

test('COG offline: cancelar durante última muestra descarta resultado y progreso tardío',async()=>{
  const controller=new AbortController(),progress=[];
  const {elevations}=await mockElevation({onRead:()=>controller.abort()});
  await assert.rejects(elevations([{xy:[-68.5,-34.5],distance:0}],n=>progress.push(n),controller.signal),{name:'AbortError'});
  assert.equal(progress.length,0);
});

test('COG offline: cancelación previa no abre recursos remotos',async()=>{
  let opens=0;const controller=new AbortController();controller.abort();
  const {elevations}=await mockElevation({onOpen:()=>opens++});
  await assert.rejects(elevations([{xy:[-68.5,-34.5],distance:0}],()=>{},controller.signal),{name:'AbortError'});
  assert.equal(opens,0);
});

test('COG offline: rama web utiliza pasarela local acotada, sin afirmar integración browser',async()=>{
  const hadWindow=Object.hasOwn(globalThis,'window'),previous=globalThis.window;
  globalThis.window={};let opened='';
  try{
    const {elevations}=await mockElevation({onOpen:url=>opened=url});
    await elevations([{xy:[-68.5,-34.5],distance:0}]);
    assert.equal(opened,'/api/dem?tile=Copernicus_DSM_COG_10_S35_00_W069_00_DEM');
  }finally{if(hadWindow)globalThis.window=previous;else delete globalThis.window;}
});
