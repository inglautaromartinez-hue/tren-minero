"""Complete, bounded public-WFS candidate census for all documented corridors.

Raw WFS responses and all intermediate/full parcel geometries remain private.
No owner, CUIT or private source field is requested.
"""
from __future__ import annotations
import concurrent.futures as futures
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import threading
import sys
import subprocess
import time
import urllib.request
import xml.etree.ElementTree as ET
from collections import defaultdict

from pyproj import Geod
from shapely.geometry import shape, mapping
from shapely.ops import unary_union, transform
from shapely.prepared import prep
from pyproj import Transformer
from intersect_parcels import BUFFER_CRS
from shapely.strtree import STRtree
from fetch_wfs_parcels import PublicWfs, fetch, WfsError, local_name, exception_check, decode_json, geometry_bounds, bbox_parameter
from prepare_routes import geodesic_area_m2

ROOT=Path(__file__).resolve().parents[1]
PRIVATE=ROOT/'data/private/census'
GEOD=Geod(ellps='WGS84')
LAYERS=[f'geonode:a__LGS_GRP_oct_{name}' for name in ['GENERAL_ALVEAR','LA_PAZ','MALARGUE','SANTA_ROSA','SAN_RAFAEL']]
IDS=['T1','T2','T3']
ENDPOINT='https://geonode-cam.marketsis.com.ar/geoserver/wfs'


