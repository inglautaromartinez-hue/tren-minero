import geodesic from 'geographiclib-geodesic';
import {distance,stations} from './geo.mjs';
import {createRouteStudy,studyParts} from './route-study.mjs';

const geod=geodesic.Geodesic.WGS84;
export const CROSS_SECTION_OFFSETS=Object.freeze([-100,-75,-50,-25,0,25,50,75,100]);
const indexes=new WeakMap();
const finite=Number.isFinite;
function partsFor(chains,routeId){
  if(chains?.type==='Feature')return studyParts(chains);
  return studyParts(createRouteStudy(chains,routeId));
}
function geometryIndex(chains,routeId){
  if(!chains||typeof chains!=='object')throw TypeError('Se requieren las cadenas originales.');
  let cached=indexes.get(chains);if(!cached){cached=new Map();indexes.set(chains,cached);}
  if(cached.has(routeId))return cached.get(routeId);
  const map=new Map();
  for(const part of partsFor(chains,routeId)){
    let length=0;const edges=[];
    const coords=part.geometry.coordinates;
    for(let i=1;i<coords.length;i++){
      const inv=geod.Inverse(coords[i-1][1],coords[i-1][0],coords[i][1],coords[i][0]);
      if(inv.s12>0){edges.push({a:coords[i-1],from:length,length:inv.s12,azi:inv.azi1});length+=inv.s12;}
    }
    map.set(part.properties.part_id,{edges,length,part});
  }
  cached.set(routeId,map);return map;
}

/** Stations restart at zero on each source chain; global distance omits gaps.
 * Geometry is immutable while it is used by this module's WeakMap cache.
 */
export function buildCrossSections(chains,routeId,step=100){
  if(!finite(step)||step<=0)throw RangeError('Paso transversal inválido.');
  const parts=partsFor(chains,routeId);
  if(parts.reduce((n,p)=>n+p.properties.length_m,0)/step>100000)throw RangeError('Demasiadas secciones.');
  return parts.flatMap(part=>{
    const sampled=[];
    for(const point of stations(part.geometry.coordinates,step)){
      if(sampled.length&&point.distance-sampled.at(-1).distance<.001)sampled[sampled.length-1]=point;
      else sampled.push(point);
    }
    return sampled.map(point=>({
    id:`${part.properties.part_id}:xs:${Math.round(point.distance*1000)}`,
    route_id:routeId,part_id:part.properties.part_id,
    chainage_m:point.distance,route_distance_m:part.properties.from_m+point.distance,
    xy:[...point.xy],z:CROSS_SECTION_OFFSETS.map(()=>null),status:'pending'
    }));
  });
}

/** Nearest stored centre, optionally restricted to the chain selected on map.
 * Returns a copy with selection_offset_m; never mutates the loaded catalogue.
 */
export function nearestCrossSection(entries,point,{partId}={}){
  distance(point,point);
  if(!Array.isArray(entries))throw TypeError('Se requiere un catálogo de secciones.');
  let best=null,offset=Infinity;
  for(const entry of entries){
    if(partId!==undefined&&entry.part_id!==partId)continue;
    const d=distance(entry.xy,point);
    if(d<offset){best=entry;offset=d;}
  }
  return best?{...best,selection_offset_m:offset}:null;
}

/** Completion tracks attempted stations, independently of legitimate missing
 * elevations. The shared reader reports null for either NoData or a read error;
 * callers must preserve that ambiguity rather than claim a known cause.
 */
export function summarizeCrossSections(entries){
  const valid=entries.reduce((n,s)=>n+s.z.filter(Number.isFinite).length,0);
  const pending=entries.filter(s=>s.status==='pending').length;
  return{count:entries.length,valid_samples:valid,missing_samples:entries.length*9-valid,
    pending_sections:pending,processed_sections:entries.length-pending,
    all_processed:pending===0,all_samples_valid:valid===entries.length*9,
    status:pending===0?'complete':pending===entries.length?'pending':'partial',
    elevation_status:valid===entries.length*9?'complete':valid>0?'partial':'unavailable'};
}

/** Reconstruct nine horizontal sample positions; elevations are read only from
 * section.z. No terrain interpolation or network request occurs in this helper.
 */
export function crossSectionPoints(section,chains){
  if(!section||!finite(section.chainage_m)||!Array.isArray(section.z)||section.z.length!==9)throw TypeError('Sección transversal inválida.');
  if(section.z.some(z=>z!==null&&!finite(z)))throw TypeError('Cotas inválidas.');
  const chain=geometryIndex(chains,section.route_id).get(section.part_id);
  if(!chain)throw RangeError('La cadena de la sección no pertenece al estudio.');
  if(section.chainage_m<-.002||section.chainage_m>chain.length+.002)throw RangeError('Progresiva fuera de la cadena.');
  const at=Math.max(0,Math.min(chain.length,section.chainage_m));
  let lo=0,hi=chain.edges.length-1;
  while(lo<hi){const middle=(lo+hi)>>1;if(chain.edges[middle].from+chain.edges[middle].length>=at)hi=middle;else lo=middle+1;}
  const edge=chain.edges[lo],center=geod.Direct(edge.a[1],edge.a[0],edge.azi,at-edge.from);
  return CROSS_SECTION_OFFSETS.map((offset,index)=>{
    const p=geod.Direct(center.lat2,center.lon2,center.azi2+(offset<0?-90:90),Math.abs(offset));
    return{xy:[p.lon2,p.lat2],distance:offset,z:section.z[index],part_id:section.part_id};
  });
}
