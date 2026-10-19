import {distance,stations,transverse} from './geo.mjs';
import {nearestOnLine} from './selection.mjs';

const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
function checkedCoordinates(coords){
  if(!Array.isArray(coords)||coords.length<2)throw TypeError('Cada parte requiere al menos dos coordenadas.');
  const clone=coords.map(p=>{
    // distance validates the WGS84 domain, including coordinate types.
    distance(p,p);
    return[p[0],p[1]];
  });
  let length=0;
  for(let i=1;i<clone.length;i++)length+=distance(clone[i-1],clone[i]);
  if(length<=0)throw RangeError('Cada parte debe tener longitud útil.');
  return{coords:clone,length};
}

/** All ordered source chains remain independent MultiLineString parts. */
export function createRouteStudy(chains,routeId){
  const input=Array.isArray(chains)?chains:chains?.features;
  if(!Array.isArray(input))throw TypeError('Se requiere una lista de cadenas.');
  const selected=input.filter(f=>f.properties?.route_id===routeId);
  if(!selected.length)throw RangeError('No existen cadenas para la alternativa elegida.');
  const coordinates=[],ids=[],sources=[];let total=0;
  for(const chain of selected){
    if(chain.geometry?.type!=='LineString'||!chain.properties?.chain_id)throw TypeError('Cada cadena debe ser LineString y conservar chain_id.');
    if(ids.includes(chain.properties.chain_id))throw TypeError('Los identificadores de las partes deben ser únicos.');
    const {coords,length}=checkedCoordinates(chain.geometry.coordinates);
    coordinates.push(coords);ids.push(chain.properties.chain_id);total+=length;
    for(const id of chain.properties.source_segment_ids||[])if(!sources.includes(id))sources.push(id);
  }
  return{type:'Feature',properties:{route_id:routeId,whole_route:true,segment_id:`route:${routeId}`,name:`Traza ${String(routeId).replace(/^T/,'')} · alternativa completa`,length_m:total,length_km:total/1000,part_chain_ids:ids,source_segment_ids:sources},geometry:{type:'MultiLineString',coordinates}};
}

/** Each returned from_m is a cumulative study offset; no gap is counted. */
export function studyParts(feature){
  const type=feature?.geometry?.type;
  if(feature?.type!=='Feature'||!['LineString','MultiLineString'].includes(type))throw TypeError('El estudio requiere LineString o MultiLineString.');
  const raw=type==='LineString'?[feature.geometry.coordinates]:feature.geometry.coordinates;
  if(!Array.isArray(raw)||!raw.length)throw TypeError('El estudio no contiene partes.');
  let from=0;
  const used=new Set();
  return raw.map((coords,index)=>{
    const checked=checkedCoordinates(coords);
    const id=feature.properties?.part_chain_ids?.[index]??feature.properties?.chain_id??`${feature.properties?.segment_id??'study'}:part:${index+1}`;
    if(used.has(id))throw TypeError('Los identificadores de las partes deben ser únicos.');
    used.add(id);
    const result={type:'Feature',properties:{...feature.properties,chain_id:id,part_id:id,part_index:index,length_m:checked.length,length_km:checked.length/1000,from_m:from},geometry:{type:'LineString',coordinates:checked.coords}};
    from+=checked.length;
    return result;
  });
}

/** End/start stations on either side of a gap may have equal distance. */
export function studyStations(feature,step=1000){
  if(!Number.isFinite(step)||step<=0)throw RangeError('Paso de muestreo inválido.');
  const parts=studyParts(feature);
  const total=parts.reduce((sum,p)=>sum+p.properties.length_m,0);
  if(total/step>100000)throw RangeError('Demasiadas muestras para el paso elegido.');
  return parts.flatMap((part,index)=>stations(part.geometry.coordinates,step).map((point,i)=>({xy:[...point.xy],distance:part.properties.from_m+point.distance,part_id:part.properties.part_id,break_before:index>0&&i===0})));
}

/** A boundary defaults to the next part (except total). partId preserves the
 * side selected by a click when two disjoint endpoints share one chainage.
 */
export function sectionAt(feature,at,width=100,step=25,{partId}={}){
  if(!Number.isFinite(at))throw TypeError('La progresiva debe ser finita.');
  const parts=studyParts(feature),last=parts.at(-1),total=last.properties.from_m+last.properties.length_m;
  const position=clamp(at,0,total);
  let chosen;
  if(partId!==undefined&&partId!==null){
    chosen=parts.find(p=>p.properties.part_id===partId);
    if(!chosen)throw RangeError('La parte seleccionada no pertenece al estudio.');
    const {from_m,length_m}=chosen.properties;
    if(position<from_m-1e-6||position>from_m+length_m+1e-6)throw RangeError('La progresiva no pertenece a la parte seleccionada.');
  }else chosen=parts.find(p=>position<p.properties.from_m+p.properties.length_m)||last;
  return transverse(chosen.geometry.coordinates,clamp(position-chosen.properties.from_m,0,chosen.properties.length_m),width,step).map(p=>({...p,part_id:chosen.properties.part_id}));
}

/** Snap to one existing part; cumulative chainage excludes all source gaps. */
export function snapStudy(feature,point){
  const parts=studyParts(feature);
  let best=null;
  for(const part of parts){
    const hit=nearestOnLine(part.geometry.coordinates,point);
    if(hit&&(!best||hit.offset_m<best.offset_m)){
      const chainage=part.properties.from_m+hit.chainage_m;
      best={...hit,distance_m:chainage,chainage_m:chainage,local_chainage_m:hit.chainage_m,part_id:part.properties.part_id,part_index:part.properties.part_index};
    }
  }
  return best;
}
