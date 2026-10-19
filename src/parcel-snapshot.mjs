import clipping from 'polygon-clipping';
import {areaWGS84} from './parcel-intersection.mjs';

const ROUTES=['T1','T2','T3'];
function multi(geometry){
  if(geometry?.type==='Polygon')return[geometry.coordinates];
  if(geometry?.type==='MultiPolygon')return geometry.coordinates;
  throw TypeError('Se requiere una geometría Polygon o MultiPolygon.');
}
function checked(geometry){
  const polygons=multi(geometry);
  if(!Array.isArray(polygons)||!polygons.length)throw TypeError('Geometría poligonal vacía.');
  for(const polygon of polygons){
    if(!Array.isArray(polygon)||!polygon.length)throw TypeError('Polígono vacío.');
    for(const ring of polygon){
      if(!Array.isArray(ring)||ring.length<4)throw TypeError('Anillo no válido.');
      for(const p of ring)if(!Array.isArray(p)||!Number.isFinite(p[0])||!Number.isFinite(p[1])||Math.abs(p[0])>180||Math.abs(p[1])>90)throw TypeError('Coordenadas WGS84 inválidas.');
      if(ring[0][0]!==ring.at(-1)[0]||ring[0][1]!==ring.at(-1)[1])throw TypeError('El anillo debe estar cerrado.');
    }
  }
  return polygons;
}
const usefulArea=value=>typeof value==='number'&&Number.isFinite(value)&&value>0;
function bounds(polygons){
  const box=[Infinity,Infinity,-Infinity,-Infinity];
  for(const polygon of polygons)for(const ring of polygon)for(const p of ring){box[0]=Math.min(box[0],p[0]);box[1]=Math.min(box[1],p[1]);box[2]=Math.max(box[2],p[0]);box[3]=Math.max(box[3],p[1]);}
  return box;
}
const overlap=(a,b)=>a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];
function unionBatches(polygons){
  if(!polygons.length)return null;
  let work=polygons;
  while(work.length>1){const next=[];for(let i=0;i<work.length;i+=32)next.push(clipping.union(...work.slice(i,i+32)));work=next;}
  return work[0];
}

/** Reclip only sanitized support-corridor intersections, never treating their
 * area as original parcel area. Completeness of this numerical operation
 * requires the selected buffer to fit inside the source snapshot support.
 */