def dump(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    temporary=path.with_suffix(path.suffix+'.tmp')
    temporary.write_text(json.dumps(value,ensure_ascii=False,allow_nan=False,separators=(',',':')),encoding='utf8')
    temporary.replace(path)


def transport(url):
    req=urllib.request.Request(url,headers={'User-Agent':'LAUGIS-public-corridor-census/1.0','Accept':'application/json,application/xml,text/xml'})
    with urllib.request.urlopen(req,timeout=90) as response:
        if response.status!=200:raise WfsError(f'HTTP {response.status}')
        body=response.read()
    target=PRIVATE/'http'/f'{hashlib.sha256(url.encode()).hexdigest()}.body'
    target.parent.mkdir(parents=True,exist_ok=True)
    # Last response for a repeated total probe is retained; do not cache reads.
    target.write_bytes(body)
    return body


def overlap(a,b):return a[0]<=b[2] and a[2]>=b[0] and a[1]<=b[3] and a[3]>=b[1]


def layer_extents(xml):
    root=exception_check(xml);result={}
    for el in root.iter():
        if local_name(el.tag)!='FeatureType':continue
        name=next((child.text for child in el if local_name(child.tag)=='Name'),None)
        if name not in LAYERS:continue
        box=next((child for child in el if local_name(child.tag)=='LatLongBoundingBox'),None)
        if box is None:raise WfsError(f'No hay bbox geográfico publicado para {name}.')
        result[name]=[float(box.attrib[key]) for key in ['minx','miny','maxx','maxy']]
    if set(result)!=set(LAYERS):raise WfsError('Falta alguna capa permitida en GetCapabilities.')
    return result


def chunks(coords,length_m=10000):
    """Split real geodesic edges, retaining source vertices and no gap bridges."""
    if len(coords)<2:return
    current=[coords[0][:2]];covered=0
    for raw in coords[1:]:
        destination=raw[:2];start=current[-1]
        azimuth,_,remaining=GEOD.inv(*start,*destination)
        if remaining<=1e-7:continue
        while covered+remaining>length_m+1e-7:
            take=length_m-covered
            x,y,_=GEOD.fwd(*start,azimuth,take)
            point=[x,y];current.append(point);yield current
            current=[point];covered=0;start=point
            azimuth,_,remaining=GEOD.inv(*start,*destination)
        current.append(destination);covered+=remaining
    if len(current)>1:yield current


def padded_bbox(coords,padding=200):
    # Dense geodesic samples plus cardinal offsets enclose curved edges and
    # include >=200m around the line, exceeding the nominal 100m study width.
    points=[]
    for a,b in zip(coords,coords[1:]):
        az,_,distance=GEOD.inv(*a,*b);count=max(1,math.ceil(distance/500))
        for i in range(count):
            x,y,_=GEOD.fwd(*a,az,distance*i/count);points.append([x,y])
    points.append(coords[-1]);expanded=[]
    for point in points:
        expanded.append(point)
        for az in [0,90,180,270]:
            x,y,_=GEOD.fwd(*point,az,padding);expanded.append([x,y])
    return [min(p[0] for p in expanded),min(p[1] for p in expanded),max(p[0] for p in expanded),max(p[1] for p in expanded)]


class CachedCatalogWfs(PublicWfs):
    def __init__(self,names,schemas):
        super().__init__(ENDPOINT,transport=transport);self.names=names;self.schemas=schemas
    def capabilities(self):return self.names
    def describe(self,name):return self.schemas[name]


def fetch_single_query(client,job):
    """One response is sufficient when its verified total fits in that page."""
    layer=job['layer'];bbox=job['bbox'];schema=client.describe(layer)
    for field in ['the_geom','NOMENCLATU','fid_1']:
        if field not in schema:raise WfsError('No están publicados los campos explícitos requeridos.')
    if schema['NOMENCLATU'].split(':')[-1]!='string':raise WfsError('NC no textual en esquema público.')
    native=job.get('native_crs','EPSG:22172')
    to_native=Transformer.from_crs(4326,native,always_xy=True)
    to_wgs=Transformer.from_crs(native,4326,always_xy=True)
    native_bounds=to_native.transform_bounds(*bbox,densify_pts=21)
    allowed=to_wgs.transform_bounds(*native_bounds,densify_pts=21)
    allowed=[allowed[0]-1e-7,allowed[1]-1e-7,allowed[2]+1e-7,allowed[3]+1e-7]
    start=0;expected=None;seen=set();features=[];extras=0;outside_envelope=0;maximum_extra_m=0
    while True:
        page=decode_json(client.get(request='GetFeature',typeName=layer,outputFormat='application/json',srsName='EPSG:4326',bbox=bbox_parameter(bbox,'EPSG:4326'),propertyName='the_geom,NOMENCLATU',sortBy='fid_1',maxFeatures=500,startIndex=start))
        crs=(page.get('crs') or {}).get('properties',{}).get('name','EPSG:4326')
        if not (crs.endswith('4326') or crs.endswith('CRS84')):raise WfsError('CRS GeoJSON no es WGS84 XY.')
        raw=page.get('totalFeatures');total=int(raw) if isinstance(raw,(int,str)) and not isinstance(raw,bool) and str(raw).isdigit() else -1
        items=page.get('features')
        if page.get('type')!='FeatureCollection' or total<0 or not isinstance(items,list):raise WfsError('Respuesta/total GeoJSON inválidos.')
        if total>100000:raise WfsError('Consulta demasiado amplia para un corredor; revisar filtro bbox.')
        if expected is None:expected=total
        if total!=expected:raise WfsError('Total cambió entre páginas.')
        if len(items)>500 or start+len(items)>total or (not items and start<total):raise WfsError('Página truncada o incoherente.')
        if page.get('numberReturned') is not None and page['numberReturned']!=len(items):raise WfsError('numberReturned incoherente.')
        for f in items:
            fid=f.get('id');props=f.get('properties') or {};nc=props.get('NOMENCLATU')
            if not isinstance(fid,(str,int)) or isinstance(fid,bool) or not str(fid):raise WfsError('Identificador estable ausente.')
            fid=str(fid)
            if fid in seen:raise WfsError('Identificador repetido entre páginas.')
            if not isinstance(nc,str) or not nc.strip():raise WfsError('NC ausente o no textual.')
            bounds=geometry_bounds(f.get('geometry'))
            if not overlap(bounds,bbox):extras+=1
            if not overlap(bounds,allowed):
                outside_envelope+=1
                x1=max(allowed[0],min(allowed[2],(bounds[0]+bounds[2])/2));y1=max(allowed[1],min(allowed[3],(bounds[1]+bounds[3])/2))
                x2=max(bounds[0],min(bounds[2],x1));y2=max(bounds[1],min(bounds[3],y1))
                _,_,extra=GEOD.inv(x1,y1,x2,y2);maximum_extra_m=max(maximum_extra_m,extra)
                if extra>2000:raise WfsError('Geometría remota excede ampliamente la envolvente reproyectada; revisar filtro bbox.')
            seen.add(fid);features.append({'type':'Feature','id':layer+':'+fid,'properties':{'nc':nc.strip(),'source_layer':layer,'source_feature_id':fid},'geometry':f['geometry']})
        start+=len(items)
        if start==expected:break
    strategy='single_response_total_verified' if expected<=500 else 'paged_total_ids_and_postprobe_verified'
    if expected>500 and client.hits(layer,bbox,'EPSG:4326',['the_geom','NOMENCLATU'],'fid_1')!=expected:raise WfsError('El total cambió después de paginar.')
    return {'type':'FeatureCollection','features':features,'metadata':{'source':'public_wfs','endpoint':ENDPOINT,'fetched_at':datetime.now(timezone.utc).isoformat(),'source_date':'unknown','source_crs':'EPSG:4326','axis_order':'XY_longitude_latitude','complete_download':True,'strategy':strategy,'native_crs':native,'outside_requested_bbox_candidates':extras,'outside_roundtrip_envelope_candidates':outside_envelope,'max_outside_roundtrip_m':maximum_extra_m,'queries':[{'expected':expected,'received_unique':len(features),'complete':True}],'owner_requested':False}}

def query_job(job,names,schemas):
    cache=PRIVATE/'queries'/f'{job["id"]}.geojson'
    if cache.exists():
        value=json.loads(cache.read_text());meta=value.get('metadata',{})
        if all(meta.get('census_job',{}).get(k)==v for k,v in job.items() if k!='native_crs') and meta.get('complete_download') is True:return job,value,True
    for attempt in range(3):
        try:
            value=fetch_single_query(CachedCatalogWfs(names,schemas),job)
            value['metadata']['census_job']=job;dump(cache,value)
            return job,value,False
        except Exception as error:
            if attempt==2:return job,{'error':str(error),'error_type':type(error).__name__},False
            time.sleep(attempt+1)


def polygonal(geometry):
    if geometry.is_empty:return None
    if geometry.geom_type in {'Polygon','MultiPolygon'}:return geometry
    if geometry.geom_type=='GeometryCollection':
        parts=[polygonal(p) for p in geometry.geoms];parts=[p for p in parts if p is not None]
        return unary_union(parts) if parts else None
    return None


def publish_derived(candidates,query_results,plan,conflicts):
    """Public 125m support only; statistics strictly from the actual 100m buffer."""
    fetched=datetime.now(timezone.utc).isoformat()
    source=json.loads((ROOT/'data/private/census-buffers.geojson').read_text())
    buffers={(f['properties']['route_id'],f['properties']['buffer_m']):shape(f['geometry']) for f in source['features']}
    projected=Transformer.from_crs(4326,BUFFER_CRS,always_xy=True).transform
    geographic=Transformer.from_crs(BUFFER_CRS,4326,always_xy=True).transform
    public=ROOT/'public/data';index={'schema_version':1,'source_label':'IDECAM · WFS parcelario público','endpoint':ENDPOINT,'fetched_at':fetched,'source_date':'unknown','support_buffer_m':125,'study_buffer_m':100,'coverage_status':'unknown','owner_available':False,'routes':{}}
    all_excluded=[];all_source_warnings=[]
    for rid in IDS:
        corridor=buffers[(rid,100)];support=buffers[(rid,125)];prepared=prep(support)
        grouped=defaultdict(list);layers=defaultdict(set);excluded=[];incomplete_ncs=set();source_warnings=[]
        for feature in candidates[rid].values():
            nc=feature['properties']['nc'];geometry=shape(feature['geometry'])
            if geometry.is_empty or not geometry.is_valid or geometry.geom_type not in {'Polygon','MultiPolygon'}:
                issue={'route_id':rid,'nc':nc,'source_id':feature['id'],'reason':'invalid_or_empty_source_geometry','envelope_intersects_support':not geometry.is_empty and geometry.envelope.intersects(support)}
                if not issue['envelope_intersects_support']:issue['impact_test']='source_envelope_disjoint_from_support_125m'
                source_warnings.append(issue);incomplete_ncs.add(nc)
                if issue['envelope_intersects_support']:excluded.append(issue)
                continue
            grouped[nc].append(geometry);layers[nc].add(feature['properties']['source_layer'])
        support_features=[];actual_features=[];outline_features=[];covered=[];area_sum=0
        for nc,parts in grouped.items():
            parcel=unary_union(parts)
            if nc in incomplete_ncs:
                if prepared.intersects(parcel):excluded.append({'route_id':rid,'nc':nc,'reason':'incomplete_original_nc_due_to_invalid_source_part'})
                continue
            if not parcel.is_valid or parcel.is_empty:
                excluded.append({'route_id':rid,'nc':nc,'reason':'invalid_union'});continue
            if not prepared.intersects(parcel):continue
            support_clip=polygonal(parcel.intersection(support))
            if support_clip is None:continue
            support_area=geodesic_area_m2(support_clip)
            if support_area<=0.01:continue
            parcel_area=geodesic_area_m2(parcel)
            if not math.isfinite(parcel_area) or parcel_area<=0:
                excluded.append({'route_id':rid,'nc':nc,'reason':'non_positive_original_parcel_area'});continue
            properties={'route_id':rid,'nc':nc,'parcel_m2':round(parcel_area,3),'support_m2':round(support_area,3),'source_layers':sorted(layers[nc]),'source_date':'unknown'}
            support_features.append({'type':'Feature','properties':properties,'geometry':mapping(support_clip)})
            actual=polygonal(parcel.intersection(corridor))
            if actual is None:continue
            actual_area=geodesic_area_m2(actual)
            if actual_area<=0.01:continue
            if actual_area>parcel_area*1.00001:raise ValueError('Área afectada mayor que la parcela original.')
            area_sum+=actual_area;covered.append(actual)
            actual_features.append({'type':'Feature','properties':{'route_id':rid,'nc':nc,'parcel_m2':round(parcel_area,3),'affected_m2':round(actual_area,3),'affected_pct':round(min(100,100*actual_area/parcel_area),6),'source_layers':sorted(layers[nc]),'source_date':'unknown'},'geometry':mapping(actual)})
            # Full extent only as a deliberately generalized drawing, never used
            # as an analysis operand or denominator in the browser.
            generalized=transform(geographic,transform(projected,parcel).simplify(2,preserve_topology=True))
            outline_features.append({'type':'Feature','properties':{'nc':nc},'geometry':mapping(generalized)})
        union=unary_union(covered)
        union_area=geodesic_area_m2(union) if not union.is_empty else 0
        corridor_area=geodesic_area_m2(corridor)
        jobs=[j for j in plan['jobs'] if j['route_id']==rid];queries=[q for q in query_results if q['route_id']==rid]
        complete=len(queries)==len(jobs) and all(q.get('complete') for q in queries)
        route_conflicts=[item for item in conflicts if item['route_id']==rid]
        summary={'evaluated':True,'status':'complete_public_queries' if complete and not excluded and not route_conflicts else 'partial','query_plan_complete':complete,'queries_planned':len(jobs),'queries_complete':sum(q.get('complete',False) for q in queries),'queries_failed':sum(not q.get('complete') for q in queries),'candidate_count':len(candidates[rid]),'support_nc_count':len(support_features),'parcel_count':len(actual_features),'affected_sum_m2':round(area_sum,3),'covered_union_m2':round(union_area,3),'corridor_m2':round(corridor_area,3),'uncovered_m2':round(max(0,corridor_area-union_area),3),'coverage_pct':round(union_area/corridor_area*100,6),'overlap_excess_m2':round(max(0,area_sum-union_area),3),'excluded_records':len(excluded),'excluded_analysis_records':len(excluded),'source_geometry_warnings':len(source_warnings),'non_contributing_source_issues':sum(not issue['envelope_intersects_support'] for issue in source_warnings),'source_conflicts':len(route_conflicts),'coverage_status':'unknown','source_date':'unknown','outside_allowed_layer_extents_chunks':sum(not p['layers'] for p in plan['chunks'] if p['route_id']==rid),'url':f'/data/parcel-census-{rid}.geojson','analysis_url':f'/data/parcel-analysis-{rid}.geojson','outlines_url':f'/data/parcel-outlines-{rid}.geojson','query_scope':'all_planned_bbox_queries_for_full_route_on_allowed_public_layers'}
        metadata={'schema_version':1,'route_id':rid,'source_label':'IDECAM · WFS parcelario público','endpoint':ENDPOINT,'fetched_at':fetched,'source_date':'unknown','query_plan_complete':complete,'coverage_status':'unknown','analysis_complete':not excluded and not route_conflicts,'source_geometry_warnings':len(source_warnings),'non_contributing_source_issues':sum(not issue['envelope_intersects_support'] for issue in source_warnings),'support_buffer_m':125,'support_geometry':mapping(support),'study_buffer_m':100,'geometry_scope':'public_parcels_intersected_with_125m_support_only','parcel_m2_basis':'full_original_public_parcel_dissolved_by_nc_WGS84_ellipsoidal','area_method':'WGS84 ellipsoidal geodesic_area_m2; oriented polygon holes','buffer_method':'WGS84 nominal geodesic strips <=500m, 64-sided round caps; dissolved by route','stats_100m':summary,'owner_available':False,'owner_requested':False,'privacy':'derived_public_nc_areas_support_geometry_no_owner_or_cuit'}
        dump(public/f'parcel-census-{rid}.geojson',{'type':'FeatureCollection','metadata':metadata,'features':support_features})
        dump(public/f'parcel-outlines-{rid}.geojson',{'type':'FeatureCollection','metadata':{'route_id':rid,'fetched_at':fetched,'source_label':'IDECAM · WFS parcelario público','visual_only':True,'simplification_m':2,'simplification_crs':BUFFER_CRS.to_string(),'analysis_allowed':False,'scope':'generalized_full_outlines_only_for_nc_affected_by_100m_buffer'},'features':outline_features})
        dump(PRIVATE/f'intersections-100m-{rid}.geojson',{'type':'FeatureCollection','metadata':metadata,'features':actual_features})
        ready_metadata={'schema_version':1,'route_id':rid,'source_label':index['source_label'],'endpoint':ENDPOINT,'fetched_at':fetched,'source_date':'unknown','query_plan_complete':complete,'analysis_complete':not excluded and not route_conflicts,'study_buffer_m':100,'geometry_scope':'prepared_full_route_100m_intersections','coverage_status':'unknown','area_method':'WGS84 ellipsoidal geodesic_area_m2; full original parcel denominator','owner_available':False,'routes':{rid:summary}}
        # Prepared analytical intersections are derivatives, not source parcels.
        # Full-route UI loads these directly; 125m support is for custom cuts.
        dump(public/f'parcel-analysis-{rid}.geojson',{'type':'FeatureCollection','metadata':ready_metadata,'features':actual_features})
        index['routes'][rid]=summary;all_excluded.extend(excluded);all_source_warnings.extend(source_warnings)
    index['query_plan_complete']=all(r['query_plan_complete'] for r in index['routes'].values())
    index['analysis_complete']=all(r['status']=='complete_public_queries' for r in index['routes'].values())
    dump(public/'parcel-census.json',index);dump(PRIVATE/'public-derivative-exclusions.json',all_excluded);dump(PRIVATE/'source-geometry-warnings.json',all_source_warnings)
    return index


def finalize_from_private():
    if not (ROOT/'data/private/census-buffers.geojson').exists():
        subprocess.run(['node',str(ROOT/'scripts/prepare_census_buffers.mjs')],cwd=ROOT,check=True)
    plan=json.loads((PRIVATE/'query-plan.json').read_text());status=json.loads((PRIVATE/'query-status.json').read_text())
    candidates={rid:{f['id']:f for f in json.loads((PRIVATE/f'candidates-{rid}.geojson').read_text())['features']} for rid in IDS}
    result=publish_derived(candidates,status['results'],plan,status.get('conflicts',[]))
    summary=result['routes'];source_hash=plan['source_sha256']
    report='# Revisión del censo parcelario público\n\nFuente: **IDECAM, servicio WFS público**, '+ENDPOINT+'. Fecha de consulta/compilación: '+result['fetched_at']+'. Fecha de actualización catastral: desconocida. No se solicitaron CUIT ni titulares.\n\nSe completó el plan previsto: '+str(sum(r['queries_complete'] for r in summary.values()))+'/'+str(len(plan['jobs']))+' consultas. El plan contiene '+str(len(plan['chunks']))+' piezas geodésicas de hasta 10 km sin unir huecos, con 200 m de margen y muestras cada 500 m para envolver los arcos. Las cinco capas permitidas se eligen por intersección con sus LatLongBoundingBox publicadas. Cuatro hilos; respuesta única autocontenida si totalFeatures entero coincide con el número de entidades (máximo 500); si se pagina, totales estables, IDs únicos y sonda final. Orden estable fid_1; únicamente the_geom,NOMENCLATU. Las capas nativas EPSG:22172 pueden devolver candidatas fuera del bbox WGS84 por la envolvente reproyectada; se registran y conservan, verificando CRS y coordenadas, y se recortan exactamente después. Respuestas originales seleccionadas, geometrías parcelarias completas e identificadores estables se conservan sólo en data/private/census.\n\n## Geometría y áreas\n\nLos buffers utilizados son los geodésicos nominales WGS84 de data/private/census-buffers.geojson: tiras de hasta 500 m y círculos de 64 lados, disueltos sin puentes por propuesta. Se mide superficie elipsoidal WGS84, conservando orientación y huecos. Las parcelas se disuelven por NC antes de medir su superficie completa.\n\nEl snapshot público contiene solamente **parcela ∩ soporte de 125 m**, con parcel_m2 calculado desde la parcela original completa y support_m2 para el recorte auxiliar. No se lo presenta como superficie afectada. El visor vuelve a intersectar ese apoyo con el buffer efectivo de 100 m. El índice informa las estadísticas verdaderas de 100 m. Cada analysis_url apunta a parcel-analysis-T1/T2/T3.geojson: intersecciones de100m ya calculadas, con NC, denominador original y superficies. La vista general las carga directamente sin recalcular polígonos en el navegador; el apoyo125m queda para selecciones personalizadas. El margen de 25 m facilita recortes consistentes; una selección fuera del soporte requiere nueva consulta WFS.\n\nLos contornos completos se publican exclusivamente como dibujos generalizados con tolerancia de 2 m en AEQD y atributos NC. Están marcados visual_only y nunca se usan como denominador ni geometría analítica. No se publican originales WFS, nombres, CUIT ni archivos de descarga.\n\n| Propuesta | Consultas completas | Candidatas | NC afectadas 100 m | Suma m² | Unión cubierta m² | Cobertura geométrica % | Estado |\n|---|---:|---:|---:|---:|---:|---:|---|\n'+'\n'.join(f'| {rid} | {r["queries_complete"]}/{r["queries_planned"]} | {r["candidate_count"]} | {r["parcel_count"]} | {r["affected_sum_m2"]} | {r["covered_union_m2"]} | {r["coverage_pct"]} | {r["status"]} |' for rid,r in summary.items())+'\n\nCompletar el plan de consultas no acredita cobertura catastral oficial: coverage_status permanece unknown. La superficie residual no equivale a terreno sin propietario. T1 contiene recorridos fuera de las extensiones de estas capas y fuera de Mendoza. Geometrías inválidas o cambios de una misma entidad entre consultas se registran explícitamente y condicionan el estado de revisión.\n\nHash interno de los ejes: '+source_hash+'\n\nReproducir descarga: python scripts/prepare_route_parcels.py. Reanalizar sin red usando descargas privadas: python scripts/prepare_route_parcels.py --analyze-only.\n'
    report+='\nIncidencias geométricas de la fuente fuera del soporte: '+str(sum(r.get('non_contributing_source_issues',0) for r in summary.values()))+'. Sus envolventes son disjuntas del soporte de125m, no tienen otras partes válidas de la misma NC y no afectan numerador ni denominador. Permanecen registradas en data/private/census/source-geometry-warnings.json. Exclusiones que sí condicionan el análisis: '+str(sum(r['excluded_records'] for r in summary.values()))+'.\n'
    report+='\nHash interno buffer100/125: '+hashlib.sha256((ROOT/'data/private/census-buffers.geojson').read_bytes()).hexdigest()+'\n'
    report+='El índice público no contiene hashes internos. La auditoría independiente del plan comprobó que las envolventes cubren todo el soporte de125m y, por cada capa, su intersección con la extensión publicada.\n'
    (ROOT/'docs/REVISION_CENSO_PARCELARIO.md').write_text(report,encoding='utf8')
    print(json.dumps({'status':'public_derivatives_ready','routes':summary,'query_plan_complete':result['query_plan_complete'],'analysis_complete':result['analysis_complete']},ensure_ascii=False),flush=True)
    return result

def main():
    if '--analyze-only' in sys.argv:
        finalize_from_private();return
    start=time.time();generated=datetime.now(timezone.utc).isoformat();PRIVATE.mkdir(parents=True,exist_ok=True)
    client=PublicWfs(ENDPOINT,transport=transport)
    xml=(PRIVATE/'capabilities.xml').read_bytes() if (PRIVATE/'capabilities.xml').exists() else client.get(request='GetCapabilities');(PRIVATE/'capabilities.xml').write_bytes(xml)
    root_xml=exception_check(xml)
    names=[child.text for el in root_xml.iter() if local_name(el.tag)=='FeatureType' for child in el if local_name(child.tag)=='Name']
    native_crs={next(child.text for child in el if local_name(child.tag)=='Name'):next((child.text for child in el if local_name(child.tag)=='SRS'),'EPSG:22172') for el in root_xml.iter() if local_name(el.tag)=='FeatureType'}
    extents=layer_extents(xml)
    if (PRIVATE/'schemas.json').exists():schemas=json.loads((PRIVATE/'schemas.json').read_text())
    else:
        with futures.ThreadPoolExecutor(max_workers=4) as pool:schemas=dict(zip(LAYERS,pool.map(client.describe,LAYERS)))
        dump(PRIVATE/'schemas.json',schemas)
    routes=json.loads((ROOT/'public/data/routes.geojson').read_text());source_hash=hashlib.sha256((ROOT/'public/data/routes.geojson').read_bytes()).hexdigest()
    jobs=[];pieces=[]
    for feature in routes['features']:
        rid=feature['properties']['route_id'];sid=feature['properties']['segment_id']
        for index,coords in enumerate(chunks(feature['geometry']['coordinates'])):
            bbox=padded_bbox(coords);layers=[name for name,extent in extents.items() if overlap(bbox,extent)]
            chunk_id=f'{sid}-{index:03d}'
            pieces.append({'id':chunk_id,'route_id':rid,'bbox':bbox,'layers':layers})
            for layer in layers:
                key=hashlib.sha256(json.dumps([source_hash,chunk_id,layer,bbox]).encode()).hexdigest()[:20]
                jobs.append({'id':key,'route_id':rid,'segment_id':sid,'chunk_id':chunk_id,'layer':layer,'bbox':bbox,'native_crs':native_crs[layer]})
    plan={'generated_at':generated,'endpoint':ENDPOINT,'source_sha256':source_hash,'chunk_nominal_length_m':10000,'padding_m':200,'layer_extents_xy':extents,'chunks':pieces,'jobs':jobs}
    dump(PRIVATE/'query-plan.json',plan)
    print(json.dumps({'status':'planned','jobs':len(jobs),'chunks':len(pieces),'per_route':{rid:sum(job['route_id']==rid for job in jobs) for rid in IDS}},ensure_ascii=False),flush=True)
    candidates={rid:{} for rid in IDS};query_results=[];conflicts=[]
    with futures.ThreadPoolExecutor(max_workers=4) as pool:
        pending={pool.submit(query_job,job,names,schemas):job for job in jobs}
        for done,future in enumerate(futures.as_completed(pending),1):
            job,value,cached=future.result()
            if 'error' in value:
                query_results.append({**job,'complete':False,'error':value['error'],'error_type':value.get('error_type')})
            else:
                query_results.append({**job,'complete':True,'received':len(value['features']),'expected':value['metadata']['queries'][0]['expected'],'cached':cached,'strategy':value['metadata'].get('strategy','legacy_total_probes_verified'),'fetched_at':value['metadata'].get('fetched_at'),'outside_requested_bbox_candidates':value['metadata'].get('outside_requested_bbox_candidates',0)})
                for feature in value['features']:
                    old=candidates[job['route_id']].get(feature['id'])
                    if old is not None and old!=feature:
                        conflicts.append({'route_id':job['route_id'],'source_id':feature['id'],'reason':'feature_changed_between_queries'});continue
                    candidates[job['route_id']][feature['id']]=feature
            dump(PRIVATE/'query-status.json',{'planned':len(jobs),'completed':done,'results':query_results,'conflicts':conflicts})
            if done%10==0 or done==len(jobs):print(json.dumps({'status':'downloading','completed':done,'planned':len(jobs),'failures':sum(not q['complete'] for q in query_results),'elapsed_s':round(time.time()-start,1),'unique_candidates':{rid:len(candidates[rid]) for rid in IDS}}),flush=True)
    for rid in IDS:dump(PRIVATE/f'candidates-{rid}.geojson',{'type':'FeatureCollection','metadata':{'source':'public_wfs','endpoint':ENDPOINT,'source_date':'unknown','query_complete':all(q['complete'] for q in query_results if q['route_id']==rid),'source_crs':'EPSG:4326','axis_order':'XY_longitude_latitude','complete_download':all(q['complete'] for q in query_results if q['route_id']==rid),'queries':[q for q in query_results if q['route_id']==rid]},'features':list(candidates[rid].values())})
    result=finalize_from_private()
    print(json.dumps({'status':'finished','elapsed_s':round(time.time()-start,1),'routes':result['routes'],'failed_queries':sum(not q['complete'] for q in query_results)},ensure_ascii=False),flush=True)

if __name__=='__main__':main()
