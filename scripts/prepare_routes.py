"""Deriva exclusivamente los tramos documentados. No cierra enlaces ausentes."""
import argparse, collections, hashlib, json, math, pathlib, xml.etree.ElementTree as ET
from shapely.geometry import LineString, Point, mapping
from shapely.geometry.polygon import orient
from shapely.ops import transform, substring, unary_union
from pyproj import Transformer, CRS, Geod, Proj

ROOT=pathlib.Path(__file__).resolve().parents[1]
NS={'k':'http://www.opengis.net/kml/2.2'}
GEOD=Geod(ellps='WGS84')
JOIN_TOLERANCE_M=1.0
AREA_BOUNDARY_STEP_M=500
ANALYSIS_BOUNDARY_STEP_M=100

def geodesic_area_m2(geometry):
    """Ellipsoidal area, preserving holes and independent of input ring winding.

    Each exterior is counterclockwise and each interior clockwise before the
    signed Geod calculation. Absolute value is applied per polygon, never to
    each ring: holes must subtract, including in a MultiPolygon.
    """
    if geometry.is_empty:
        return 0.0
    if geometry.geom_type=='Polygon':
        return abs(GEOD.geometry_area_perimeter(orient(geometry, sign=1.0))[0])
    if geometry.geom_type=='MultiPolygon':
        return sum(geodesic_area_m2(part) for part in geometry.geoms)
    raise ValueError('El área requiere Polygon o MultiPolygon')

def geodesic_gap_m(a,b):
    return GEOD.inv(a[0],a[1],b[0],b[1])[2]