export function clipParcelSnapshot(snapshot,buffer,{routeId=buffer?.properties?.route_id,revision,onProgress=()=>{}}={}){
  if(snapshot?.type!=='FeatureCollection'||!Array.isArray(snapshot.features))throw TypeError('Se requiere un snapshot FeatureCollection.');
  if(!ROUTES.includes(routeId)||buffer?.type!=='Feature'||buffer.properties?.route_id!==routeId)throw TypeError('El corredor debe identificar la misma alternativa que el recorte.');
  const corridor=checked(buffer.geometry),corridorBounds=bounds(corridor),groups=new Map(),warnings=[];
  const warn=(nc,message)=>warnings.push({nc,message});
  const sourceInfo=snapshot.metadata?.routes?.[routeId];
  const support=sourceInfo?.support_geometry??snapshot.metadata?.support_geometry;
  const queryPlanComplete=sourceInfo?.query_plan_complete===true||snapshot.metadata?.query_plan_complete===true;
  let uncovered=null;
  if(support){
    try{
      const difference=clipping.difference(corridor,checked(support));
      uncovered=difference.length?areaWGS84(difference):0;
      if(!Number.isFinite(uncovered))throw Error('Área de soporte no finita.');
    }catch(error){warn(null,`No se pudo comprobar el soporte del snapshot: ${error.message}`);}
  }
  const supportVerified=uncovered!==null&&uncovered<0.01;
  if(!supportVerified)warn(null,uncovered===null?'Soporte geométrico del snapshot desconocido.':'El corredor seleccionado sale del soporte consultado; el resultado es parcial.');
  if(!queryPlanComplete)warn(null,'No consta la finalización del plan de consultas de la fuente.');
  for(const feature of snapshot.features){
    const p=feature.properties;
    if(p?.route_id!==routeId)continue;
    if(typeof p.nc!=='string'||!p.nc.trim()||p.nc!==p.nc.trim())throw TypeError('Cada parcela del snapshot debe conservar NC como texto sin espacios periféricos.');
    if(!groups.has(p.nc))groups.set(p.nc,{parts:[],areas:[],missingArea:false,layers:new Set(),padron:typeof p.padron==='string'?p.padron:'',department:typeof p.department==='string'?p.department:''});
    const group=groups.get(p.nc);
    try{const part=checked(feature.geometry);if(overlap(bounds(part),corridorBounds))group.parts.push(part);}
    catch(error){group.invalid=true;warn(p.nc,error.message);}
    if(usefulArea(p.parcel_m2))group.areas.push(p.parcel_m2);else group.missingArea=true;
    for(const layer of Array.isArray(p.source_layers)?p.source_layers:[])if(typeof layer==='string')group.layers.add(layer);
  }
  const features=[],affectedParts=[];let processed=0;
  for(const [nc,group] of groups){
    try{
      // Invalid components cannot silently become a supposedly complete NC.
      if(group.invalid)throw Error('NC omitida por componentes de geometría inválida.');
      if(!group.parts.length)continue;
      const originalIntersection=unionBatches(group.parts);
      const intersection=clipping.intersection(originalIntersection,corridor);
      if(!intersection.length)continue;
      const affected=areaWGS84(intersection);
      if(!Number.isFinite(affected)||affected<=0.01)continue;
      let parcelArea=group.areas[0]??null;
      if(parcelArea!==null&&group.areas.some(value=>Math.abs(value-parcelArea)>Math.max(0.01,parcelArea*1e-6))){parcelArea=null;warn(nc,'Superficies originales incompatibles entre componentes del snapshot; porcentaje desconocido.');}
      if(parcelArea===null)warn(nc,'No se conoce una superficie original parcelaria válida; el porcentaje permanece desconocido.');
      else if(group.missingArea)warn(nc,'Un componente carece de superficie original; se conserva el valor original disponible para la misma NC.');
      if(parcelArea!==null&&affected>parcelArea*1.00001){parcelArea=null;warn(nc,'El área recortada excede la superficie original informada; porcentaje desconocido.');}
      features.push({type:'Feature',properties:{nc,route_id:routeId,parcel_m2:parcelArea,denominator_scope:'geometry_available',affected_m2:affected,affected_pct:parcelArea===null?null:Math.min(100,affected/parcelArea*100),padron:group.padron,department:group.department,source_layers:[...group.layers].sort(),source_date:'unknown',owner:'',owner_status:'not_exposed_by_public_wfs'},geometry:{type:'MultiPolygon',coordinates:intersection}});
      affectedParts.push(intersection);
    }catch(error){warn(nc,error.message);}
    finally{onProgress(++processed,groups.size);}
  }
  let union=null,unionFailed=false;
  try{union=unionBatches(affectedParts);}catch(error){unionFailed=true;warn(null,`No se pudo disolver la cobertura; su superficie unida queda desconocida: ${error.message}`);}
  const sourceEvaluated=queryPlanComplete||snapshot.metadata?.routes?.[routeId]?.evaluated===true||groups.size>0;
  const complete=warnings.length===0&&queryPlanComplete&&supportVerified&&sourceEvaluated&&snapshot.metadata?.analysis_complete!==false;
  const routes=Object.fromEntries(ROUTES.map(id=>[id,{evaluated:id===routeId,analysis_complete:id===routeId&&complete,coverage_status:'unknown',union_status:id===routeId?(unionFailed?'failed':'complete'):'not_evaluated',query_scope:'recorte dentro de las intersecciones del corredor de apoyo disponible en el snapshot',parcel_count:id===routeId&&sourceEvaluated?features.length:null,affected_sum_m2:id===routeId&&sourceEvaluated?features.reduce((sum,f)=>sum+f.properties.affected_m2,0):null,covered_union_m2:id===routeId&&sourceEvaluated&&!unionFailed?(union?areaWGS84(union):0):null}]));
  return{type:'FeatureCollection',features,metadata:{analysis:'intersección en longitud/latitud; áreas elipsoidales WGS84; denominador parcelario original preservado',analysis_geometry:'snapshot_support_intersections_clipped_to_selected_buffer',snapshot_clip_scope:'within_snapshot_support_corridor',custom_buffer_coverage_status:supportVerified?'within_snapshot_support':uncovered===null?'unknown':'outside_snapshot_support',support_uncovered_m2:uncovered,source_query_plan_complete:queryPlanComplete,source_support_buffer_m:sourceInfo?.support_buffer_m??snapshot.metadata?.support_buffer_m??null,source_snapshot_evaluated:sourceEvaluated,source_snapshot_fetched_at:typeof snapshot.metadata?.fetched_at==='string'?snapshot.metadata.fetched_at:'unknown',source_date:'unknown',official_coverage_confirmed:false,coverage_status:'unknown',owner_available:false,selected_route_id:routeId,selected_revision:revision??null,study_scope:'selected_study_buffer_from_snapshot',analysis_complete:complete,warnings,routes}};
}

export const clipSnapshot=clipParcelSnapshot;
