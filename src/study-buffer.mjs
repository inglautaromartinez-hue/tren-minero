import clipping from 'polygon-clipping';
import geodesic from 'geographiclib-geodesic';
import {areaWGS84,intersectCandidates} from './parcel-intersection.mjs';

const WGS84=geodesic.Geodesic.WGS84;
const MAX_LENGTH_M=1000000;
const MAX_SOURCE_VERTICES=6000;
const MAX_EDGE_M=500;
const CAP_SIDES=64;
const UNION_BATCH=32;
const validPoint=p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&Math.abs(p[0])<=180&&Math.abs(p[1])<=85;
const inverse=(a,b)=>WGS84.Inverse(a[1],a[0],b[1],b[0]);
const direct=(point,azimuth,distance)=>{const result=WGS84.Direct(point[1],point[0],azimuth,distance);return[result.lon2,result.lat2];};
const multi=geometry=>geometry?.type==='Polygon'?[geometry.coordinates]:geometry?.type==='MultiPolygon'?geometry.coordinates:null;

function unionBatches(polygons){
  if(!polygons.length)throw Error('No se generaron superficies de corredor.');
  let work=polygons;
  while(work.length>1){const next=[];for(let i=0;i<work.length;i+=UNION_BATCH)next.push(clipping.union(...work.slice(i,i+UNION_BATCH)));work=next;}
  // A single initial polygon has Polygon shape; union normalizes MultiPolygon.
  return clipping.union(work[0]);
}

function circle(center,radius){
  const ring=[];
  for(let i=0;i<CAP_SIDES;i++)ring.push(direct(center,i*360/CAP_SIDES,radius));
  ring.push([...ring[0]]);
  return[ring];
}

/** Regional interactive screening buffer, not a replacement for the canonical
 * GIS corridor. All metric offsets/interpolations use the WGS84 ellipsoid;
 * longitude/latitude polygon edges and 64-sided caps remain approximations.
 * Limits deliberately reject huge input before an expensive clipping union.
 */
export function buildStudyBuffer(feature,radius=100){
  if(feature?.type==='Feature'&&feature.geometry?.type==='MultiLineString'){
    const lines=feature.geometry.coordinates;
    if(!Array.isArray(lines)||!lines.length||lines.some(line=>!Array.isArray(line)))throw TypeError('La traza requiere partes no vacías.');
    if(lines.reduce((sum,line)=>sum+line.length,0)>MAX_SOURCE_VERTICES)throw RangeError('La traza supera el límite de vértices del análisis interactivo.');
    const buffers=lines.map(coordinates=>buildStudyBuffer({type:'Feature',properties:feature.properties,geometry:{type:'LineString',coordinates}},radius));
    const total=buffers.reduce((sum,b)=>sum+b.properties.length_m,0);
    if(total>MAX_LENGTH_M)throw RangeError('Seleccione una traza de hasta 1000 km para el análisis interactivo.');
    const coordinates=unionBatches(buffers.map(b=>b.geometry.coordinates));
    return{type:'Feature',properties:{...buffers[0].properties,length_m:total,area_ha:areaWGS84(coordinates)/10000,part_count:buffers.length,source_vertex_count:buffers.reduce((sum,b)=>sum+b.properties.source_vertex_count,0),strip_count:buffers.reduce((sum,b)=>sum+b.properties.strip_count,0)},geometry:{type:'MultiPolygon',coordinates}};
  }
  if(feature?.type!=='Feature'||feature.geometry?.type!=='LineString')throw TypeError('Seleccione un tramo LineString válido para generar el corredor.');
  if(!['T1','T2','T3'].includes(feature.properties?.route_id))throw TypeError('El tramo debe pertenecer a T1, T2 o T3.');
  if(!Number.isFinite(radius)||radius<=0||radius>1000)throw RangeError('El radio del corredor debe ser mayor a 0 y hasta 1000 m.');
  const input=feature.geometry.coordinates;
  if(!Array.isArray(input)||input.length<2||input.some(point=>!validPoint(point)))throw TypeError('El tramo requiere coordenadas WGS84 finitas, sin polos.');
  if(input.length>MAX_SOURCE_VERTICES)throw RangeError(`El tramo supera ${MAX_SOURCE_VERTICES} vértices: seleccione un recorrido menor para el análisis interactivo.`);
  const coords=[];
  for(const point of input){
    if(coords.length&&Math.abs(point[0]-coords.at(-1)[0])>180)throw RangeError('El análisis regional no admite cruces del antimeridiano.');
    if(!coords.length||inverse(coords.at(-1),point).s12>1e-7)coords.push([point[0],point[1]]);
  }
  if(coords.length<2)throw RangeError('El tramo seleccionado tiene longitud cero.');
  const edges=[];let total=0;
  for(let i=1;i<coords.length;i++){
    const edge=inverse(coords[i-1],coords[i]);
    if(!Number.isFinite(edge.s12)||edge.s12<=0)throw RangeError('El tramo contiene una arista degenerada.');
    total+=edge.s12;
    if(total>MAX_LENGTH_M)throw RangeError('Seleccione un tramo de hasta 1000 km para el análisis interactivo.');
    edges.push({a:coords[i-1],b:coords[i],...edge});
  }
  const polygons=[];let stripCount=0;
  for(const edge of edges){
    const count=Math.max(1,Math.ceil(edge.s12/MAX_EDGE_M));
    let previous=null;
    for(let i=0;i<=count;i++){
      const at=i===0?null:WGS84.Direct(edge.a[1],edge.a[0],edge.azi1,edge.s12*i/count);
      const point=i===0?edge.a:i===count?edge.b:[at.lon2,at.lat2];
      const azimuth=i===0?edge.azi1:i===count?edge.azi2:at.azi2;
      const pair={left:direct(point,azimuth-90,radius),right:direct(point,azimuth+90,radius)};
      if(previous){polygons.push([[previous.left,pair.left,pair.right,previous.right,previous.left]]);stripCount++;}
      previous=pair;
    }
  }
  // Circles only at original vertices/endpoints. Dense subdivisions share
  // exactly the same normal-offset endpoints and need no extra circles.
  for(const point of coords)polygons.push(circle(point,radius));
  const coordinates=unionBatches(polygons);
  const area=areaWGS84(coordinates);
  if(!coordinates.length||!Number.isFinite(area)||area<=0)throw Error('No se pudo construir un corredor de superficie positiva.');
  return{type:'Feature',properties:{
    route_id:feature.properties.route_id,buffer_m:radius,geodesic_nominal:true,
    approximation:'WGS84 ellipsoidal offsets; strips <=500 m; 64-sided round vertex/end caps; longitude/latitude topology union',
    analysis_geometry:'interactive_study_buffer_requires_canonical_GIS_review',
    area_ha:area/10000,length_m:total,source_vertex_count:coords.length,strip_count:stripCount,
    cap_sides:CAP_SIDES,max_strip_length_m:MAX_EDGE_M,
  },geometry:{type:'MultiPolygon',coordinates}};
}