def prepare(source):
    root=ET.parse(source).getroot(); features={}; points={}
    for p in root.findall('.//k:Placemark',NS):
        name=p.findtext('k:name',namespaces=NS) or ''
        for tag,target in [('LineString',features),('Point',points)]:
            for el in p.findall('.//k:'+tag,NS):
                coords=[tuple(map(float,s.split(',')))[:2] for s in el.findtext('k:coordinates',namespaces=NS).split()]
                target.setdefault(name,[]).append(LineString(coords) if tag=='LineString' else Point(coords[0]))
    metric=CRS.from_proj4('+proj=aeqd +lat_0=-35.5 +lon_0=-67.5 +datum=WGS84 +units=m +no_defs')
    projection=Proj(metric)
    forward=Transformer.from_crs(4326,metric,always_xy=True).transform
    backward=Transformer.from_crs(metric,4326,always_xy=True).transform
    projected=lambda name:transform(forward,features[name][0])
    def to_station(name,station):
        line=projected(name); point=transform(forward,points[station][0]); return substring(line,0,line.project(point))
    line47=projected('Div 47: Monte Comán - Pedro Vargas - San Rafael')
    line48=projected('Div 48: Pedro Vargas - Malargüe')
    line46=projected('Div 46: Lencinas - Guadales - San Rafael')
    line50=projected('Div 50: Monte Comán - Colonia General Alvear Norte')
    bardas=projected('Malargüe - Bardas Blanca')
    specs=[
      ('T1','T1-01','Realicó – Bowen – Colonia Alvear Norte','Realicó - Bowen - Colonia Alvear','referencia_ferroviaria',None),
      ('T1','T1-02','Colonia Alvear – Carmensa','Colonia Alvear - Carmensa','referencia_ferroviaria',to_station('Colonia Alvear - Carmensa','Carmensa KM 908.2')),
      ('T1','T1-03','RP 190 – RP 180','TRAZA 1 RP 190 - 180','proyectada_sobre_ruta',None),
      ('T1','T1-04','RP 180 – Pata Mora','TRAZA 1 RP 180','proyectada_sobre_ruta',None),
      ('T2','T2-01','Malargüe – Pata Mora','TRAZA 2 - Malargüe Pata Mora','aproximada',None),
      ('T2','T2-02','Pata Mora – Potasio Río Colorado','TRAZA 2 - Pata Mora Potasio Río Colorado','aproximada',None),
      ('T3','T3-01','Lencinas – empalme norte','Div 46: Lencinas - Guadales - San Rafael','referencia_ferroviaria',substring(line46,0,line46.project(Point(line50.coords[0])))),
      ('T3','T3-02','Empalme norte – Monte Comán','Div 50: Monte Comán - Colonia General Alvear Norte','referencia_ferroviaria',substring(line50,0,line50.project(Point(line47.coords[0])))),
      ('T3','T3-03','Monte Comán – Iselín – Pedro Vargas','Div 47: Monte Comán - Pedro Vargas - San Rafael','referencia_ferroviaria',substring(line47,0,line47.project(Point(line48.coords[0])))),
      ('T3','T3-04','Pedro Vargas – Malargüe','Div 48: Pedro Vargas - Malargüe','referencia_ferroviaria',substring(line48,0,line48.project(Point(bardas.coords[0])))),
      ('T3','T3-05','Malargüe – Bardas Blancas','Malargüe - Bardas Blanca','referencia_ferroviaria',None),
    ]
    colors={'T1':'#e45b61','T2':'#ed9a35','T3':'#3985ef'}
    routes=[]; buffers=[]; analysis_buffers=[]; meta={}; geom={}
    for rid,sid,name,original,quality,cut in specs:
        line=cut if cut is not None else projected(original)
        ll=transform(backward,line); coords=list(ll.coords)
        length=GEOD.line_length(*zip(*coords))/1000
        source_coords=list(features[original][0].coords)
        props={'route_id':rid,'segment_id':sid,'name':name,'source_name':original,'quality':quality,'color':colors[rid],'length_km':round(length,4),'trimmed':cut is not None,'source_vertex_count':len(source_coords),'source_max_edge_km':round(max(geodesic_gap_m(a,b) for a,b in zip(source_coords,source_coords[1:]))/1000,4),'mining_design_verified':False}
        routes.append({'type':'Feature','properties':props,'geometry':mapping(ll)})
        geom[sid]=line
    names={'T1':'Sarmiento · Carmensa · Pata Mora','T2':'Malargüe · Pata Mora · Potasio Río Colorado','T3':'Lencinas · Monte Comán · Bardas Blancas'}
    for rid in colors:
        selected=[f for f in routes if f['properties']['route_id']==rid]
        corridor=unary_union([geom[f['properties']['segment_id']].buffer(100,quad_segs=16) for f in selected])
        # Integrate the actual projected-buffer boundary on the ellipsoid.
        # Densification prevents a long projected straight edge from being
        # reinterpreted as a single different geodesic when measuring area.
        area=geodesic_area_m2(transform(backward,corridor.segmentize(AREA_BOUNDARY_STEP_M)))/10000
        gaps=[]
        for a,b in zip(selected,selected[1:]):
            sa=a['properties']['segment_id'];sb=b['properties']['segment_id']
            gap=geodesic_gap_m(a['geometry']['coordinates'][-1],b['geometry']['coordinates'][0])
            gaps.append({'from':sa,'to':sb,'distance_m':round(gap,3),'status':'revisar' if gap>JOIN_TOLERANCE_M else 'proximidad_sin_ajuste'})
        connected=all(g['status']=='proximidad_sin_ajuste' for g in gaps)
        # This is a check of adjacent source endpoints only, not railway design.
        meta[rid]={'id':rid,'name':names[rid],'color':colors[rid],'length_km':round(sum(GEOD.line_length(*zip(*f['geometry']['coordinates'])) for f in selected)/1000,3),'corridor_ha':round(area,3),'segment_count':len(selected),'gaps':gaps,'join_tolerance_m':JOIN_TOLERANCE_M,'topology_status':'connected_within_tolerance' if connected else 'disconnected','parcel_count':None,'affected_parcel_ha':None,'elevation_status':'not_processed','complete_itinerary':False,'railway_design_status':'not_verified'}
        # La simplificación se usa sólo para mostrar; las áreas se calculan sobre el buffer íntegro.
        buffers.append({'type':'Feature','properties':{'route_id':rid,'color':colors[rid],'corridor_ha':round(area,3),'width_each_side_m':100,'display_tolerance_m':2},'geometry':mapping(transform(backward,corridor.simplify(2,preserve_topology=True)))})
        # Full union for cadastral intersections. Densification adds vertices
        # without changing the planar boundary; it is not simplification.
        analysis_buffers.append({'type':'Feature','properties':{'route_id':rid,'area_ha':round(area,3),'tolerance':0,'simplification_tolerance_m':0,'boundary_max_step_m':ANALYSIS_BOUNDARY_STEP_M,'width_each_side_m':100,'area_method':'WGS84 ellipsoidal'},'geometry':mapping(transform(backward,corridor.segmentize(ANALYSIS_BOUNDARY_STEP_M)))})
    stations=[]
    wanted=['Monte Comán KM 12.1 / 704.6','Rodolfo Iselín KM 14.5','Pedro Vargas KM 68.5/0.0','Malargüe KM 178.4','Carmensa KM 908.2']
    for name in wanted:stations.append({'type':'Feature','properties':{'name':name},'geometry':mapping(points[name][0])})
    # Bound local scale over every selected vertex and intermediate points.
    # Values describe this projection, not source positional accuracy.
    scales=[]
    for line in geom.values():
        for lon,lat in transform(backward,line.segmentize(10000)).coords:
            factors=projection.get_factors(lon,lat)
            scales.extend([factors.tissot_semimajor,factors.tissot_semiminor])
    manifest={'schema_version':1,'source':'TRAZAS.kml','source_sha256':hashlib.sha256(pathlib.Path(source).read_bytes()).hexdigest(),'source_placemarks':len(root.findall('.//k:Placemark',NS)),'generated_date':'2026-10-19','analysis_crs':metric.to_string(),'length_method':'WGS84 geodesic','area_method':'WGS84 ellipsoidal; oriented polygons with holes; projected boundary densified before inverse projection','area_boundary_step_m':AREA_BOUNDARY_STEP_M,'buffer_method':'planar AEQD; nominal distance in analysis CRS','buffer_projection_scale_sampled':{'min':round(min(scales),9),'max':round(max(scales),9),'max_sample_spacing_m':10000},'buffer_m':100,'buffer_end_cap':'round','routes':meta,'notices':['Tres propuestas con extremos distintos; no existe clasificación automática de óptimo.','Corredor de estudio nominal de 200 m de ancho en AEQD; no es superficie de expropiación.','Las áreas son elipsoidales WGS84; el buffer proyectado tiene una pequeña distorsión local de escala documentada.','No se cerraron huecos ni se confirmó el estado operativo de las vías.','La proximidad de extremos a 1 m no acredita continuidad operativa ni diseño ferroviario.','T1 incluye referencia interprovincial: el parcelario de Mendoza no cubre todo ese itinerario.','No existen datos parcelarios ni elevaciones precalculadas en esta versión.']}
    out=ROOT/'public/data';out.mkdir(parents=True,exist_ok=True)
    for filename,content in [('routes.geojson',{'type':'FeatureCollection','features':routes}),('corridors.geojson',{'type':'FeatureCollection','features':buffers}),('corridors-analysis.geojson',{'type':'FeatureCollection','features':analysis_buffers}),('stations.geojson',{'type':'FeatureCollection','features':stations}),('manifest.json',manifest)]:
        (out/filename).write_text(json.dumps(content,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print(json.dumps(meta,ensure_ascii=False,indent=2))
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('kml');prepare(p.parse_args().kml)
