/** Real Copernicus cross sections every 100 m; restart per continuous chain. */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {buildRouteChains} from '../src/selection.mjs';
import {buildCrossSections,crossSectionPoints,summarizeCrossSections,CROSS_SECTION_OFFSETS} from '../src/cross-sections.mjs';
import {elevations} from '../src/elevation.js';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const IDS=['T1','T2','T3'],round=(n,d=3)=>Number(n.toFixed(d));
const digest=data=>createHash('sha256').update(data).digest('hex');
const atomic=async(file,data)=>{await writeFile(file+'.tmp',data);await rename(file+'.tmp',file);};
const compact=s=>({...s,chainage_m:round(s.chainage_m),route_distance_m:round(s.route_distance_m),xy:s.xy.map(v=>round(v,8)),z:s.z.map(z=>Number.isFinite(z)?round(z):null)});
export async function run(){
 const args=process.argv.slice(2),batchAt=args.indexOf('--batch-sections');
 const batchSize=batchAt<0?48:Number(args[batchAt+1]);
 if(!Number.isInteger(batchSize)||batchSize<1||batchSize>56)throw Error('Usar --batch-sections entre 1 y 56 (≤504 puntos).');
 const raw=await readFile(path.join(ROOT,'public/data/routes.geojson'));
 const reader=await readFile(path.join(ROOT,'src/elevation.js'));
 const helperPaths=['src/geo.mjs','src/selection.mjs','src/route-study.mjs','src/cross-sections.mjs'];
 const helpers=await Promise.all(helperPaths.map(file=>readFile(path.join(ROOT,file))));
 const helperHashes=Object.fromEntries(helperPaths.map((file,i)=>[file,digest(helpers[i])]));
 const legacyFingerprint=digest(Buffer.concat([raw,reader,Buffer.from('cross100m_offsets25m_v1')]));
 const chains=buildRouteChains(JSON.parse(raw)),fingerprint=digest(Buffer.concat([raw,reader,...helpers,Buffer.from('cross100m_offsets25m_v2')]));
 const privateDir=path.join(ROOT,'data/private/cross-sections');await mkdir(privateDir,{recursive:true});
 const checkpoint=path.join(privateDir,'checkpoint.json');
 const started=Date.now(),catalogs=Object.fromEntries(IDS.map(id=>[id,buildCrossSections(chains,id)]));
 let previous=null,errors=[];
 let migratedLegacy=false;
 if(args.includes('--resume'))try{
  previous=JSON.parse(await readFile(checkpoint,'utf8'));
  if(previous.fingerprint!==fingerprint){
   if(args.includes('--accept-legacy-checkpoint')&&previous.fingerprint===legacyFingerprint)migratedLegacy=true;
   else throw Error('Geometría/lector/helpers incompatibles con checkpoint.');
  }
 }catch(error){if(error.code!=='ENOENT')throw error;}
 let reused=0;
 if(previous)for(const id of IDS){
  const old=new Map(previous.routes[id].map(s=>[s.id,s]));
  for(const section of catalogs[id]){const saved=old.get(section.id);if(saved&&saved.part_id===section.part_id&&Math.abs(saved.chainage_m-section.chainage_m)<.001&&section.xy.every((v,i)=>Math.abs(v-saved.xy[i])<1e-8)){section.z=saved.z;section.status=saved.status;section.attempts=saved.attempts??(saved.status==='pending'?0:1);if(saved.missing_reason)section.missing_reason=saved.missing_reason;else if(saved.status!=='pending'&&saved.z.some(z=>z===null))section.missing_reason='nodata_or_read_failure';if(saved.status!=='pending')reused++;}}
 }
 if(previous?.errors)errors=[...previous.errors];
 const jobs=IDS.flatMap(id=>catalogs[id].filter(s=>s.status!=='complete'&&(s.attempts??0)<3).map(section=>({id,section})));
 let processed=0;
 const summarize=()=>Object.fromEntries(IDS.map(id=>[id,{url:`/data/cross-sections-${id}.json`,...summarizeCrossSections(catalogs[id])}]));
 const save=async()=>{
  const routes=summarize();
  await atomic(checkpoint,JSON.stringify({fingerprint,source_hash:digest(raw),reader_hash:digest(reader),helper_hashes:helperHashes,migrated_legacy:migratedLegacy,generated_at:previous?.generated_at??new Date(started).toISOString(),routes:catalogs,errors}));
  for(const id of IDS)await atomic(path.join(ROOT,`public/data/cross-sections-${id}.json`),JSON.stringify({schema_version:1,route_id:id,spacing_m:100,offsets:CROSS_SECTION_OFFSETS,model:'Copernicus GLO-30',status:routes[id].status,elevation_status:routes[id].elevation_status,sections:catalogs[id].map(compact)}));
  const index={schema_version:1,spacing_m:100,offsets:CROSS_SECTION_OFFSETS,model:'Copernicus GLO-30',generated_at:previous?.generated_at??new Date(started).toISOString(),updated_at:new Date().toISOString(),complete:IDS.every(id=>routes[id].all_processed),all_samples_valid:IDS.every(id=>routes[id].all_samples_valid),status:IDS.every(id=>routes[id].all_processed)?'complete':IDS.some(id=>routes[id].processed_sections)?'partial':'pending',routes};
  await atomic(path.join(ROOT,'public/data/indexcross-sections.json'),JSON.stringify(index));
  return index;
 };
 console.log(JSON.stringify({status:'started',sections:IDS.reduce((n,id)=>n+catalogs[id].length,0),jobs:jobs.length,reused,batch_points:batchSize*9,routes:summarize()}));
 await save();
 for(let start=0;start<jobs.length;start+=batchSize){
  const batch=jobs.slice(start,start+batchSize);
  for(let attempt=0;attempt<3;attempt++){
   const active=batch.filter(job=>job.section.status!=='complete'&&(job.section.attempts??0)<3);
   if(!active.length)break;
   const points=active.flatMap(job=>crossSectionPoints(job.section,chains));
   for(const job of active)job.section.attempts=(job.section.attempts??0)+1;
   try{
    const result=await elevations(points);
    active.forEach((job,i)=>{job.section.z=result.slice(i*9,i*9+9).map((p,j)=>Number.isFinite(p.z)?p.z:job.section.z[j]);job.section.status=job.section.z.every(Number.isFinite)?'complete':job.section.z.some(Number.isFinite)?'partial':'unavailable';if(job.section.status!=='complete')job.section.missing_reason='nodata_or_read_failure';else delete job.section.missing_reason;});
   }catch(error){errors.push({at:new Date().toISOString(),first:active[0].section.id,count:active.length,error:error.message});for(const job of active){job.section.status=job.section.z.some(Number.isFinite)?'partial':'unavailable';job.section.missing_reason='query_failure';}}
  }
  processed+=batch.length;
  const index=await save(),seconds=(Date.now()-started)/1000;
  console.log(JSON.stringify({status:'progress',processed,total:jobs.length,elapsed_s:round(seconds,1),estimated_remaining_s:round(seconds/processed*(jobs.length-processed),1),routes:index.routes}));
 }
 const index=await save();
 const doc=`# Revisión de transversales precalculados\n\nProyecto personal LAUGIS. Generación iniciada ${new Date(started).toISOString()}, finalizada ${new Date().toISOString()}.\n\nEstado **${index.status}**. Se calcularon ${IDS.reduce((n,id)=>n+catalogs[id].length,0)} secciones, cada 100 m por cadena continua y en ambos extremos. La progresiva local reinicia en cada cadena; la global acumula longitudes sin sumar huecos. Nueve cotas reales consultadas por sección a offsets −100, −75, −50, −25, 0, 25, 50, 75 y 100 m. Datos ausentes quedan null con estado explícito, sin interpolación de cotas ni relieve sintético.\n\nFuente: Copernicus GLO-30 DSM, COG público AWS https://copernicus-dem-30m.s3.amazonaws.com/. Mismo lector src/elevation.js, bloques compartidos de 64 píxeles y hasta cuatro workers; lotes de ${batchSize*9} puntos. Valores almacenados con tres decimales por formato, no por exactitud: el modelo tiene resolución nominal de 30 m y no representa una rasante ferroviaria ni relevamiento de campo. Orientación transversal perpendicular a la tangente geodésica local. Extremos y esquinas usan el segmento precedente, según el helper geodésico existente.\n\n| Traza | Secciones | Cotas válidas | Ausentes | Estado |\n|---|---:|---:|---:|---|\n${IDS.map(id=>{const r=index.routes[id];return`| ${id} | ${r.count} | ${r.valid_samples} | ${r.missing_samples} | ${r.status} |`;}).join('\n')}\n\nMetadatos de reproducción internos:\n- Geometría SHA-256: ${digest(raw)}\n- Lector SHA-256: ${digest(reader)}\n- Firma del checkpoint: ${fingerprint}\n- Reproducir: node scripts/prepare_cross_sections.mjs --resume\n- Checkpoints: data/private/cross-sections/checkpoint.json, no incluidos en la publicación.\n- Inicio de esta corrida: ${jobs.length} secciones pendientes/incompletas; ${reused} entradas de checkpoint compatibles.\n\n${errors.length?`${errors.length} incidencias registradas en checkpoint privado.`:'No se registraron incidencias de consulta en esta ejecución.'}\n\nLa verificación de geometría, distancias y formato se realiza en tests/cross-sections.test.mjs; la ausencia de huecos en el catálogo no demuestra continuidad ferroviaria operativa. Esta generación no certifica la precisión ni resuelve incertidumbre de los ejes originales.\n`;
 const trace=`\n## Completitud, faltantes y dependencias\n\nGeneración completa significa que todas las estaciones fueron consultadas/procesadas y ninguna queda pending. No exige inventar cotas si el raster devuelve NoData: all_samples_valid y elevation_status informan por separado la cobertura de elevación. Cada sección ausente conserva null, status, missing_reason y attempts. El lector compartido no permite distinguir NoData de fallos individuales de lectura: nodata_or_read_failure conserva esa ambigüedad; query_failure identifica un lote que lanzó excepción. Máximo tres intentos por sección, preservando las cotas reales ya obtenidas.\n\nPrimera generación compatible: ${index.generated_at}. Los archivos públicos contienen únicamente contrato de visualización; hashes y checkpoint son internos.\n\n${Object.entries(helperHashes).map(([file,hash])=>`- ${file} SHA-256: ${hash}`).join('\n')}\n\nLos hashes de todos los helpers intervienen en la firma y bloquean reusar un checkpoint si cambia la geometría o el código de muestreo. ${migratedLegacy?'Esta normalización migró explícitamente el checkpoint de la primera corrida v1 mediante --accept-legacy-checkpoint: mismas fuentes/lector y cotejo de ID, progresiva y centro antes de reutilizar cotas. No se recalcularon ni interpolaron las cotas.':'No se autorizó migración de una firma antigua en esta corrida.'}\n`;
 await writeFile(path.join(ROOT,'docs/REVISION_TRANSVERSALES.md'),doc+trace);
 console.log(JSON.stringify({status:index.status,finished:true,elapsed_s:round((Date.now()-started)/1000,1),routes:index.routes}));
 if(!index.complete)process.exitCode=2;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))run().catch(error=>{console.error(error.stack);process.exitCode=1;});