/** Intersect only the selected buffer and return full outlines for affected
 * NCs, dissolved across candidate layers. Outlines contain no owner/CUIT or
 * other extra source attributes; the existing intersection contract is reused.
 */
export function intersectStudyCandidates(candidates,buffer,revision,onProgress=()=>{}){
  const corridor=buffer?.type==='FeatureCollection'?buffer:{type:'FeatureCollection',features:[buffer]};
  if(corridor.features?.length!==1||!multi(corridor.features[0]?.geometry))throw TypeError('Se requiere solamente el corredor del tramo seleccionado.');
  if(!Array.isArray(candidates?.features))throw TypeError('Se requieren candidatas parcelarias de la consulta pública.');
  if(candidates.features.some(f=>typeof f.properties?.nc!=='string'||!f.properties.nc.trim()))throw TypeError('Cada candidata debe conservar NC textual.');
  const result=intersectCandidates(candidates,corridor,onProgress);
  const affected=new Set(result.features.map(feature=>feature.properties.nc));
  const grouped=new Map();
  for(const feature of candidates.features){
    const nc=feature.properties.nc;
    if(!affected.has(nc))continue;
    const geometry=multi(feature.geometry);
    if(!geometry)throw TypeError('La parcela afectada tiene geometría no poligonal.');
    if(!grouped.has(nc))grouped.set(nc,{parts:[],layers:new Set()});
    const group=grouped.get(nc);group.parts.push(geometry);
    if(typeof feature.properties.source_layer==='string')group.layers.add(feature.properties.source_layer);
  }
  result.parcel_outlines={type:'FeatureCollection',features:[...grouped].map(([nc,group])=>({type:'Feature',properties:{nc,source_layers:[...group.layers].sort()},geometry:{type:'MultiPolygon',coordinates:unionBatches(group.parts)}}))};
  result.metadata={...result.metadata,study_scope:'selected_study_buffer',selected_revision:revision,
    selected_route_id:corridor.features[0].properties.route_id,buffer_m:corridor.features[0].properties.buffer_m??null,
    analysis_geometry:'selected_interactive_study_buffer_requires_canonical_GIS_review',
    query_scope:'public WFS candidates intersecting the selected study buffer; coverage not confirmed'};
  for(const entry of Object.values(result.metadata.routes))entry.query_scope=result.metadata.query_scope;
  return result;
}
