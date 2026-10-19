/** Precompute real baseline elevation profiles without bridging route gaps. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {buildRouteChains} from '../src/selection.mjs';
import {stations,transverse} from '../src/geo.mjs';
import {elevations} from '../src/elevation.js';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const IDS=['T1','T2','T3'];
const round=(n,digits)=>Number(Number(n).toFixed(digits));
const compact=point=>({...point,xy:point.xy.map(n=>round(n,8)),distance:round(point.distance,3),z:Number.isFinite(point.z)?round(point.z,3):null});

export function prepareOverviewPoints(routes,step=1000){
  const chains=buildRouteChains(routes),result={};
  for(const id of IDS){
    const parts=chains.filter(chain=>chain.properties.route_id===id);
    let accumulated=0;const profile=[],ranges=[];
    for(const [index,chain] of parts.entries()){
      const points=stations(chain.geometry.coordinates,step),length=points.at(-1)?.distance??0;
      ranges.push({chain,from:accumulated,length});
      profile.push(...points.map((point,i)=>({...point,distance:point.distance+accumulated,part_id:chain.properties.chain_id,z:null,...(index>0&&i===0?{break_before:true}:{})})));
      accumulated+=length;
    }
    const half=accumulated/2;
    const chosen=ranges.find(part=>part.from+part.length>half)||ranges.at(-1);
    const cross=chosen?transverse(chosen.chain.geometry.coordinates,half-chosen.from,100,25).map(point=>({...point,part_id:chosen.chain.properties.chain_id,z:null})):[];
    result[id]={profile,cross,length_m:round(accumulated,3),parts:parts.length,cross_chainage_m:round(half,3),cross_part_id:chosen?.chain.properties.chain_id??null,status:'pending',valid_samples:0,missing_samples:profile.length+cross.length};
  }
  return result;
}

async function run(){
  const args=process.argv.slice(2);const limitAt=args.indexOf('--timeout-ms');
  const budget=limitAt<0?420000:Number(args[limitAt+1]);
  if(!Number.isFinite(budget)||budget<1000)throw Error('--timeout-ms debe ser al menos 1000.');
  const source=await readFile(path.join(ROOT,'public/data/routes.geojson'));
  const started=Date.now(),deadline=started+budget;
  const output={schema_version:1,model:'Copernicus GLO-30',step_m:1000,generated_at:new Date(started).toISOString(),complete:false,status:'pending',routes:prepareOverviewPoints(JSON.parse(source))};
  const filename=path.join(ROOT,'public/data/overviews.json');
  let resumed=0;
  if(args.includes('--resume')){
    const previous=JSON.parse(await readFile(filename,'utf8'));
    const review=await readFile(path.join(ROOT,'docs/REVISION_OVERVIEWS.md'),'utf8');
    const sourceHash=createHash('sha256').update(source).digest('hex');
    if(!review.includes(`Geometría routes.geojson SHA-256: ${sourceHash}`)||previous.model!==output.model||previous.step_m!==1000)throw Error('No se puede reutilizar un perfil con geometría o modelo diferente.');
    for(const id of IDS)for(const kind of ['profile','cross']){
      const current=output.routes[id][kind],old=previous.routes?.[id]?.[kind];
      if(!Array.isArray(old)||old.length!==current.length)throw Error('La estructura de muestreo cambió; no se reutilizan cotas.');
      current.forEach((point,i)=>{
        const saved=old[i];
        if(saved.part_id!==point.part_id||Math.abs(saved.distance-point.distance)>0.001||point.xy.some((n,k)=>Math.abs(n-saved.xy[k])>1e-7))throw Error('Las posiciones de muestreo cambiaron; no se reutilizan cotas.');
        if(Number.isFinite(saved.z)){point.z=saved.z;resumed++;}
      });
    }
    output.resumed_samples=resumed;output.resumed_from=previous.generated_at;
  }
  const jobs=[];
  for(const id of IDS)for(const kind of ['profile','cross'])for(let index=0;index<output.routes[id][kind].length;index++)if(!Number.isFinite(output.routes[id][kind][index].z))jobs.push({id,kind,index,point:output.routes[id][kind][index]});
  console.log(JSON.stringify({status:'started',samples:jobs.length,routes:Object.fromEntries(IDS.map(id=>[id,{parts:output.routes[id].parts,length_km:output.routes[id].length_m/1000,samples:output.routes[id].profile.length+output.routes[id].cross.length}]))}));
  let processed=resumed,errors=[];
  const totalSamples=resumed+jobs.length;
  const summarize=()=>{
    for(const id of IDS){const route=output.routes[id],points=[...route.profile,...route.cross];route.valid_samples=points.filter(point=>Number.isFinite(point.z)).length;route.missing_samples=points.length-route.valid_samples;route.status=route.missing_samples===0?'complete':route.valid_samples>0?'partial':'unavailable';}
    output.complete=IDS.every(id=>output.routes[id].status==='complete');
    output.status=output.complete?'complete':IDS.some(id=>output.routes[id].valid_samples>0)?'partial':'unavailable';
    output.processed_samples=processed;output.total_samples=totalSamples;
  };
  const save=async()=>{summarize();await writeFile(filename,JSON.stringify(output));};
  await save();
  for(let start=0;start<jobs.length;start+=32){
    if(Date.now()>=deadline){errors.push('Presupuesto de tiempo agotado; muestras pendientes quedan null.');break;}
    const batch=jobs.slice(start,start+32),controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),Math.max(1,deadline-Date.now()));
    try{
      const result=await elevations(batch.map(job=>job.point),()=>{},controller.signal);
      for(let i=0;i<result.length;i++){const job=batch[i];output.routes[job.id][job.kind][job.index]=compact(result[i]);}
      processed+=batch.length;
    }catch(error){
      controller.abort();errors.push(`${error.name}: ${error.message}`);
      for(const job of batch)output.routes[job.id][job.kind][job.index]=compact(job.point);
      processed+=batch.length;
      if(error.name==='AbortError')break;
      if(!IDS.some(id=>output.routes[id].valid_samples>0)&&start===0)break;
    }finally{clearTimeout(timer);}
    await save();
    if(processed%128===0||processed===jobs.length)console.log(JSON.stringify({status:'progress',processed,total:jobs.length,elapsed_s:round((Date.now()-started)/1000,1)}));
  }
  for(const id of IDS)for(const kind of ['profile','cross'])output.routes[id][kind]=output.routes[id][kind].map(compact);
  output.finished_at=new Date().toISOString();
  await save();
  const digest=buffer=>createHash('sha256').update(buffer).digest('hex');
  const docs=`# Revisión de perfiles generales\n\nGenerados: ${output.generated_at}. Finalizados: ${output.finished_at}.\n\nEstado: **${output.status}**, ${processed}/${totalSamples} muestras procesadas (${resumed} cotas reales reutilizadas de la corrida previa compatible). Las cotas ausentes se conservan como null y no se interpolan.\n\nFuente: Copernicus GLO-30, espejo público AWS copernicus-dem-30m, COG GeoTIFF. Acceso mediante src/elevation.js desde Node (URL directa S3), lecturas parciales de bloques, concurrencia máxima 4 y cachés compartidas durante esta ejecución. El endpoint no fija una versión de distribución: la revisión del proveedor no se infiere. El hash identifica el código y la geometría de esta corrida, no los píxeles del dataset remoto. Las cotas representan superficie DSM y no una rasante ferroviaria.\n\n- Dataset: https://copernicus-dem-30m.s3.amazonaws.com/\n- Geometría routes.geojson SHA-256: ${digest(source)}\n- Lector elevation.js SHA-256: ${digest(await readFile(path.join(ROOT,'src/elevation.js')))}\n- Muestreo: 1000 m WGS84 por cadena continua; extremos incluidos. No se suman ni interpolan los huecos entre cadenas. part_id identifica cada cadena y break_before interrumpe el gráfico al comenzar otra.\n- Transversal inicial: 50% de la longitud acumulada de cada alternativa, localizado en su cadena real; ±100 m y paso 25 m.\n- Reproducir: node scripts/prepare_overviews.mjs --timeout-ms ${budget}\n\n| Alternativa | Partes | Longitud m | Cotas válidas | Ausentes | Estado |\n|---|---:|---:|---:|---:|---|\n${IDS.map(id=>{const r=output.routes[id];return`| ${id} | ${r.parts} | ${r.length_m} | ${r.valid_samples} | ${r.missing_samples} | ${r.status} |`;}).join('\n')}\n\n${errors.length?'Incidencias:\n'+errors.map(error=>'- '+error).join('\n'):'No se registraron errores de consulta en esta ejecución.'}\n`;
  await mkdir(path.join(ROOT,'docs'),{recursive:true});await writeFile(path.join(ROOT,'docs/REVISION_OVERVIEWS.md'),docs);
  console.log(JSON.stringify({status:output.status,processed,total:totalSamples,elapsed_s:round((Date.now()-started)/1000,1),routes:Object.fromEntries(IDS.map(id=>[id,{valid:output.routes[id].valid_samples,missing:output.routes[id].missing_samples,status:output.routes[id].status}]))}));
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))run().catch(error=>{console.error(error.message);process.exitCode=1;});
